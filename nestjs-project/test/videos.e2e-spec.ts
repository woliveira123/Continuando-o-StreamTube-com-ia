import { VideosService } from '../src/videos/videos.service';
import { StorageService } from '../src/storage/storage.service';
import { Video } from '../src/videos/entities/video.entity';
import type { App } from 'supertest/types';
import type { VideoResponseDto } from '../src/videos/dto/video-response.dto';
import { NestFactory } from '@nestjs/core';
import { VideoWorkerModule } from '../src/video-worker/video-worker.module';
import {
  INestApplicationContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  rm,
  mkdir,
  writeFile,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/entities/user.entity';
import { Channel } from '../src/channels/entities/channel.entity';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';

describe('Videos (e2e, real storage and worker)', () => {
  let app: INestApplication<App>;
  let worker: INestApplicationContext;
  let db: DataSource;
  let token: string;
  let other: string;
  let fixture: Buffer;
  const ids: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();
    worker = await NestFactory.createApplicationContext(VideoWorkerModule, {
      logger: false,
    });
    db = app.get(DataSource);
    for (let i = 0; i < 2; i++) {
      const id = randomUUID();
      ids.push(id);
      const email = `${id}@example.test`;
      await db
        .getRepository(User)
        .save({ id, email, password: 'unused-test-hash', is_confirmed: true });
      await db
        .getRepository(Channel)
        .save({ name: 'Video test', nickname: id, user_id: id });
      const jwt = app.get(JwtService).sign({ sub: id, email });
      if (i === 0) token = jwt;
      else other = jwt;
    }
  });
  afterAll(async () => {
    await worker?.close();
    if (db?.isInitialized) {
      for (const id of ids) {
        await db.getRepository(Channel).delete({ user_id: id });
        await db.getRepository(User).delete(id);
      }
    }
    await app?.close();
  });

  const auth = (value = token) => ({ Authorization: `Bearer ${value}` });
  const create = (size: number) =>
    request(app.getHttpServer())
      .post('/videos')
      .set(auth())
      .send({ title: 'Vídeo de teste', filename: 'sample.mp4', size });

  it('requires authentication and rejects zero/over-limit sizes', async () => {
    await request(app.getHttpServer())
      .post('/videos')
      .send({ title: 'test', filename: 'sample.mp4', size: 10 })
      .expect(401);
    await create(0).expect(400);
    await create(10_000_000_001).expect(400);
  });

  it('does not leave an unusable draft when storage initiation fails', async () => {
    const before = await db.getRepository(Video).count();
    const spy = jest
      .spyOn(app.get(StorageService), 'initiate')
      .mockRejectedValueOnce(new Error('simulated storage outage'));
    try {
      await create(100).expect(503);
      expect(await db.getRepository(Video).count()).toBe(before);
    } finally {
      spy.mockRestore();
    }
  });

  it('aborts the initiated multipart when database persistence fails', async () => {
    const storage = app.get(StorageService);
    const abort = jest.spyOn(storage, 'abort');
    try {
      await expect(
        app.get(VideosService).create(ids[0], {
          title: 'x'.repeat(201),
          filename: 'sample.mp4',
          size: 100,
        }),
      ).rejects.toThrow();
      expect(abort).toHaveBeenCalledTimes(1);
      const [key, uploadId] = abort.mock.calls[0];
      await expect(storage.listParts(key, uploadId)).rejects.toMatchObject({
        name: 'NoSuchUpload',
      });
    } finally {
      abort.mockRestore();
    }
  });

  it('creates a maximum-size draft without transferring bytes and isolates ownership', async () => {
    const response = await create(10_000_000_000).expect(201);
    const { id, status, part_count } = response.body as VideoResponseDto;
    expect(status).toBe('draft');
    expect(part_count).toBe(597);
    const persisted = await db.getRepository(Video).findOneByOrFail({ id });
    await expect(db.getRepository(Video).insert(persisted)).rejects.toThrow();
    expect(response.body).not.toHaveProperty('upload_id');
    await request(app.getHttpServer())
      .get(`/videos/${id}`)
      .set(auth(other))
      .expect(404);
    await request(app.getHttpServer())
      .post(`/videos/${id}/parts/1`)
      .set(auth(other))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/videos/${id}/stream`)
      .set(auth())
      .expect(409);
    await request(app.getHttpServer())
      .post(`/videos/${id}/complete`)
      .set(auth())
      .expect(400);
    await request(app.getHttpServer())
      .post(`/videos/${id}/parts/598`)
      .set(auth())
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/videos/${id}/upload`)
      .set(auth())
      .expect(204);
    await request(app.getHttpServer())
      .get(`/videos/${id}`)
      .set(auth())
      .expect(404);
  });

  it('resumes multipart, processes a real video and serves range/thumbnail/original download', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'streamtube-e2e-'));
    try {
      const file = join(dir, 'sample.mp4');
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=160x120:r=10',
        '-t',
        '1',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        file,
      ]);
      fixture = await readFile(file);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    const created = await create(fixture.length).expect(201);
    const { id } = created.body as VideoResponseDto;
    const signed = await request(app.getHttpServer())
      .post(`/videos/${id}/parts/1`)
      .set(auth())
      .expect(200);
    const put = await fetch((signed.body as { url: string }).url, {
      method: 'PUT',
      body: new Uint8Array(fixture),
      headers: { 'Content-Length': String(fixture.length) },
    });
    expect(put.status).toBe(200);
    const resume = await request(app.getHttpServer())
      .get(`/videos/${id}/upload`)
      .set(auth())
      .expect(200);
    expect((resume.body as { parts: { size: number }[] }).parts).toHaveLength(
      1,
    );
    expect((resume.body as { parts: { size: number }[] }).parts[0].size).toBe(
      fixture.length,
    );
    const completions = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer()).post(`/videos/${id}/complete`).set(auth()),
      ),
    );
    expect(completions.map((r) => r.status)).toEqual([202, 202]);
    let video = completions[0].body as VideoResponseDto;
    for (let i = 0; i < 90 && video.status === 'processing'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      video = (
        await request(app.getHttpServer())
          .get(`/videos/${id}`)
          .set(auth())
          .expect(200)
      ).body as VideoResponseDto;
    }
    expect(video.status).toBe('ready');
    expect(video.duration).toBeGreaterThan(0);
    expect(video.metadata?.width).toBe(160);
    await request(app.getHttpServer())
      .get(`/videos/${id}/download`)
      .set(auth(other))
      .expect(404);
    const stream = await request(app.getHttpServer())
      .get(`/videos/${id}/stream`)
      .set(auth())
      .expect(307);
    const ranged = await fetch(stream.headers.location, {
      headers: { Range: 'bytes=0-31' },
    });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-range')).toMatch(/^bytes 0-31\//);
    expect((await ranged.arrayBuffer()).byteLength).toBe(32);
    const thumbnail = await request(app.getHttpServer())
      .get(`/videos/${id}/thumbnail`)
      .set(auth())
      .expect(307);
    const thumb = await fetch(thumbnail.headers.location);
    expect(thumb.headers.get('content-type')).toBe('image/jpeg');
    expect((await thumb.arrayBuffer()).byteLength).toBeGreaterThan(100);
    const download = await request(app.getHttpServer())
      .get(`/videos/${id}/download`)
      .set(auth())
      .expect(307);
    const original = await fetch(download.headers.location);
    expect(original.headers.get('content-disposition')).toContain('attachment');
    expect(Buffer.from(await original.arrayBuffer())).toEqual(fixture);
    await request(app.getHttpServer())
      .post(`/videos/${id}/complete`)
      .set(auth())
      .expect(202);
  }, 120_000);

  it('recovers a lost storage completion acknowledgement and dispatches after worker restart', async () => {
    await worker.close();
    const video = (await create(fixture.length).expect(201))
      .body as VideoResponseDto;
    for (const route of ['upload', 'stream', 'thumbnail', 'download']) {
      await request(app.getHttpServer())
        .get(`/videos/${video.id}/${route}`)
        .set(auth(other))
        .expect(404);
    }
    for (const route of ['parts/1', 'complete', 'retry']) {
      await request(app.getHttpServer())
        .post(`/videos/${video.id}/${route}`)
        .set(auth(other))
        .expect(404);
    }
    await request(app.getHttpServer())
      .delete(`/videos/${video.id}/upload`)
      .set(auth(other))
      .expect(404);
    const signed = (
      await request(app.getHttpServer())
        .post(`/videos/${video.id}/parts/1`)
        .set(auth())
        .expect(200)
    ).body as { url: string };
    const mismatch = await fetch(signed.url, {
      method: 'PUT',
      body: Buffer.from('wrong size'),
    });
    expect(mismatch.ok).toBe(false);
    expect(
      (
        await fetch(signed.url, {
          method: 'PUT',
          body: new Uint8Array(fixture),
        })
      ).status,
    ).toBe(200);
    const stored = await db
      .getRepository(Video)
      .findOneByOrFail({ id: video.id });
    const storage = app.get(StorageService);
    const parts = await storage.listParts(
      stored.original_key,
      stored.upload_id!,
    );
    // Simulate S3 committing successfully while API dies before saving processing.
    await storage.complete(stored.original_key, stored.upload_id!, parts);
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/complete`)
      .set(auth())
      .expect(202);
    expect(
      (await db.getRepository(Video).findOneByOrFail({ id: video.id })).status,
    ).toBe('processing');
    const leftover = join(
      tmpdir(),
      `streamtube-worker-${createHash('sha256').update(video.id).digest('hex')}`,
    );
    await mkdir(leftover, { recursive: true });
    await writeFile(join(leftover, 'interrupted-download'), 'crash residue');
    worker = await NestFactory.createApplicationContext(VideoWorkerModule, {
      logger: false,
    });
    let status = 'processing';
    for (let i = 0; i < 30 && status === 'processing'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      status = (await db.getRepository(Video).findOneByOrFail({ id: video.id }))
        .status;
    }
    expect(status).toBe('ready');
    await expect(access(leftover)).rejects.toThrow();
  }, 60000);

  it('ends invalid media in error after retries and keeps it unavailable for streaming', async () => {
    const bad = Buffer.from('not a media file');
    const video = (await create(bad.length).expect(201))
      .body as VideoResponseDto;
    const signedResponse = await request(app.getHttpServer())
      .post(`/videos/${video.id}/parts/1`)
      .set(auth())
      .expect(200);
    expect(
      (
        await fetch((signedResponse.body as { url: string }).url, {
          method: 'PUT',
          body: bad,
        })
      ).status,
    ).toBe(200);
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/complete`)
      .set(auth())
      .expect(202);
    let state = 'processing';
    for (let i = 0; i < 60 && state === 'processing'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      state = (
        (
          await request(app.getHttpServer())
            .get(`/videos/${video.id}`)
            .set(auth())
            .expect(200)
        ).body as VideoResponseDto
      ).status;
    }
    expect(state).toBe('error');
    await request(app.getHttpServer())
      .get(`/videos/${video.id}/stream`)
      .set(auth())
      .expect(409);
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/retry`)
      .set(auth(other))
      .expect(404);
    await request(app.getHttpServer())
      .post(`/videos/${video.id}/retry`)
      .set(auth())
      .expect(202);
  }, 90_000);
});

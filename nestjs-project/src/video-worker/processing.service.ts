import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Video } from '../videos/entities/video.entity';
import { StorageService } from '../storage/storage.service';
import { MediaService } from './media.service';

@Injectable()
export class ProcessingService {
  constructor(
    private readonly db: DataSource,
    private readonly storage: StorageService,
    private readonly media: MediaService,
  ) {}

  async process(videoId: string, generation: number): Promise<void> {
    const runner = this.db.createQueryRunner();
    await runner.connect();
    let locked = false;
    let directory: string | undefined;
    try {
      await runner.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
        videoId,
      ]);
      locked = true;
      directory = join(
        tmpdir(),
        `streamtube-worker-${createHash('sha256').update(videoId).digest('hex')}`,
      );
      // Same video reuses its directory under the DB lock, reclaiming crash leftovers.
      await rm(directory, { recursive: true, force: true });
      const video = await runner.manager.findOneBy(Video, { id: videoId });
      if (
        !video ||
        video.status !== 'processing' ||
        video.generation !== generation
      )
        return;
      await mkdir(directory, { recursive: true });
      const input = join(directory, 'input');
      await this.storage.downloadToFile(video.original_key, input);
      const result = await this.media.process(input, directory);
      if (result.metadata.size !== video.expected_size)
        throw new Error('INVALID_SOURCE_SIZE');
      const prefix = video.original_key.slice(0, -'original'.length);
      const streamKey = `${prefix}playback-${generation}.mp4`;
      const thumbnailKey = `${prefix}thumbnail-${generation}.jpg`;
      await this.storage.uploadFile(streamKey, result.stream, 'video/mp4');
      await this.storage.uploadFile(
        thumbnailKey,
        result.thumbnail,
        'image/jpeg',
      );
      await runner.manager.update(
        Video,
        { id: videoId, generation, status: 'processing' },
        {
          status: 'ready',
          duration: result.duration,
          metadata: result.metadata,
          stream_key: streamKey,
          thumbnail_key: thumbnailKey,
          error_code: null,
        },
      );
    } finally {
      try {
        if (directory) await rm(directory, { recursive: true, force: true });
      } finally {
        try {
          if (locked)
            await runner.query(
              'SELECT pg_advisory_unlock(hashtextextended($1, 0))',
              [videoId],
            );
        } finally {
          await runner.release();
        }
      }
    }
  }
}

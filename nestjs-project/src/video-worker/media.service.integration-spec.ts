import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaService } from './media.service';

// Real subprocesses and disk IO need an integration-test timeout on Docker Desktop.
jest.setTimeout(30000);

describe('MediaService (real FFmpeg integration)', () => {
  let service: MediaService;
  let directory: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [MediaService],
    }).compile();
    service = module.get(MediaService);
  });
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'media-test-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  it('extracts real metadata and generates JPEG/faststart MP4', async () => {
    const input = join(directory, 'source.mp4');
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=160x120:r=10',
      '-t',
      '1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      input,
    ]);
    const result = await service.process(input, directory);
    expect(result.duration).toBe(1);
    expect(result.metadata).toMatchObject({
      width: 160,
      height: 120,
      codec: 'h264',
    });
    const jpeg = await readFile(result.thumbnail);
    expect(jpeg.subarray(0, 2).toString('hex')).toBe('ffd8');
    const mp4 = await readFile(result.stream);
    expect(mp4.indexOf(Buffer.from('moov'))).toBeLessThan(
      mp4.indexOf(Buffer.from('mdat')),
    );
  });
  it('rejects invalid media and playlist demuxers', async () => {
    const input = join(directory, 'invalid');
    await writeFile(input, 'not a video');
    await expect(service.process(input, directory)).rejects.toThrow();
    await writeFile(input, '#EXTM3U\n#EXTINF:1\nhttp://example.test/private\n');
    await expect(service.process(input, directory)).rejects.toThrow();
  });
});

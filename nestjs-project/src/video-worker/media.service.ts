import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { VideoMetadata } from '../videos/entities/video.entity';

const execute = promisify(execFile);
const INPUT_OPTIONS = [
  '-protocol_whitelist',
  'file,pipe',
  '-format_whitelist',
  'mov,matroska,webm,avi,ogg,mpegts,flv',
];

@Injectable()
export class MediaService {
  constructor(private readonly config: ConfigService) {}

  async process(
    input: string,
    directory: string,
  ): Promise<{
    duration: number;
    metadata: VideoMetadata;
    stream: string;
    thumbnail: string;
  }> {
    const timeout = Number(
      this.config.get('VIDEO_PROCESS_TIMEOUT_MS', 1800000),
    );
    const options = {
      timeout,
      killSignal: 'SIGKILL' as const,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8' as const,
    };
    const probe = await execute(
      'ffprobe',
      [
        '-v',
        'error',
        ...INPUT_OPTIONS,
        '-show_format',
        '-show_streams',
        '-of',
        'json',
        input,
      ],
      options,
    );
    const information = JSON.parse(probe.stdout) as {
      streams?: {
        codec_type: string;
        codec_name: string;
        width: number;
        height: number;
        duration?: string;
      }[];
      format?: { duration?: string; format_name?: string };
    };
    const video = information.streams?.find(
      (stream) => stream.codec_type === 'video',
    );
    const duration = Number(information.format?.duration ?? video?.duration);
    if (
      !video ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      video.width < 2 ||
      video.height < 2 ||
      video.width > 16384 ||
      video.height > 16384
    )
      throw new Error('INVALID_MEDIA');
    const thumbnail = join(directory, 'thumbnail.jpg');
    const stream = join(directory, 'playback.mp4');
    await execute(
      'ffmpeg',
      [
        '-nostdin',
        '-v',
        'error',
        ...INPUT_OPTIONS,
        '-i',
        input,
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        '-vf',
        'scale=320:-2',
        '-threads',
        '1',
        thumbnail,
      ],
      options,
    );
    await execute(
      'ffmpeg',
      [
        '-nostdin',
        '-v',
        'error',
        ...INPUT_OPTIONS,
        '-i',
        input,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c:v',
        'libx264',
        '-threads',
        '2',
        '-filter_threads',
        '1',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        stream,
      ],
      options,
    );
    return {
      duration,
      metadata: {
        width: video.width,
        height: video.height,
        codec: video.codec_name,
        format: information.format?.format_name ?? 'unknown',
        size: (await stat(input)).size,
      },
      thumbnail,
      stream,
    };
  }
}

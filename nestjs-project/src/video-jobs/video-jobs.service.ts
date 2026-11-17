import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Queue, Worker } from 'bullmq';
import { Video } from '../videos/entities/video.entity';
import { ProcessingService } from '../video-worker/processing.service';

export const VIDEO_QUEUE = 'video-processing';
export const VIDEO_JOB = 'process-video.v1';
export interface VideoJob {
  videoId: string;
  generation: number;
}

@Injectable()
export class VideoJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideoJobsService.name);
  private readonly queue: Queue<VideoJob>;
  private worker: Worker<VideoJob>;
  private timer: NodeJS.Timeout | undefined;
  private reconciliation: Promise<void> | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly db: DataSource,
    private readonly processing: ProcessingService,
  ) {
    this.queue = new Queue<VideoJob>(VIDEO_QUEUE, {
      connection: {
        ...this.connection(),
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
      prefix: this.prefix(),
    });
    this.queue.on('error', () =>
      this.logger.warn(
        'Queue connection unavailable; durable intent remains in PostgreSQL',
      ),
    );
  }
  private connection() {
    return {
      host: this.config.getOrThrow<string>('REDIS_HOST'),
      port: Number(this.config.get('REDIS_PORT', 6379)),
    };
  }
  private prefix(): string {
    return `streamtube-${this.config.getOrThrow<string>('DB_NAME')}`;
  }

  async onModuleInit(): Promise<void> {
    this.worker = new Worker<VideoJob>(
      VIDEO_QUEUE,
      async (job) => {
        try {
          await this.processing.process(job.data.videoId, job.data.generation);
        } catch {
          if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
            await this.db.getRepository(Video).update(
              {
                id: job.data.videoId,
                generation: job.data.generation,
                status: 'processing',
              },
              { status: 'error', error_code: 'PROCESSING_FAILED' },
            );
          }
          // Never persist raw FFmpeg stderr or signed storage URLs in Redis/logs.
          throw new Error('PROCESSING_FAILED');
        }
      },
      {
        connection: { ...this.connection(), maxRetriesPerRequest: null },
        prefix: this.prefix(),
        concurrency: 1,
      },
    );
    this.worker.on('error', () =>
      this.logger.warn('Worker connection unavailable; reconnecting'),
    );
    this.worker.on('failed', (job) =>
      this.logger.warn(`Video job failed: ${job?.id ?? 'unknown'}`),
    );
    await this.queue.waitUntilReady();
    this.tick();
    this.timer = setInterval(() => this.tick(), 5000);
  }

  private tick(): void {
    if (this.reconciliation) return;
    this.reconciliation = this.reconcile()
      .catch(() => this.logger.warn('Reconciliation postponed; will retry'))
      .finally(() => {
        this.reconciliation = undefined;
      });
  }

  async reconcile(): Promise<void> {
    // Keyset pagination avoids starving videos beyond the first processing batch.
    let after: string | undefined;
    for (;;) {
      const query = this.db
        .getRepository(Video)
        .createQueryBuilder('video')
        .where('video.status = :status', { status: 'processing' })
        .orderBy('video.id', 'ASC')
        .take(100);
      if (after) query.andWhere('video.id > :after', { after });
      const videos = await query.getMany();
      if (!videos.length) break;
      for (const video of videos) {
        const id = `video-${video.id}-${video.generation}`;
        const job = await this.queue.getJob(id);
        if (!job) {
          await this.queue.add(
            VIDEO_JOB,
            { videoId: video.id, generation: video.generation },
            {
              jobId: id,
              attempts: 3,
              removeOnComplete: { age: 86400, count: 1000 },
              removeOnFail: { age: 604800, count: 1000 },
              backoff: { type: 'exponential', delay: 1000 },
            },
          );
        } else {
          const state = await job.getState();
          if (state === 'failed' || state === 'completed') {
            // ready is committed before job completion. A terminal job still processing is inconsistent.
            await this.db.getRepository(Video).update(
              {
                id: video.id,
                generation: video.generation,
                status: 'processing',
              },
              { status: 'error', error_code: 'PROCESSING_FAILED' },
            );
          }
        }
      }
      after = videos[videos.length - 1].id;
      if (videos.length < 100) break;
    }
  }
  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.reconciliation;
    await this.worker?.close();
    await this.queue.close();
  }
}

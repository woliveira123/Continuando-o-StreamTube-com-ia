import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { Video } from './entities/video.entity';
import { CreateVideoDto } from './dto/create-video.dto';
import { VideoNotFound } from './video.exception';

@Injectable()
export class VideosRepository {
  constructor(private readonly db: DataSource) {}

  async create(
    channelId: string,
    dto: CreateVideoDto,
    initialize: (video: Video) => Promise<void>,
  ): Promise<Video> {
    return this.db.transaction(async (manager) => {
      const id = randomUUID();
      const video = manager.create(Video, {
        id,
        channel_id: channelId,
        title: dto.title.trim(),
        filename: dto.filename,
        expected_size: dto.size,
        original_key: `channels/${channelId}/videos/${id}/original`,
        status: 'draft',
      });
      await initialize(video);
      return manager.save(video);
    });
  }

  async owned(id: string, userId: string): Promise<Video> {
    const video = await this.queryOwned(this.db.manager, id, userId).getOne();
    if (!video) throw new VideoNotFound();
    return video;
  }

  async withOwned<T>(
    id: string,
    userId: string,
    action: (video: Video, manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (manager) => {
      const video = await this.queryOwned(manager, id, userId)
        .setLock('pessimistic_write', undefined, ['video'])
        .getOne();
      if (!video) throw new VideoNotFound();
      return action(video, manager);
    });
  }

  private queryOwned(manager: EntityManager, id: string, userId: string) {
    return manager
      .getRepository(Video)
      .createQueryBuilder('video')
      .innerJoin('video.channel', 'channel')
      .where('video.id = :id AND channel.user_id = :userId', { id, userId });
  }
}

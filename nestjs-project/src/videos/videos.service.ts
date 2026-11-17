import { Injectable } from '@nestjs/common';
import { ChannelsService } from '../channels/channels.service';
import { StorageService, SIGNED_URL_SECONDS } from '../storage/storage.service';
import { Video } from './entities/video.entity';
import { VideosRepository } from './videos.repository';
import { CreateVideoDto } from './dto/create-video.dto';
import { VideoResponseDto } from './dto/video-response.dto';
import {
  InvalidUpload,
  StorageUnavailable,
  VideoNotFound,
  VideoStateConflict,
} from './video.exception';
import { partSize, UPLOAD_PART_BYTES, validateParts } from './upload-policy';

@Injectable()
export class VideosService {
  constructor(
    private readonly videos: VideosRepository,
    private readonly channels: ChannelsService,
    private readonly storage: StorageService,
  ) {}

  async create(userId: string, dto: CreateVideoDto): Promise<VideoResponseDto> {
    const channel = await this.channels.findByUserId(userId);
    if (!channel) throw new VideoNotFound();
    let initiated: { key: string; uploadId: string } | undefined;
    try {
      const draft = await this.videos.create(channel.id, dto, async (video) => {
        video.upload_id = await this.storageCall(() =>
          this.storage.initiate(video.original_key),
        );
        initiated = { key: video.original_key, uploadId: video.upload_id };
      });
      return this.response(draft);
    } catch (error) {
      // Compensate storage when the database transaction cannot commit.
      // A lost initiate response is reclaimed by MinIO's stale-upload cleanup.
      if (initiated)
        await this.storage
          .abort(initiated.key, initiated.uploadId)
          .catch(() => undefined);
      throw error;
    }
  }

  async get(id: string, userId: string): Promise<VideoResponseDto> {
    return this.response(await this.videos.owned(id, userId));
  }

  async upload(id: string, userId: string) {
    const video = await this.videos.owned(id, userId);
    this.requireDraft(video);
    return {
      part_size: UPLOAD_PART_BYTES,
      part_count: Math.ceil(video.expected_size / UPLOAD_PART_BYTES),
      parts: await this.storageCall(() =>
        this.storage.listParts(video.original_key, video.upload_id!),
      ),
    };
  }
  async signPart(id: string, userId: string, number: number) {
    return this.videos.withOwned(id, userId, async (video) => {
      this.requireDraft(video);
      let size: number;
      try {
        size = partSize(video.expected_size, number);
      } catch {
        throw new InvalidUpload();
      }
      return {
        url: await this.storageCall(() =>
          this.storage.signPart(
            video.original_key,
            video.upload_id!,
            number,
            size,
          ),
        ),
        expires_in: SIGNED_URL_SECONDS,
        size,
      };
    });
  }
  async complete(id: string, userId: string): Promise<VideoResponseDto> {
    return this.videos.withOwned(id, userId, async (video, manager) => {
      if (video.status === 'processing' || video.status === 'ready')
        return this.response(video);
      this.requireDraft(video);
      let size = await this.storageCall(() =>
        this.storage.head(video.original_key),
      );
      if (size === null) {
        const parts = await this.storageCall(() =>
          this.storage.listParts(video.original_key, video.upload_id!),
        );
        try {
          validateParts(video.expected_size, parts);
        } catch {
          throw new InvalidUpload();
        }
        await this.storageCall(() =>
          this.storage.complete(video.original_key, video.upload_id!, parts),
        );
        size = await this.storageCall(() =>
          this.storage.head(video.original_key),
        );
      }
      if (size !== video.expected_size) throw new InvalidUpload();
      video.status = 'processing';
      video.upload_id = null;
      return this.response(await manager.save(video));
    });
  }
  async cancel(id: string, userId: string): Promise<void> {
    await this.videos.withOwned(id, userId, async (video, manager) => {
      this.requireDraft(video);
      // A lost completion response may leave a draft with an already completed object.
      if (
        (await this.storageCall(() =>
          this.storage.head(video.original_key),
        )) !== null
      )
        throw new VideoStateConflict();
      await this.storageCall(() =>
        this.storage.abort(video.original_key, video.upload_id!),
      );
      await manager.remove(video);
    });
  }
  async retry(id: string, userId: string): Promise<VideoResponseDto> {
    return this.videos.withOwned(id, userId, async (video, manager) => {
      if (video.status !== 'error') throw new VideoStateConflict();
      if (
        (await this.storageCall(() =>
          this.storage.head(video.original_key),
        )) !== video.expected_size
      )
        throw new InvalidUpload();
      video.status = 'processing';
      video.error_code = null;
      video.generation++;
      return this.response(await manager.save(video));
    });
  }
  async location(
    id: string,
    userId: string,
    kind: 'stream' | 'download' | 'thumbnail',
  ): Promise<{ url: string; statusCode: number }> {
    const video = await this.videos.owned(id, userId);
    if (video.status !== 'ready') throw new VideoStateConflict();
    const key =
      kind === 'stream'
        ? video.stream_key
        : kind === 'thumbnail'
          ? video.thumbnail_key
          : video.original_key;
    if (!key) throw new VideoStateConflict();
    const disposition =
      kind === 'download'
        ? `attachment; filename="video-${video.id}"; filename*=UTF-8''${encodeURIComponent(video.filename).replace(/'/g, '%27')}`
        : 'inline';
    const type =
      kind === 'stream'
        ? 'video/mp4'
        : kind === 'thumbnail'
          ? 'image/jpeg'
          : 'application/octet-stream';
    return {
      url: await this.storageCall(() =>
        this.storage.signedGet(key, disposition, type),
      ),
      statusCode: 307,
    };
  }
  private requireDraft(video: Video): void {
    if (video.status !== 'draft' || !video.upload_id)
      throw new VideoStateConflict();
  }
  private async storageCall<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch {
      throw new StorageUnavailable();
    }
  }
  private response(video: Video): VideoResponseDto {
    return {
      id: video.id,
      title: video.title,
      filename: video.filename,
      size: video.expected_size,
      status: video.status,
      part_size: UPLOAD_PART_BYTES,
      part_count: Math.ceil(video.expected_size / UPLOAD_PART_BYTES),
      duration: video.duration,
      metadata: video.metadata,
      error_code: video.error_code,
      stream_url: `/videos/${video.id}/stream`,
      download_url: `/videos/${video.id}/download`,
      thumbnail_url: `/videos/${video.id}/thumbnail`,
    };
  }
}

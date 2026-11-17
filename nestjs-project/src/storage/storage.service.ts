import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { UploadedPart } from '../videos/upload-policy';

export const SIGNED_URL_SECONDS = 900;

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly internal: S3Client;
  private readonly external: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const shared = {
      region: config.getOrThrow<string>('STORAGE_REGION'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow<string>('STORAGE_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('STORAGE_SECRET_KEY'),
      },
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
      maxAttempts: 3,
      requestHandler: { connectionTimeout: 5000, requestTimeout: 120_000 },
    };
    this.bucket = config.getOrThrow<string>('STORAGE_BUCKET');
    this.internal = new S3Client({
      ...shared,
      endpoint: config.getOrThrow<string>('STORAGE_ENDPOINT'),
    });
    this.external = new S3Client({
      ...shared,
      endpoint: config.getOrThrow<string>('STORAGE_PUBLIC_ENDPOINT'),
    });
  }
  onModuleDestroy(): void {
    this.internal.destroy();
    this.external.destroy();
  }

  async initiate(key: string): Promise<string> {
    const result = await this.internal.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: 'application/octet-stream',
      }),
    );
    if (!result.UploadId)
      throw new Error('Storage did not return an upload ID');
    return result.UploadId;
  }
  async signPart(
    key: string,
    uploadId: string,
    number: number,
    size: number,
  ): Promise<string> {
    return getSignedUrl(
      this.external,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: number,
        ContentLength: size,
      }),
      {
        expiresIn: SIGNED_URL_SECONDS,
        signableHeaders: new Set(['content-length']),
      },
    );
  }
  async listParts(key: string, uploadId: string): Promise<UploadedPart[]> {
    const parts: UploadedPart[] = [];
    let marker: string | undefined;
    do {
      const result = await this.internal.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
      );
      for (const part of result.Parts ?? []) {
        parts.push({
          part_number: part.PartNumber!,
          size: part.Size!,
          etag: part.ETag!,
        });
      }
      marker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
    } while (marker);
    return parts;
  }
  async complete(
    key: string,
    uploadId: string,
    parts: UploadedPart[],
  ): Promise<void> {
    await this.internal.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({
            PartNumber: p.part_number,
            ETag: p.etag,
          })),
        },
      }),
    );
  }
  async abort(key: string, uploadId: string): Promise<void> {
    try {
      await this.internal.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (error) {
      if ((error as Error).name !== 'NoSuchUpload') throw error;
    }
  }
  async head(key: string): Promise<number | null> {
    try {
      const result = await this.internal.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return result.ContentLength ?? null;
    } catch (error) {
      if (
        (error as Error).name === 'NotFound' ||
        (error as Error).name === 'NoSuchKey'
      )
        return null;
      throw error;
    }
  }
  async downloadToFile(key: string, path: string): Promise<void> {
    const result = await this.internal.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!(result.Body instanceof Readable))
      throw new Error('Invalid object stream');
    await pipeline(result.Body, createWriteStream(path, { flags: 'wx' }));
  }
  async uploadFile(key: string, path: string, type: string): Promise<void> {
    const size = (await stat(path)).size;
    // Derived MP4 may exceed the 5 GiB single PUT limit: stream it in parts too.
    if (size > 5 * 1024 ** 3) {
      const uploadId = await this.initiate(key);
      const parts: UploadedPart[] = [];
      try {
        const chunk = 16 * 1024 ** 2;
        for (
          let start = 0, number = 1;
          start < size;
          start += chunk, number++
        ) {
          const length = Math.min(chunk, size - start);
          const result = await this.internal.send(
            new UploadPartCommand({
              Bucket: this.bucket,
              Key: key,
              UploadId: uploadId,
              PartNumber: number,
              Body: createReadStream(path, { start, end: start + length - 1 }),
              ContentLength: length,
            }),
          );
          parts.push({ part_number: number, size: length, etag: result.ETag! });
        }
        await this.complete(key, uploadId, parts);
      } catch (error) {
        await this.abort(key, uploadId);
        throw error;
      }
    } else {
      await this.internal.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: createReadStream(path),
          ContentLength: size,
          ContentType: type,
        }),
      );
    }
  }
  async signedGet(
    key: string,
    disposition: string,
    type: string,
  ): Promise<string> {
    return getSignedUrl(
      this.external,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: disposition,
        ResponseContentType: type,
      }),
      { expiresIn: SIGNED_URL_SECONDS },
    );
  }
}

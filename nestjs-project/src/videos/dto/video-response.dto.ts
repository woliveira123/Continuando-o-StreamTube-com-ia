import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VideoMetadataDto {
  @ApiProperty() width: number;
  @ApiProperty() height: number;
  @ApiProperty() codec: string;
  @ApiProperty() format: string;
  @ApiProperty() size: number;
}

export class VideoResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() title: string;
  @ApiProperty() filename: string;
  @ApiProperty() size: number;
  @ApiProperty({ enum: ['draft', 'processing', 'ready', 'error'] })
  status: string;
  @ApiProperty() part_size: number;
  @ApiProperty() part_count: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) duration:
    | number
    | null;
  @ApiPropertyOptional({ type: VideoMetadataDto, nullable: true })
  metadata: VideoMetadataDto | null;
  @ApiPropertyOptional({ type: String, nullable: true }) error_code:
    | string
    | null;
  @ApiProperty() stream_url: string;
  @ApiProperty() download_url: string;
  @ApiProperty() thumbnail_url: string;
}

export class UploadedPartDto {
  @ApiProperty() part_number: number;
  @ApiProperty() size: number;
  @ApiProperty() etag: string;
}
export class UploadResponseDto {
  @ApiProperty() part_size: number;
  @ApiProperty() part_count: number;
  @ApiProperty({ type: [UploadedPartDto] }) parts: UploadedPartDto[];
}
export class SignedPartDto {
  @ApiProperty({
    description: 'Temporary signed PUT URL. Do not log or share.',
  })
  url: string;
  @ApiProperty() expires_in: number;
  @ApiProperty() size: number;
}

import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MAX_VIDEO_BYTES } from '../upload-policy';

export class CreateVideoDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/\S/)
  title: string;

  @ApiProperty({ maxLength: 255, example: 'video.mp4' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  // eslint-disable-next-line no-control-regex -- filenames must reject control characters
  @Matches(/^[^\x00-\x1f\x7f/\\]+$/)
  filename: string;

  @ApiProperty({ minimum: 1, maximum: MAX_VIDEO_BYTES })
  @IsInt()
  @Min(1)
  @Max(MAX_VIDEO_BYTES)
  size: number;
}

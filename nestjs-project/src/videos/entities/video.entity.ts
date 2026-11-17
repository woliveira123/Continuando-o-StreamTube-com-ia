import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';

export type VideoStatus = 'draft' | 'processing' | 'ready' | 'error';
export interface VideoMetadata {
  width: number;
  height: number;
  codec: string;
  format: string;
  size: number;
}

@Entity('videos')
@Check(
  'CHK_video_size',
  '"expected_size" > 0 AND "expected_size" <= 10000000000',
)
@Check(
  'CHK_video_status',
  "\"status\" IN ('draft', 'processing', 'ready', 'error')",
)
export class Video {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') channel_id: string;
  @ManyToOne(() => Channel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;
  @Column({ type: 'varchar', length: 200 }) title: string;
  @Column({ type: 'varchar', length: 255 }) filename: string;
  @Column({
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  expected_size: number;
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: VideoStatus;
  @Column({ type: 'varchar', unique: true }) original_key: string;
  @Column({ type: 'text', nullable: true }) upload_id: string | null;
  @Column({ type: 'text', nullable: true }) stream_key: string | null;
  @Column({ type: 'text', nullable: true }) thumbnail_key: string | null;
  @Column({ type: 'double precision', nullable: true }) duration: number | null;
  @Column({ type: 'jsonb', nullable: true }) metadata: VideoMetadata | null;
  @Column({ type: 'varchar', nullable: true }) error_code: string | null;
  @Column({ type: 'integer', default: 0 }) generation: number;
  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}

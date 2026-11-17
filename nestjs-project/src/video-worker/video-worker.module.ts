import { envValidationSchema } from '../config/env.validation';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../storage/storage.module';
import { Video } from '../videos/entities/video.entity';
import { Channel } from '../channels/entities/channel.entity';
import { User } from '../users/entities/user.entity';
import databaseConfig from '../config/database.config';
import { MediaService } from './media.service';
import { ProcessingService } from './processing.service';
import { VideoJobsService } from '../video-jobs/video-jobs.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const db = databaseConfig();
        return {
          type: 'postgres' as const,
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.name,
          entities: [Video, Channel, User],
          synchronize: false,
        };
      },
    }),
    StorageModule,
  ],
  providers: [MediaService, ProcessingService, VideoJobsService],
})
export class VideoWorkerModule {}

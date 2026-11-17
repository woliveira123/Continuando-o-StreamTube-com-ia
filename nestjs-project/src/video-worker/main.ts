import { NestFactory } from '@nestjs/core';
import { VideoWorkerModule } from './video-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(VideoWorkerModule);
  app.enableShutdownHooks();
}
bootstrap().catch(() => {
  console.error('Video worker failed to start; check service configuration.');
  process.exitCode = 1;
});

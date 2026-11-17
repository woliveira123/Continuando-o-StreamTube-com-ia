# Phase 03 — Library references

Consultas reais em 2026-11-16 pelo endpoint MCP https://mcp.context7.com/mcp, protocolo JSON-RPC `tools/call`. O catálogo desta sessão não expõe Context7 nativamente; cliente HTTPS temporário executou as ferramentas MCP públicas, sem chave nem envio de código do projeto.

| Biblioteca | Resolve selecionado | Query-docs utilizado | Contrato confirmado |
|---|---|---|---|
| BullMQ | /taskforcesh/bullmq | /taskforcesh/bullmq/v5.81.5 | Queue.add, attempts, backoff; Worker requer maxRetriesPerRequest null; jobs idempotentes |
| AWS SDK v3 | /aws/aws-sdk-js-v3 | /aws/aws-sdk-js-v3/v3.1153.0 | S3Client, commands, getSignedUrl, expiresIn e signableHeaders |
| NestJS | /nestjs/docs.nestjs.com | /nestjs/docs.nestjs.com/__branch__11.0.0 | createApplicationContext, enableShutdownHooks, app.close e reexport de TypeOrmModule |

Versões confirmadas no registry e fixadas no package.json/package-lock.json: BullMQ 5.81.5 e AWS SDK 3.1153.0. NestJS/TypeORM existentes permanecem nas versões da base; não há atualização geral de stack.

Consultas: "Queue Worker jobId retries backoff connection maxRetriesPerRequest idempotent tasks"; "S3Client CreateMultipartUploadCommand UploadPartCommand getSignedUrl ListPartsCommand CompleteMultipartUploadCommand"; "Standalone application createApplicationContext lifecycle shutdown hooks TypeOrmModule forFeature".

Fontes oficiais complementares (não substituem as consultas MCP acima):

- https://docs.nestjs.com/techniques/queues
- https://docs.bullmq.io/guide/going-to-production
- https://docs.bullmq.io/patterns/idempotent-jobs
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html
- https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html
- https://ffmpeg.org/ffprobe.html
- https://ffmpeg.org/ffmpeg-formats.html

FFmpeg/ffprobe são binários do sistema no container, chamados diretamente com execFile (sem fluent-ffmpeg). A versão efetiva consta em progress.md.

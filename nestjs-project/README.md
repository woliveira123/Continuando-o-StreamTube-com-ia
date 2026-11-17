# StreamTube API - Fase 03

Backend NestJS 11, PostgreSQL 17, MinIO, Redis/BullMQ e worker FFmpeg.

Na raiz:

```powershell
node scripts/setup-env.mjs
cd nestjs-project
docker compose up -d --build
docker compose -f compose.yaml -f compose.test.yaml --profile test run --rm tests
```

[Guia completo](../docs/phase-03-runbook.md). [Plano e evidencias](../docs/phases/phase-03-videos/progress.md).
Migrations executam no startup. Recompile a imagem depois de editar codigo.

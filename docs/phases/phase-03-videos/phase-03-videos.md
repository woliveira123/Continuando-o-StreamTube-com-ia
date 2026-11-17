---
kind: phase
name: phase-03-videos
---

# Phase 03 — Upload e Processamento de Vídeos Implementation Plan

> Plano original executado; resultados, ajustes e evidências finais em progress.md. As listas abaixo descrevem as tarefas planejadas.

> Execução: superpowers:executing-plans, inline, conforme autorização de autonomia. Aplicar TDD, revisar e registrar cada SI em progress.md.

**Goal:** entregar todos os critérios de requirements.md para a Fase 03 backend.

**Architecture:** API controla uploads multipart sem receber mídia. MinIO guarda originais e derivados. PostgreSQL mantém estado durável; worker reconcilia registros processing com BullMQ/Redis e processa FFmpeg fora do processo HTTP.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL 17, BullMQ 5, Redis 7, AWS SDK v3, MinIO, FFmpeg.

**Spec:** requirements.md, context.md e ../../decisions/technical-decisions-phase-03-videos.md.

## Global Constraints

- Backend somente; upload de até 10.000.000.000 bytes inclusive, partes 16.777.216 bytes.
- Sem buffers de arquivo completo; storage/Redis/worker reais Docker.
- JWT e dono do canal; nenhuma chave/URL assinada em logs ou Git.
- Unit/integration/e2e, migrations, tsc e lint obrigatórios; testes com banco isolado em série.
- Feature branch originada de dev, sem commit direto em main.

## Review Focus

1. Resposta perdida após completar multipart: repetir conclusão recupera HEAD, sem perder original.
2. Redis indisponível após commit: reconciliador publica depois; não deixar processing sem job.
3. Duas conclusões/reentregas: row lock e exclusão por vídeo impedem corrupção.
4. Partes adulteradas ou tamanho real diferente: rejeitar antes do processamento.
5. Mídia inválida/timeout: error final, limpeza de temporários e API responsiva.

## Step Implementations

### SI-03.1 — Fundação e ambiente reproduzível

Files: AGENTS.md; nestjs-project/compose.yaml, Dockerfile, .dockerignore, .env.example; scripts/setup-env.mjs; docs/codex-config.example.toml.

- Rodar base com npm ci, migrations, testes, e2e, tsc e lint; registrar resultado antes do módulo.
- Configurar Docker com API, worker, db, redis, minio e bootstrap do bucket; volumes persistentes e healthchecks. Gerar segredos locais aleatórios por script sem sobrescrever arquivo existente.
- Separar teste em serviço/profile e banco/bucket próprios; nunca limpar dados de uso.
- Verificar docker compose config e conectividade real. Dependências fixadas no lockfile.

### SI-03.2 — Modelo e persistência

Files: src/videos/entities/video.entity.ts, videos.repository.ts, video.exception.ts, dto/*; src/database/migrations/*-CreateVideos.ts.

Interfaces: Video com campos na Data Model; VideosRepository encapsula ownership, transações e busca de processing.

- Testar constraint de ID, vínculo de canal, defaults, limite e transição concorrente contra PostgreSQL real (falha antes do modelo).
- Implementar entidade e gerar migration pela CLI, não alterar migrations anteriores.
- Testar migração up/down em banco descartável; restauração ao final.

### SI-03.3 — Storage multipart

Files: src/storage/storage.module.ts, storage.service.ts; src/config/env.validation.ts; testes de integração correspondentes.

Interfaces: initiate(key), signPart(key, uploadId, number, size), listParts(key, uploadId), complete(key, uploadId, parts), abort(key, uploadId), head(key), downloadToFile(key,path), uploadFile(key,path,type), signedGet(key,disposition).

- Escrever testes reais: assinatura PUT, tamanho assinado, ListParts, conclusão, HEAD, abort, Range/206 e attachment; executar RED.
- Implementar usando S3Client interno/público; bucket privado configurado no bootstrap.
- Executar GREEN com MinIO real; nenhuma mídia atravessa a API de controle.

### SI-03.4 — API de upload e ownership

Files: src/videos/videos.service.ts, videos.controller.ts, videos.module.ts, dto/*; test/videos.e2e-spec.ts.

Interfaces e status HTTP na seção API Contracts abaixo.

- Testar HTTP 401, 404 para outro dono, tamanho zero/acima do limite, rascunho inicial, retomada e partes incompletas; executar RED.
- Implementar serviço com row lock nas mutações, recuperação HEAD da conclusão e mudança atômica para processing.
- Testar duas conclusões concorrentes e repetição de complete; cancelar apenas draft. Executar GREEN.

### SI-03.5 — Fila, reconciliação e worker

Files: src/video-jobs/*, src/video-worker/*, src/config/env.validation.ts; scripts worker e testes integração.

Interfaces: enqueue(videoId,generation), reconcile(), process(videoId,generation), MediaService.process(input,outputDir) → metadata + paths.

- Testar job real, redelivery, retry, estado final error e publicação após indisponibilidade; RED.
- Implementar dispatcher de 5 s com jobId determinístico; status processing é outbox persistente. Consumidor usa lock PostgreSQL por vídeo e reconsulta geração/status.
- Processar com streams/arquivos temporários; ffprobe JSON, JPEG e MP4 faststart; gravar ready após upload dos derivados. Catch de job preserva exceção para BullMQ, erro público sanitizado; final vira error.
- Testar mídia inválida, duplicata e worker real; GREEN. Limpar temporários em finally.

### SI-03.6 — Streaming, download e contrato OpenAPI

Files: controller/service de vídeos, dto de resposta, openapi.json; scripts/upload-video.mjs.

- Testar GET stream/download/thumbnail antes de ready (409), acesso de outro dono e 206 no redirect final; RED.
- Implementar URLs temporárias do storage e respostas 307; download entrega original attachment, stream entrega MP4 inline.
- Atualizar OpenAPI e exemplo de cliente que retoma arquivo sem buffer integral; GREEN.

### SI-03.7 — Aceite, regressão e entrega segura

Files: progress.md, README.md, AGENTS.md, nestjs-project/CLAUDE.md, docs/phase-03-runbook.md, scripts/scan-secrets.mjs, nestjs-project/scripts/acceptance-10gb.mjs.

- Executar unit + integração + e2e completos, tsc, lint e build; corrigir falhas encontradas.
- Exercitar limite 10GB por transferência real, registrar tamanho/tempo/memória e estado; verificar API responsiva durante upload.
- Demonstrar status, metadados, thumbnail, Range e download íntegro com vídeo real.
- Revisão independente final, correções e verificação de segredos/conteúdo rastreado/histórico; documentar limitações reais.
- Entregar localmente. Publicação no fork após esta entrega, conforme usuário.

## Technical Specifications

### Data Model

`videos`: id UUID PK (também URL única); channel_id UUID FK channels ON DELETE CASCADE; title varchar(200); filename varchar(255); expected_size bigint; status varchar com CHECK draft/processing/ready/error; original_key varchar único; upload_id text nullable; stream_key e thumbnail_key text nullable; duration double precision nullable; metadata jsonb nullable; error_code varchar nullable; generation integer default 0; timestamps created_at/updated_at. Índice em status para reconciliação. Check 0 < expected_size <= 10000000000. Não adicionar relação inversa em Channel para não alterar as listas de entidades dos testes herdados.

### API Contracts

Todas autenticadas com Bearer JWT, recurso sempre restringido ao canal do usuário. JSON usa snake_case nas respostas seguindo entidades existentes. Nunca expor upload_id/chaves de storage no DTO público do vídeo; as URLs retornadas são credenciais temporárias.

| Método/rota | Entrada | Saída/status |
|---|---|---|
| POST /videos | {title,filename,size} | 201 VideoResponse draft, part_size, part_count |
| GET /videos/:id | UUID | 200 VideoResponse/status/metadados/URLs lógicas |
| GET /videos/:id/upload | UUID | 200 partes já enviadas {part_number,size,etag}, part_size/count |
| POST /videos/:id/parts/:partNumber | UUID + inteiro | 200 {url,expires_in,size}; tamanho assinado |
| POST /videos/:id/complete | UUID, sem body | 202 VideoResponse processing/ready; idempotente |
| DELETE /videos/:id/upload | UUID | 204; aborta draft e remove registro |
| POST /videos/:id/retry | UUID | 202; apenas error, nova geração |
| GET /videos/:id/stream | UUID | 307 para MP4 assinado inline |
| GET /videos/:id/download | UUID | 307 para original assinado attachment |
| GET /videos/:id/thumbnail | UUID | 307 para JPEG assinado |

### Authorization Matrix

| Operação | Anônimo | Outro usuário | Dono |
|---|---|---|---|
| Criar | 401 | cria no próprio canal | Permitido |
| Consultar/partes/complete/cancel/retry | 401 | 404 | Conforme estado |
| Stream/download/thumbnail | 401 | 404 | Somente ready |

### Error Catalog

- 400 VALIDATION_ERROR: DTO, UUID ou número de parte inválido.
- 400 INVALID_UPLOAD: partes faltantes, fora de ordem, tamanho divergente.
- 404 VIDEO_NOT_FOUND: não existe ou não pertence ao usuário.
- 409 VIDEO_STATE_CONFLICT: operação incompatível com estado atual.
- 503 STORAGE_UNAVAILABLE: falha operacional do storage; não expor detalhes/credenciais.
- error_code PROCESSING_FAILED no vídeo: falha final de mídia ou processamento; detalhes sanitizados no log técnico.

### Events/Messages

Fila `video-processing`, evento `process-video.v1`, payload `{videoId: UUID, generation: number}`. Job ID `video-<UUID>-<generation>` (sem dois-pontos). 3 tentativas, exponential backoff 1000 ms. Jobs preservados para deduplicação enquanto registro processing; limpeza só quando não necessário para recuperação. Dispatcher consulta processing em lotes; job ausente → add; failed → error; completed com banco ainda processing → erro observável/reconciliação, jamais marcar ready sem artefatos. Mensagens não incluem binários, tokens ou URLs.

## Dependency Map

SI-03.1 → SI-03.2 → SI-03.3 → SI-03.4 → SI-03.5 → SI-03.6 → SI-03.7.

## Deliverables

Módulo vídeos + migration; storage + fila + worker Docker; upload/retomada até 10GB; processamento/thumbnail; URL/stream/download; testes e evidências; documentação do workflow e operação; instruções Codex; proteção de credenciais. Matriz requirements.md é o checklist final.

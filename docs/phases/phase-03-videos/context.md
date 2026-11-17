---
kind: phase
name: phase-03-videos
ui_in_scope: false
---

# Phase 03 — Context

## Scope

Implementar todos os requisitos R01–R26 em requirements.md, restritos à Fase 03 backend. Fontes: enunciado PDF, docs/project-plan.md e docs/decisions/technical-decisions-phase-03-videos.md.

## Inherited Conventions

NestJS 11, TypeORM 0.3, PostgreSQL 17; JWT global, CurrentUser, DomainExceptionFilter e ValidationPipe. Usuário possui canal 1:1. Services concentram regras, repositories persistem, controllers delegam. Migrations sem synchronize em runtime. Testes de integração/e2e em série; infra real Docker. Preserve os módulos e testes das fases anteriores.

## Decisions Index / Detail

O usuário autorizou execução autônoma com a recomendação em 2026-11-16. Escolhas do executor:

| ID | Decisão | Consequência |
|---|---|---|
| TD-01 | BullMQ 5 + Redis 7 persistente | Worker separado; 3 tentativas com backoff exponencial de 1 s |
| TD-02 | Multipart direto, partes 16 MiB; limite inclusivo 10.000.000.000 bytes | API recebe somente JSON; tamanho das partes assinado e verificado no storage |
| TD-03 | MinIO/S3, bucket privado, prefixo channels/{channelId}/videos/{videoId} | endpoint interno e público separados, segredos locais; lifecycle aborta multipart após 1 dia |
| TD-04 | ffprobe/FFmpeg em worker independente | Metadados + JPEG + MP4 H.264/AAC faststart; original preservado para download |
| TD-05 | UUID com PK única, API redireciona para URLs de 15 minutos | Range/206 no storage; todas as rotas de vídeo exigem dono nesta fase |
| TD-06 | status processing como outbox persistente, dispatcher periódico e jobId estável | Banco decide se há trabalho; publicação recupera queda banco/Redis; worker idempotente |

## Decisões operacionais detalhadas

- Vídeos ficam privados ao dono durante esta fase; publicar, público/unlisted e acesso anônimo pertencem às Fases 04/05. O token JWT autentica rotas; URL assinada é credencial temporária de leitura/parte.
- `POST /videos` recebe title, filename e size e pré-cadastra draft antes de iniciar multipart. Repetir POST cria outro vídeo; o identificador retornado deve ser persistido pelo cliente.
- Sessão guarda upload_id, tamanho esperado e chaves escolhidas pelo servidor. Partes são numeradas de 1 a ceil(size/16MiB); última tem tamanho restante. GET lista partes para retomada. Conclusão deriva ETags/tamanhos do storage, sem aceitar chave arbitrária.
- Conclusão usa row lock, verifica multipart e/ou HEAD para recuperar resposta perdida de CompleteMultipartUpload. Commit muda draft para processing. Dispatcher do worker consulta registros processing a cada 5 s e adiciona job estável; estado é o registro durável de intenção, sem uma segunda tabela outbox.
- Worker consulta banco por UUID, ignora ready/error, usa exclusão mútua PostgreSQL por vídeo para reentregas e salva ready somente depois dos objetos derivados existirem. Falha final vira error; tentativas intermediárias preservam processing. Dispatcher também reconcilia jobs failed com banco.
- Retry manual autenticado reinicia error com nova geração de job e limpa mensagem; sem retransmitir original quando ainda existe. Cancelar só draft: aborta multipart e remove registro, sob lock.
- Máximo de 16 MiB por buffer no cliente de exemplo; worker usa pipeline de streams para disco temporário. FFmpeg limita threads, concorrência 1 e timeout; arquivos temporários removidos em finally. Não ler mídia arbitrária pela rede no FFmpeg.
- Processamento admite MP4/MOV, WebM/Matroska, AVI, MPEG-TS, Ogg e FLV válidos. Outros formatos e arquivos sem vídeo terminam error, não ready. Sem antivírus ou classificação automática nesta fase.
- Testes usam banco e bucket isolados dos dados de desenvolvimento; suíte herdada contém synchronize, mas os novos testes de persistência devem usar migrations. Não executar testes destrutivos no banco de uso do usuário.

## Capability Coverage

| Capacidade da Fase 03 | TD | SI |
|---|---|---|
| Storage | TD-03 | SI-03.1/3 |
| Fila | TD-01/06 | SI-03.5 |
| Upload 10GB/retomada | TD-02 | SI-03.3/4/7 |
| Rascunho inicial | TD-02/06 | SI-03.2/4 |
| Metadados | TD-04 | SI-03.5 |
| Thumbnail | TD-04 | SI-03.5 |
| URL única | TD-05 | SI-03.2/6 |
| Streaming | TD-05 | SI-03.6 |
| Download | TD-05 | SI-03.6 |

## Prerequisites / Resolution history

- Docker inicialmente desligado: iniciado e ServerVersion 29.4.3 observado.
- Pasta sem Git: histórico original recuperado; branch feature/phase-03-videos criada a partir de dev, sem sobrescrever base.
- Context7 ausente no catálogo integrado: MCP público acessado por JSON-RPC via HTTPS, com resolve-library-id e query-docs bem-sucedidos. IDs e consultas em library-refs.md.
- Fork/push: posterior à entrega, conforme usuário; remoto upstream já identifica a origem.

---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-11-16
scope_description: "Backend de upload, processamento assíncrono, thumbnail, streaming e download; Fase 03."
---

# Technical Decisions — Phase 03: Vídeos

Pesquisa consolidada após autorização de execução autônoma do usuário. Decisões de implementação detalhadas em context.md; este documento não constitui evidência de testes. As versões foram confirmadas na etapa resolve e registradas em library-refs.md via Context7.

_Subprojects in scope:_

- `nestjs-project/`: API, persistência, storage, fila, worker e testes.
- Infraestrutura do backend e documentação de IA: Docker Compose e adaptação do workflow ao Codex.
- `next-frontend/`: sem decisão em aberto nesta fase; interface de vídeos excluída pelo enunciado.

## TD-01: Fila de processamento

**Scope:** Backend / Infra

**Capability:** Serviço de processamento em segundo plano (filas).

**Context:** Processar mídia fora da API, com falhas recuperáveis e worker independente.

**Options:**

- **A — BullMQ + Redis:** integração oficial NestJS, jobs com retries e backoff; exige Redis persistente, configuração noeviction e jobs idempotentes.
- **B — RabbitMQ:** broker com acknowledgements e roteamento; permite consumidores heterogêneos, mas exige mais código para agendamento, retries e estados de jobs.

**Recommendation:** A. O trabalho tem uma fila de tarefas em Node/NestJS; BullMQ atende ao caso sem introduzir roteamento de eventos que a fase não pede. Redis deve ter volume persistente e AOF. API e worker precisam de políticas de conexão diferentes.

**Decision:** A — escolhida pelo executor sob autorização de autonomia do usuário em 2026-11-16.

Fontes: [NestJS Queues](https://docs.nestjs.com/techniques/queues), [BullMQ produção](https://docs.bullmq.io/guide/going-to-production), [retries](https://docs.bullmq.io/guide/retrying-failing-jobs).

## TD-02: Upload de até 10 GB e retomada

**Scope:** Backend

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance.

**Options:**

- **A — Multipart S3 direto com URLs pré-assinadas:** API apenas inicia/controla a sessão; cliente envia partes ao MinIO. Retomada reaproveita partes válidas e renova URLs. Exige protocolo explícito de conclusão, cancelamento e verificação de tamanho.
- **B — Servidor tus separado:** fornece protocolo de retomada, mas adiciona outro serviço e camada de autorização/storage.
- **C — Upload em streaming pela API:** evita buffer integral, porém mantém tráfego e conexões de arquivos grandes na API; pior alinhamento ao requisito de não segurar a API.

**Recommendation:** A. Criar rascunho no início, chaves geradas pelo servidor, bucket privado, URLs curtas e acesso limitado ao dono. Conferir partes e tamanho real no storage, não apenas o valor declarado pelo cliente. Documentar se o limite significa GB decimal ou GiB; proposta: 10.000.000.000 bytes, inclusive.

**Decision:** A — escolhida pelo executor sob autorização de autonomia do usuário em 2026-11-16.

Fontes: [S3 multipart](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html), [URLs pré-assinadas](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).

## TD-03: Storage e organização de objetos

**Scope:** Backend / Infra

**Capability:** Serviço de armazenamento de arquivos (vídeos e thumbnails).

S3 compatível com MinIO local é uma restrição do enunciado, não uma alternativa a reconsiderar.

**Options:**

- **A — Bucket privado único com prefixos por canal/vídeo:** políticas e infraestrutura simples; originais, derivados e thumbnails separados por chave.
- **B — Buckets separados por tipo:** permite políticas e retenção independentes, ao custo de mais configuração.

**Recommendation:** A. Credenciais exclusivamente no ambiente, exemplos sem segredos. Separar endpoint interno (`minio`) do endpoint acessível ao cliente para assinatura; não alterar host de URL depois de assiná-la. Limpar uploads abandonados por política explícita.

**Decision:** A — escolhida pelo executor sob autorização de autonomia do usuário em 2026-11-16.

## TD-04: Worker e formato reproduzível

**Scope:** Backend / Infra

**Capability:** Processamento automático do vídeo após upload (extração de duração e metadados); geração automática de thumbnail a partir de um frame do vídeo.

**Options:**

- **A — Worker em container separado, ffprobe/FFmpeg como subprocessos:** isola CPU e memória; permite timeout, limites e limpeza de arquivos temporários. Deve dimensionar disco para entrada e saída.
- **B — Processamento no processo HTTP:** menos containers, mas concorrência e consumo de recursos prejudicam a API.

**Recommendation:** A. Executar binários com argumentos, sem shell; limitar tempo e concorrência; nunca carregar o vídeo inteiro em memória. Extrair metadados estruturados e thumbnail JPEG. Para reprodução progressiva consistente, avaliar saída MP4 H.264/AAC com faststart, preservando o original para download; isso consome CPU e disco e precisa ser explicitado no plano. Rejeitar arquivos sem stream de vídeo válido.

**Decision:** A — escolhida pelo executor sob autorização de autonomia do usuário em 2026-11-16.

Fontes: [ffprobe](https://ffmpeg.org/ffprobe.html), [formatos FFmpeg](https://ffmpeg.org/ffmpeg-formats.html).

## TD-05: URL única, streaming e download

**Scope:** Backend

**Capability:** URL única por vídeo, sem conflito com outros vídeos; reprodução via streaming; download do vídeo pelo usuário.

**Options:**

- **A — URL estável da API que autoriza e redireciona ao storage com assinatura temporária:** storage entrega bytes e atende Range; API evita retransmitir grandes arquivos. Consumidor precisa seguir redirects.
- **B — Proxy de streaming na API com Range:** controle de headers centralizado, mas duplica tráfego e mantém conexões de mídia na API.

**Recommendation:** A, com UUID e constraint única no banco, URLs lógicas distintas para stream e download e Content-Disposition apropriado. Testar o 206 no destino real, incluindo intervalos inválidos. Não equiparar rascunho a vídeo publicado: a política de acesso desta fase precisa ser definida, preservando publicação pública/unlisted para a Fase 04.

**Decision:** A — escolhida pelo executor sob autorização de autonomia do usuário em 2026-11-16.

Fonte: [S3 GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html).

## TD-06: Estados, consistência e falhas

**Scope:** Backend

**Capability:** Pré-cadastro automático do vídeo como rascunho ao iniciar o upload; processamento automático do vídeo após upload.

**Options:**

- **A — Estado persistido + publicação recuperável na fila + worker idempotente:** permite recuperação de falhas entre banco e Redis; demanda outbox ou reconciliação persistente e testes de crash/reentrega.
- **B — Gravar banco e publicar uma única vez sem reconciliação:** menos código, mas uma queda entre as operações deixa vídeos presos.

**Recommendation:** A. Estados mínimos draft, processing, ready e error; conclusão do multipart idempotente, identificador de job estável e atualizações condicionais. Erros permanentes de mídia terminam em error; falhas transitórias têm retries limitados e backoff. Mensagens levam identificador/versão do evento, sem credenciais ou URLs assinadas. Especificar como recuperar upload concluído cujo ACK foi perdido e job publicado cujo ACK foi perdido.

**Decision:** A — escolhida pelo executor sob autorização de autonomia do usuário em 2026-11-16.

Fonte: [jobs idempotentes BullMQ](https://docs.bullmq.io/patterns/idempotent-jobs).

## Decisions Summary

| ID | Tema | Recomendação | Escolha |
|---|---|---|---|
| TD-01 | Fila | BullMQ + Redis | A |
| TD-02 | Upload | Multipart direto | A |
| TD-03 | Storage | Bucket privado com prefixos | A |
| TD-04 | Worker | Container FFmpeg separado | A |
| TD-05 | Entrega | Redirect assinado e Range no storage | A |
| TD-06 | Consistência | Publicação recuperável e idempotência | A |

## Ambiente resolvido na implementacao

- Context7 consultado pelo protocolo MCP publico via cliente JSON-RPC HTTPS; IDs e versoes registrados em library-refs.md.
- Docker Desktop iniciado; PostgreSQL, MinIO, Redis e FFmpeg reais usados nos testes.
- Historico original recuperado e branch feature/phase-03-videos criada a partir de dev; publicacao do fork reservada para depois da entrega local.
- MinIO compilado do fonte oficial no commit 7aac2a2c5b7c882e68c1ce017d8256be2feea27f. Limpeza de multipart utiliza configuracao nativa, pois o codigo nao suporta a regra S3 AbortIncompleteMultipartUpload.

Fontes adicionais: [MinIO oficial](https://github.com/minio/minio), [limpeza nativa](https://github.com/minio/minio/blob/7aac2a2c5b7c882e68c1ce017d8256be2feea27f/internal/config/api/api.go), [limitacao de lifecycle](https://github.com/minio/minio/blob/7aac2a2c5b7c882e68c1ce017d8256be2feea27f/internal/bucket/lifecycle/rule.go).

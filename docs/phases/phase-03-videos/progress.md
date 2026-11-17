# Fase 03 — progresso e evidências

## Estado atual

Implementação local concluída e ensaio de 10 GB aprovado. A conferência final repetiu os 216 testes e as verificações de tipos, ESLint e build com código 0. Publicação autorizada pelo usuário no repositório indicado; ver ressalva formal de fork em acceptance.md.

## Execução do planejamento

- PDF de 11 páginas lido integralmente em 16/11/2026; requisitos extraídos em `requirements.md`.
- Usuário delegou decisões e execução com BullMQ/Redis, upload multipart MinIO e worker FFmpeg separado.
- Pesquisa → contexto → validação/resolução → plano foram produzidos antes do código de produto. `validation.md` clean refere-se ao planejamento.
- Context7 consultado pelo protocolo MCP público, via cliente JSON-RPC HTTPS. IDs e versões em `library-refs.md`.
- Histórico original recuperado sem alterar a base; branch `feature/phase-03-videos` criada a partir de `dev`, base `8459b2f3a9c0dcad4bd0f31972761c00c52609a1`.

## Step Implementations

| SI | Estado | Evidência |
|---|---|---|
| SI-03.1 | Implementado | Compose final iniciou API, worker, PostgreSQL, Redis, MinIO e Mailpit; banco preservado em volume persistente; runner isolado |
| SI-03.2 | Implementado | Entity Video, FK de canal, PK UUID, constraints; migration gerada pela CLI; up/down real aprovado |
| SI-03.3 | Implementado | MinIO real: multipart, ListParts, tamanho assinado, conclusão, abort, HEAD e URLs temporárias verificados no e2e |
| SI-03.4 | Implementado | JWT e ownership de todas as rotas, limites, draft, cancelamento, complete concorrente e retomada aprovados |
| SI-03.5 | Implementado | Worker real, ffprobe/FFmpeg, retries/error, reconciliação após reinício e recuperação de resíduos aprovados |
| SI-03.6 | Concluído | Streaming 206, thumbnail JPEG e original íntegro aprovados; OpenAPI exportado com 10 operações de vídeo |
| SI-03.7 | Aceite aprovado | 216 testes, TypeScript/lint/build código 0 e ensaio real de 10 GB aprovado; conferência final aprovada |

## Comandos e resultados

Em `nestjs-project/`:

```powershell
docker compose up -d --wait
docker compose -f compose.yaml -f compose.test.yaml --profile test run --rm tests
```

Startup final: código 0, serviços iniciados e saudáveis; storage-init concluiu com sucesso. O runner usa banco `streamtube_test`, bucket `streamtube-test` e prefixo de fila separado. Testes em série:

| Verificação | Resultado observado em 17/11/2026 |
|---|---|
| Unitários e integração | 25 suítes, 157 testes aprovados |
| E2E Supertest | 4 suítes, 59 testes aprovados |
| TypeScript, ESLint e build no runner | Código 0 |
| Ensaio real de 10 GB | Aprovado: 10.000.000.000 bytes, 597 partes, ready, código 0 |
| Scanner conteúdo e histórico | Sem achados no histórico; conteúdo final verificado em 551 arquivos |

## Cobertura funcional observada

- Limite inclusivo de 10.000.000.000 bytes, rejeição de zero/acima do limite, 597 partes no limite, validação de partes completas/ordenadas e tamanho da última parte.
- Autenticação obrigatória e resposta 404 para outro dono em consulta, upload, assinatura, complete, retry, cancel, streaming, thumbnail e download.
- Criação de draft e constraint única; consulta de partes para retomada; assinatura rejeita tamanho adulterado.
- Dois completes simultâneos e conclusão repetida não duplicam processamento nem perdem o original.
- Upload real de vídeo gerado pelo FFmpeg, duração/metadados, JPEG, MP4 faststart, Range/206 com 32 bytes e download original byte a byte.
- Mídia inválida chega a error após retries; stream bloqueado; dono pode solicitar nova geração de processamento.
- Complete do storage sem confirmação no banco é recuperado por HEAD; reinício do worker publica a intenção processing persistida.
- Falha de initiate não deixa draft órfão; falha real de persistência após initiate aborta multipart.
- Resíduo de processamento interrompido é removido antes da reentrega, sob advisory lock por vídeo.

## Revisão e correções

Revisão independente encontrou dois pontos importantes: draft órfão em falha de storage e temporários de vários GB após encerramento abrupto. Ambos foram corrigidos e cobertos por testes aprovados. Nenhum achado crítico foi registrado.

Também foram corrigidos problemas herdados: DROP TABLE CASCADE concorrente causava deadlock no teste de migrations; enum PostgreSQL precisava ser removido no preparo; fixtures/mocks/respostas HTTP tinham erros de tipagem no lint. As correções preservam a semântica dos testes e não relaxam o ESLint global. A consulta de tokens ativos passou a usar `IsNull()`, pois TypeORM ignora `null` literal em filtros.

O teste real de FFmpeg usa timeout de integração de 30s. Uma execução simultânea ao primeiro build Docker excedeu o limite anterior de 5s; a execução final isolada passou. Avisos de depreciação pg/Node da base não foram confundidos com falhas.

## Ajustes ao plano

- Configurações novas foram centralizadas no schema Joi existente e ConfigService, sem arquivos redundantes `storage.config.ts`/`video.config.ts`.
- Testes de storage/worker e contratos foram integrados ao e2e real e ao teste FFmpeg; não houve necessidade de uma suíte separada para cada método.
- Ciclos RED observados: política de upload inicialmente não implementada, rota HTTP ausente e regressão de draft órfão. Não se alega que cada teste de integração tenha sido escrito antes de cada linha de implementação.
- MinIO foi compilado do commit oficial fixado. `AbortIncompleteMultipartUpload` via lifecycle S3 não é suportado nessa versão; limpeza nativa configurada em 24h, com varredura de 1h.
- O estado processing funciona como intenção durável de publicação. Job ID por vídeo/geração e reconciliador dispensam tabela outbox adicional.
- Frontend da Fase 03 permanece fora do escopo do PDF. Apenas relatório gerado foi retirado do versionamento; código de interface não foi alterado.

## Segurança e publicação

Segredos locais foram gerados aleatoriamente, não exibidos nem incluídos no código. `.env`, `.mcp.json`, configurações MCP locais, relatórios e sessões de IA estão excluídos. Arquivos já rastreados foram retirados do índice e preservados no disco. O scanner inclui padrões conhecidos e comparação com valores secretos locais, além do histórico Git; é heurístico, complementado pela revisão do diff.

Destino autorizado para publicação: https://github.com/woliveira123/Continuando-o-StreamTube-com-ia. O destino foi verificado vazio, público e independente; não é apresentado como fork. Branch feature e histórico original preservados. E-mail noreply da conta usado na autoria.

## Verificação complementar

Após acrescentar a asserção explícita de resíduo temporário, a suíte de vídeos passou novamente: 7 testes, código 0. A revisão independente confirmou resolvidos os dois achados. OpenAPI exportado: 9 caminhos, 10 operações. Runtime: Node.js v25.6.0 e FFmpeg 5.1.9-0+deb12u1.

## Ensaio real de 10 GB — 17/11/2026

Comando: `docker compose exec -T -e RUN_LARGE_UPLOAD=true nestjs-api node scripts/acceptance-10gb.mjs` — código de saída 0.

| Métrica | Resultado |
|---|---|
| Bytes transferidos e confirmados nos metadados | 10.000.000.000 |
| Partes | 597 |
| Estado final | ready |
| Tempo de upload | 438 s (7 min 18 s), incluindo limites de requisições |
| Tempo total até ready | 863 s (14 min 23 s) |
| Verificações da API durante o ensaio | 172 |
| Falhas de resposta da API | 0 |
| Maior latência observada da API | 414 ms |
| Pico residente do processo da API (VmHWM) | 174.620 KiB, aproximadamente 171 MiB |
| Memória residente do cliente ao final | 144.293.888 bytes, aproximadamente 138 MiB |
| Mídia detectada | H.264, 160×120, contêiner MP4 |

O ensaio transferiu bytes reais pelo endpoint S3 assinado e o worker leu o objeto inteiro do MinIO. A mídia contém um vídeo curto válido com preenchimento até 10 GB: valida limite, transferência, persistência, memória e disponibilidade da API; não simula a transcodificação de 10 GB de cenas complexas. O tempo depende do disco e dos recursos deste Docker Desktop. Arquivos, objetos e registros exclusivos do ensaio foram removidos ao terminar.

A primeira execução do script de aceite revelou que fetch não preservava o Host assinado ao acessar o endereço interno do MinIO. O cliente de teste foi corrigido para usar HTTP nativo com Host explícito; o cliente comum usa a URL pública sem reescrever o endereço.
Resultado estruturado do ensaio: [acceptance-results.json](acceptance-results.json).

Verificação final adicional: `npm run lint` e `npm run openapi:export` executados na imagem final, ambos com código 0. API, worker e dependências saudáveis após `docker compose up -d --wait`.

Antes da publicação autorizada: runner completo repetido com código 0 (157 testes unitários/integração e 59 e2e, tipos, ESLint e build). Scanner do conteúdo: 551 arquivos sem achados. Varredura em lote via git cat-file: 829 blobs históricos sem padrões de segredos nem valores secretos locais. Arquivos sensíveis ausentes do índice; git diff --cached --check aprovado.

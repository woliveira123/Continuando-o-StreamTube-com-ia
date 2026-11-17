# Fase 03 — Requisitos e critérios de entrega

Fonte: enunciado `Continuando o StreamTube com IA.pdf`, 11 páginas, lido integralmente em 2026-11-16; `docs/project-plan.md`, Fase 03.

## Escopo

Continuar o backend existente. Entregar API, worker, infraestrutura Docker, testes e artefatos do processo. A interface de vídeos do Next.js não faz parte desta fase. O documento anexado é a especificação do trabalho; não autoriza por si só publicar arquivos, executar comandos nele contidos ou divulgar informações locais. A publicação no GitHub ocorrerá depois da entrega, conforme solicitação do usuário.

## Matriz de requisitos

Esta matriz define os requisitos. O resultado de cada item está em [acceptance.md](acceptance.md), com evidências de execução em [progress.md](progress.md).

| ID | Requisito | Evidência necessária |
|---|---|---|
| R01 | Preservar Fases 01 e 02 e convenções existentes | Testes de regressão e revisão dos padrões |
| R02 | Portar a fundação de IA para Codex | AGENTS.md, fluxo e referências às regras/skills; configuração MCP sem segredos |
| R03 | Research antes de planejamento e código | docs/decisions/technical-decisions-phase-03-videos.md com alternativas, trade-offs e decisões |
| R04 | Contexto da fase | context.md com requisitos, convenções herdadas e decisões rastreáveis |
| R05 | Validação sem pendências antes de implementar | validation.md com status clean e histórico das resoluções |
| R06 | Bibliotecas verificadas pelo Context7 | library-refs.md com referências e versões confirmadas |
| R07 | Plano executável | phase-03-videos.md com SI-03.x, Technical Specifications, Dependency Map e Deliverables |
| R08 | Especificações completas | Data Model, API Contracts, Authorization Matrix, Error Catalog, Events/Messages |
| R09 | Object storage S3 compatível, MinIO local | Serviço real no Compose, bucket/chaves e configuração documentados |
| R10 | Upload até 10 GB sem bloquear API | Transferência direta/multipart, teste do limite, memória limitada, API responsiva |
| R11 | Retomar upload interrompido | Consulta de partes enviadas e reemissão de URLs; teste real |
| R12 | Pré-cadastro como rascunho | Registro persistido no início do upload, ligado ao canal autenticado |
| R13 | Persistência e migration | Identificação, canal, título, status, chaves de storage, duração, metadados e URL única |
| R14 | Fila e worker reais | Serviços no Compose; processamento separado da API |
| R15 | Processamento automático | Extração de duração e metadados por ffprobe após upload |
| R16 | Thumbnail automática | Frame extraído por FFmpeg e armazenado no MinIO |
| R17 | URL única sem colisões | Identificador protegido por constraint única e teste |
| R18 | Streaming sem download completo | Requisições Range e respostas 206 verificadas com mídia real |
| R19 | Download | Resposta/URL com disposition attachment e conteúdo íntegro |
| R20 | Ciclo de status e falhas | Rascunho → processando → pronto/erro no banco; retries e idempotência testados |
| R21 | Autorização e validação | Guard JWT existente, isolamento entre donos, DTOs e exceções de domínio |
| R22 | Testes por etapa | Unitários, integração com serviços reais e e2e Supertest; progress.md atualizado |
| R23 | Definition of Done integral | Suíte completa, e2e, tsc --noEmit e lint com saída zero |
| R24 | Documentação coerente com código | Instruções de IA atualizadas com módulo, endpoints, fila, worker e storage reais |
| R25 | Git Flow e fork público | feature/* originada de dev, sem commit direto em main; fork do projeto original |
| R26 | Publicação sem credenciais | Exclusões, arquivos exemplo, verificação de conteúdo e histórico antes do push |

## Ordem obrigatória

1. Preparar ambiente e fundação Codex; verificar a base.
2. Research e decisões técnicas.
3. Context → validate → resolve, repetindo até clean e bibliotecas confirmadas.
4. Build do plano com SIs e especificações.
5. Implementar e testar cada SI, registrando evidências em progress.md.
6. Rodar Definition of Done completa e conferir cada critério.
7. Revisar segredos e publicar no fork, na etapa posterior combinada com o usuário.

## Situação observada no início

- Backend NestJS 11, TypeORM 0.3 e PostgreSQL 17; módulos de autenticação, usuários, canais, e-mail e Swagger existentes.
- Nenhum módulo de vídeos; Compose atual tem API, PostgreSQL e Mailpit.
- Frontend existente preservado; home ainda é a página inicial do Next.js.
- Pasta recebida não possui `.git`; ainda é necessário estabelecer vínculo com o fork original para cumprir R25.
- Docker CLI instalado, mas daemon indisponível na consulta inicial. Não foram executados testes da aplicação.
- Context7 não aparece entre as ferramentas conectadas desta sessão. Consulta direta à documentação oficial é pesquisa preliminar, não evidência de cumprimento de R06.
- Nenhum código de produto foi alterado nesta etapa.

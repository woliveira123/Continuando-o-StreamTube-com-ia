# Fase 03 — matriz de aceite

Esta matriz liga os requisitos extraídos do PDF à entrega verificável. Resultados e comandos completos estão em [progress.md](progress.md).

| Requisito | Evidência na entrega | Situação |
|---|---|---|
| R01 — preservar base | 157 testes unitários/integração e 59 e2e; módulos anteriores integrados | Atendido |
| R02 — fundação Codex | AGENTS.md, referências às regras/skills, exemplo MCP sem chave, guia operacional | Atendido |
| R03 — research | technical-decisions-phase-03-videos.md, seis decisões com alternativas | Atendido |
| R04 — contexto | context.md | Atendido |
| R05 — validação prévia | validation.md, clean do planejamento antes do código | Atendido |
| R06 — Context7 | library-refs.md, consultas MCP reais com IDs/versionamento | Atendido |
| R07 — plano | phase-03-videos.md, SI-03.1 a SI-03.7 | Atendido |
| R08 — especificações | Data Model, API Contracts, Authorization Matrix, Error Catalog e Events/Messages no plano | Atendido |
| R09 — S3/MinIO | Dockerfile fixado, Compose, bootstrap privado e testes reais | Atendido |
| R10 — 10 GB/API responsiva | scripts/acceptance-10gb.mjs; 10 GB reais, ready, 172 respostas sem falha, máximo 414 ms | Atendido |
| R11 — retomada | ListParts, reemissão de URLs, cliente de partes com estado local; e2e real | Atendido |
| R12 — draft | POST cria vídeo/upload de forma atômica; rollback e compensação testados | Atendido |
| R13 — persistência | Video entity e migration gerada; metadados, duração e chaves; up/down testados | Atendido |
| R14 — fila/worker | Redis/BullMQ e worker em container distinto da API; teste de reinício | Atendido |
| R15 — metadados | ffprobe real; duração, dimensões, codec, formato e tamanho | Atendido |
| R16 — thumbnail | JPEG gerado por FFmpeg e recuperado do MinIO | Atendido |
| R17 — URL única | UUID como PK, original_key único, URL lógica por UUID; constraint testada | Atendido |
| R18 — streaming | MP4 H.264/AAC faststart e Range/206 real | Atendido |
| R19 — download | original com attachment, comparação byte a byte no e2e | Atendido |
| R20 — estados/falhas | retries, error, retry do dono, complete concorrente, ACK perdido, worker reiniciado | Atendido |
| R21 — autorização | JWT existente, DTOs, 404 para outro dono em todas as operações | Atendido |
| R22 — testes por etapa | testes unitários, integrações reais e e2e; histórico de falhas/correções em progress.md | Atendido |
| R23 — Definition of Done | runner integral código 0: 216 testes, TypeScript, ESLint e build | Atendido |
| R24 — documentação | README, runbook, OpenAPI, AGENTS e instruções CLAUDE atualizados | Atendido |
| R25 — Git Flow/fork | feature/phase-03-videos originada de dev, histórico original preservado | Git Flow local atendido; destino autorizado é repositório independente, não fork |
| R26 — sem credenciais | exclusões, exemplos, gerador de segredos, scanner de conteúdo/histórico | Conteúdo e histórico verificados antes da publicação |

O usuário autorizou a publicação em https://github.com/woliveira123/Continuando-o-StreamTube-com-ia. A API pública do GitHub confirmou que o destino é público e independente (fork=false). O histórico original e a branch feature originada de dev são preservados, mas o vínculo formal de fork solicitado no PDF permanece uma ressalva. O envio da URL no portal acadêmico cabe ao aluno. Autoria Git: conta woliveira123, com endereço noreply do GitHub para preservar o e-mail pessoal.

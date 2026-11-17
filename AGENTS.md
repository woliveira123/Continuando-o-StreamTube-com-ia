# StreamTube — orientações para Codex

## Contexto e escopo

Monorepo: API NestJS em `nestjs-project/`, frontend em `next-frontend/` e documentação em `docs/`. A tarefa atual é somente a Fase 03 do backend. Leia `docs/phases/phase-03-videos/requirements.md` e o plano da fase antes de editar.

## Fundação de IA adaptada

As convenções de `CLAUDE.md`, `nestjs-project/CLAUDE.md` e `.claude/rules/` continuam sendo as fontes do projeto. No Codex este arquivo é o ponto de entrada. Consulte as regras `nestjs-*`, `typeorm-*`, `auth-jwt.md` e `typescript-strict.md` conforme os arquivos afetados.

Execute o mesmo encadeamento das skills em `.claude/skills/`: research → plan-context → plan-validate → plan-resolve → plan-build → implement. O executor pode realizar manualmente os estágios com ferramentas Codex; preserve os formatos e artefatos. Não declarar `clean` ou teste aprovado sem evidências. Atualize `progress.md` a cada etapa e registre decisões antes do código.

## Implementação

- Controllers finos, regras em services, acesso a dados em repositories. Erros de domínio mapeados por filters.
- JWT global existente; confira dono do canal antes de autorizar operação em vídeo.
- Banco, Redis, storage e worker reais via Docker; hosts internos são nomes dos serviços.
- Consulte bibliotecas via Context7 antes de implementar e registre IDs/versões em library-refs.md. Consultas devem conter apenas perguntas técnicas públicas, nunca código privado ou segredos.
- TypeScript estrito, migrations versionadas, sem synchronize em runtime.
- Testes unitários `*.spec.ts`, integração `*.integration-spec.ts`, e2e `*.e2e-spec.ts`; testes com banco em série.
- Antes da entrega: suíte completa, e2e, `npx tsc --noEmit`, `npm run lint`, build e demonstração real do upload/processamento/stream/download.
- Trabalho em feature/* originada de dev; nunca commit direto em main.

## Credenciais e entrega

Nunca imprimir ou versionar `.env`, `.mcp.json` local, chaves, tokens, URLs assinadas ou dumps de sessões. Use exemplos sem credenciais reais. Execute a verificação de segredos antes de commits e publicação. Publicação no fork é etapa posterior à validação da entrega, conforme pedido do usuário.

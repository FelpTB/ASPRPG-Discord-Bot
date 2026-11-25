# Bot de Associados (Catarse → Discord) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** um bot no Discord da Associação Paulista de RPG que dá e remove o cargo `Associado` conforme a assinatura ativa no Catarse. A base de assinantes chega por importação de CSV, e o vínculo com a conta Discord é feito pelo próprio membro com um código enviado por e-mail.

**Arquitetura:** um único processo Node.js (bot discord.js conectado ao Gateway), sempre ligado no **Railway** (plano Hobby). Ele guarda tudo no **Supabase Postgres** (plano gratuito) e envia e-mail via SMTP do **Brevo**. O código fica no **GitHub** (repositório privado). O GitHub Actions roda lint, tipos e testes, e o Railway faz o deploy automático da branch `main` só depois que o CI passa. As regras de negócio (importação, sincronização, verificação) ficam em **funções puras testáveis**, separadas da camada Discord e da camada de banco.

**Stack:** Node.js 22 LTS · TypeScript · discord.js v14 · `postgres` (postgres.js) · Supabase CLI (migrations) · zod · csv-parse · nodemailer · node-cron · pino · Vitest · Biome · Docker · GitHub Actions · Railway · Healthchecks.io

**Spec:** `Detalhamento - Ponta Discord.md` (seções 2–9). Nesta stack, **o Supabase Postgres substitui o SQLite + Volume** citados ali.

---

## Visão geral das fases e ferramentas

| Fase | Entrega | Ferramentas que evitam reinventar a roda |
|---|---|---|
| 0. Preparação | Contas, servidor Discord, app no Developer Portal, CSV real | Discord Developer Portal, Supabase Dashboard, Brevo, Railway, GitHub Organization |
| 1. Esqueleto + CI/CD | Bot "online" em produção com deploy automático | `tsx`, `tsc`, Biome, Vitest, zod, pino, Dockerfile, GitHub Actions, Railway "Wait for CI", Dependabot |
| 2. Banco + criptografia | Tabelas versionadas, acesso tipado e e-mails cifrados | Supabase CLI (`supabase migration`, `supabase start`), postgres.js, `node:crypto` (HMAC + AES-GCM), RLS |
| 3. Importação CSV | `/admin importar` com prévia e confirmação | csv-parse, zod, botões do discord.js |
| 4. Sincronização de cargos | Cargo dado/removido com carência, rotina diária e evento de entrada | node-cron, discord.js (`GuildMemberAdd`, `roles.add/remove`) |
| 5. Comandos admin | vincular, desvincular, membro, relatório, sincronizar, publicar | `SlashCommandBuilder`, `setDefaultMemberPermissions` |
| 6. Verificação self-service | Botão → e-mail → código → cargo | Modais do discord.js, nodemailer + Brevo SMTP, `crypto.randomInt` |
| 7. Operação | Monitoramento, backup, retenção, política de privacidade, runbook | Healthchecks.io, Sentry (opcional), GitHub Actions agendado + `pg_dump` + `age`, GitHub Pages |
| 8. Piloto e lançamento | 5–10 associados testando e depois todos | Checklist deste plano |

---

## Global Constraints

- Runtime **Node.js 22 LTS**, **TypeScript** em modo `strict`, ESM.
- **discord.js v14** (≥ 14.17). Respostas privadas usam `flags: MessageFlags.Ephemeral`, não o antigo `ephemeral: true`.
- Intents: **apenas** `Guilds` e `GuildMembers`. `MessageContent` fica **desligado**.
- Permissões do bot: Manage Roles, View Channels, Send Messages, Embed Links, Read Message History. O cargo do bot fica **acima** de `Associado`.
- Código de verificação: **6 dígitos**, válido por **15 min**, no máximo **5 tentativas** por código e **3 pedidos de código por usuário por hora**. Armazenado **só como hash**.
- **1 e-mail ↔ 1 conta Discord.** Um conflito bloqueia a verificação e avisa em `#log-bot`.
- Resposta ao pedido de código é **idêntica** exista o e-mail na base ou não (anti-enumeração).
- Carência: `CARENCIA_DIAS=7`. Sincronização diária às **04:00 America/Sao_Paulo**.
- Uma importação que inativaria **mais de 20%** dos vinculados exige uma **segunda confirmação**.
- Do CSV, só se importam **e-mail, nome, plano, status**. O arquivo é processado **em memória** e nunca salvo.
- No banco, o e-mail fica **cifrado (AES-256-GCM)**, e a busca usa **HMAC-SHA256 com chave secreta** (não SHA puro). Na exibição, o e-mail é sempre mascarado (`fu***@gmail.com`).
- Vínculos inativos há **mais de 12 meses** são apagados automaticamente. Códigos expirados são apagados diariamente.
- Toda alteração de cargo é registrada na tabela `eventos` e no canal `#log-bot`.
- Segredos (`DISCORD_TOKEN`, `DATABASE_URL`, `SMTP_PASS`, `EMAIL_ENC_KEY`, `EMAIL_HMAC_KEY`) ficam **só** nas variáveis do Railway, nos secrets do GitHub e no `.env` local (que está no `.gitignore`).
- Contas de serviço (GitHub, Railway, Supabase, Brevo, Discord Dev) ficam no **e-mail institucional** da Associação, **com 2FA**.

## Review Focus

1. **CSV salvo pelo Excel** (separador `;`, BOM UTF-8, acentos em Latin-1, colunas com nomes ligeiramente diferentes): o importador deve aceitar, ou recusar com mensagem clara, mas **nunca** inativar todo mundo. → teste na Tarefa 3.
2. **E-mail com maiúsculas e espaços** (`  Fulano@Gmail.com `) no CSV ou digitado no modal: precisa casar com o mesmo assinante. → teste na Tarefa 2 (`normalizarEmail`).
3. **Hierarquia de cargos errada** (erro Discord `50013`): o bot não pode travar. Deve registrar no `#log-bot` com a instrução de correção e seguir para os próximos membros. → teste na Tarefa 4 (executor).
4. **Membro saiu do servidor** durante a sincronização (erro `10007 Unknown Member`): ignorar sem erro e manter o vínculo. → teste na Tarefa 4.
5. **Supabase pausado ou inacessível**: interações respondem "Sistema temporariamente indisponível, tente mais tarde" e a sincronização é abortada **sem remover cargos**. → teste na Tarefa 4 e na Tarefa 6.

---

## Estrutura de arquivos

```
bot-associacao/
├─ .github/
│  ├─ workflows/ci.yml            # lint + typecheck + testes (push e PR)
│  ├─ workflows/backup.yml        # pg_dump semanal cifrado (Fase 7)
│  └─ dependabot.yml
├─ supabase/
│  ├─ config.toml                 # gerado por `supabase init`
│  └─ migrations/                 # SQL versionado
├─ src/
│  ├─ index.ts                    # bootstrap: config → db → client → handlers → cron
│  ├─ config.ts                   # zod: env + config.json
│  ├─ logger.ts                   # pino
│  ├─ db/
│  │  ├─ client.ts                # conexão postgres.js
│  │  └─ repo.ts                  # TODA a SQL do projeto
│  ├─ dominio/                    # regras puras (sem Discord, sem banco)
│  │  ├─ email.ts                 # normalizar, mascarar
│  │  ├─ cripto.ts                # hmac, cifrar/decifrar, hash de código
│  │  ├─ importacao.ts            # parse CSV → linhas validadas → diff
│  │  ├─ sincronizacao.ts         # decide ações por vínculo
│  │  └─ verificacao.ts           # regras de código/limites
│  ├─ servicos/                   # orquestram domínio + repo + Discord/e-mail
│  │  ├─ importador.ts
│  │  ├─ sincronizador.ts
│  │  ├─ verificador.ts
│  │  ├─ cargos.ts                # executor: aplica ações no Discord
│  │  ├─ mailer.ts
│  │  └─ auditoria.ts             # eventos + #log-bot
│  ├─ discord/
│  │  ├─ comandos/{admin,associado}.ts
│  │  ├─ interacoes/{verificacao,confirmacaoImport}.ts
│  │  ├─ eventos/guildMemberAdd.ts
│  │  ├─ roteador.ts              # despacha InteractionCreate por customId/commandName
│  │  └─ registrar-comandos.ts    # script: PUT dos comandos no servidor
│  └─ agendador.ts                # node-cron: sync diária + limpeza
├─ tests/                         # espelha src/ ; fixtures CSV em tests/fixtures/
├─ config.json                    # mapeamento de colunas/status do CSV
├─ Dockerfile
├─ biome.json · tsconfig.json · vitest.config.ts · package.json
├─ .env.example
└─ docs/runbook-diretoria.md      # Fase 7
```

**Princípio:** `dominio/` não importa nada de `discord.js` nem de `db/`. Por isso a maioria dos testes roda sem rede, sem banco e sem Discord.

---

### Tarefa 0: Preparação (sem código)

**Entrega:** checklist concluído e `config.json` preenchido com um CSV real.

- [ ] Criar o e-mail institucional (se não existir) e, com ele e 2FA, as contas: GitHub (Organization `associacao-paulista-rpg`), Railway, Supabase, Brevo.
- [ ] **Servidor Discord:** cargos `Diretoria` > `Bot Associação` > `Associado` > `@everyone`. Categoria `🔒 ASSOCIADOS` com Ver canal negado para `@everyone` e permitido para `Associado`. Canais `#verificação` (público, só leitura) e `#log-bot` (só Diretoria + bot).
- [ ] **Developer Portal:** criar a aplicação. Na aba Bot: Public Bot desligado, **Server Members Intent** ligado, Message Content desligado. Convidar o bot com os scopes `bot applications.commands` e as permissões listadas em *Global Constraints*. Arrastar o cargo do bot acima de `Associado`.
- [ ] **Supabase:** criar o projeto na região **South America (São Paulo)** com uma senha forte no gerenciador de senhas. Copiar a *connection string* do **Session pooler** (porta 5432, com IPv4, compatível com o Railway).
- [ ] **Brevo:** verificar o remetente (ou o domínio, se houver) e gerar uma **chave SMTP**.
- [ ] **Railway:** criar um projeto vazio (plano Hobby).
- [ ] **CSV real:** exportar do Catarse Estúdio e anotar os nomes exatos das colunas de e-mail, nome, plano e status, e os valores possíveis de status. Preencher o `config.json`:
  ```json
  { "colunas": { "email": "Email", "nome": "Nome", "plano": "Recompensa", "status": "Status da Assinatura" },
    "statusAtivos": ["Ativa"], "csvContemSoAtivos": false }
  ```
- [ ] Guardar uma cópia **anonimizada** do CSV (e-mails trocados por `teste1@exemplo.com`…) para virar fixture de teste. **Nunca** commitar o CSV real.

---

### Tarefa 1: Esqueleto, CI e deploy contínuo

**Files:** create `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, `Dockerfile`, `.env.example`, `.gitignore`, `.github/workflows/ci.yml`, `.github/dependabot.yml`, `src/index.ts`, `src/config.ts`, `src/logger.ts`, `tests/config.test.ts`

**Interfaces:**
- Produces: `carregarConfig(env: NodeJS.ProcessEnv, arquivo: unknown): Config` (lança `ZodError` com a lista de variáveis faltando); `logger` (pino).
- `Config = { discordToken, clientId, guildId, roleAssociadoId, roleDiretoriaId, canalLogId, canalVerificacaoId, databaseUrl, smtp: {host, port, user, pass, from}, emailEncKey: Buffer(32), emailHmacKey: Buffer(32), carenciaDias: number, csv: {colunas, statusAtivos, csvContemSoAtivos}, healthcheckUrl?: string }`

- [ ] **Teste:** `carregarConfig` sem `DISCORD_TOKEN` lança um erro que menciona `DISCORD_TOKEN`. `EMAIL_ENC_KEY` que não seja 32 bytes em base64 é rejeitada. `CARENCIA_DIAS` ausente vira `7`.
- [ ] Implementar `config.ts` com zod. Scripts no `package.json`: `dev` (`tsx watch src/index.ts`), `build` (`tsc`), `start` (`node dist/index.js`), `test` (`vitest run`), `check` (`biome check . && tsc --noEmit`), `registrar` (`tsx src/discord/registrar-comandos.ts`).
- [ ] Implementar `index.ts`: cria o `Client` com os 2 intents, loga `Online como <tag>` no `ClientReady` e trata `SIGTERM` (o Railway envia ao redeployar) com `client.destroy()` e encerramento da conexão do banco.
- [ ] **Dockerfile** multi-stage `node:22-alpine`: estágio de build (`npm ci && npm run build`) e estágio final só com `dist/`, `node_modules` de produção e `config.json`, rodando como usuário `node`.
- [ ] **CI** (`ci.yml`): em `push` e `pull_request`, roda `npm ci`, `npm run check` e `npm test`. Dependabot semanal para `npm` e `github-actions`.
- [ ] **GitHub:** repositório **privado**, proteção da `main` (PR + CI verde obrigatório), Secret scanning e Push protection ativos.
- [ ] **Railway:** conectar o repo, Builder = Dockerfile, ativar **"Wait for CI"** e cadastrar as variáveis. Nenhum domínio público é necessário (o bot é um worker).
- [ ] **Verificação:** push na `main`, o CI fica verde, o Railway faz o deploy e o log mostra `Online como …`. O bot aparece online no servidor.
- [ ] Commit `chore: esqueleto do bot, CI e deploy`.

---

### Tarefa 2: Banco de dados, repositório e criptografia

**Files:** create `supabase/migrations/<ts>_schema_inicial.sql`, `src/db/client.ts`, `src/db/repo.ts`, `src/dominio/email.ts`, `src/dominio/cripto.ts`; tests `tests/dominio/email.test.ts`, `tests/dominio/cripto.test.ts`, `tests/db/repo.test.ts`

**Interfaces:**
- Produces (tipos, em `src/db/repo.ts`):
  - `Assinante = { emailHash: string; emailCifrado: string; nome: string | null; plano: string | null; status: 'ATIVA' | 'INATIVA'; importadoEm: Date }`
  - `AssinanteNovo = Omit<Assinante, 'importadoEm'>` · `ImportacaoMeta = { adminId: string; total: number; ativos: number; novos: number; inativados: number }`
  - `Vinculo = { discordId: string; emailHash: string; vinculadoEm: Date; inativoDesde: Date | null }`
  - `CodigoNovo = { discordId: string; emailHash: string; codigoHash: string; expiraEm: Date }`
  - `TipoEvento = 'CARGO_DADO' | 'CARENCIA_INICIADA' | 'CARGO_REMOVIDO' | 'VINCULO_CRIADO' | 'VINCULO_MANUAL' | 'VINCULO_REMOVIDO' | 'EMAIL_CONFLITO' | 'IMPORTACAO' | 'SYNC_ABORTADA' | 'ERRO_PERMISSAO'`
- Produces (domínio):
  - `normalizarEmail(bruto: string): string | null` (trim, minúsculas, valida formato; inválido → `null`)
  - `mascararEmail(email: string): string` (`fulano@gmail.com` → `fu***@gmail.com`)
  - `hmacEmail(email: string, chave: Buffer): string` (hex)
  - `cifrar(texto: string, chave: Buffer): string` / `decifrar(cifrado: string, chave: Buffer): string` (AES-256-GCM, formato `iv.tag.dados` em base64)
  - `hashCodigo(codigo: string, discordId: string): string` (SHA-256 de `discordId:codigo`)
- Produces (repo), todas `async`:
  - `upsertAssinantes(linhas: AssinanteNovo[], importacao: ImportacaoMeta): Promise<void>` (numa **transação**)
  - `listarAssinantes(): Promise<Assinante[]>` · `buscarAssinante(emailHash): Promise<Assinante | null>`
  - `buscarVinculoPorDiscord(id)` · `buscarVinculoPorEmail(hash)` · `criarVinculo(discordId, emailHash)` · `removerVinculo(discordId)` · `listarVinculos(): Promise<Vinculo[]>` · `marcarInativoDesde(discordId, data | null)`
  - `salvarCodigo(c: CodigoNovo)` · `buscarCodigo(discordId)` · `incrementarTentativa(discordId)` · `apagarCodigo(discordId)` · `contarPedidosUltimaHora(discordId): Promise<number>`
  - `registrarEvento(e: { discordId?: string; tipo: TipoEvento; detalhe?: string })`
  - `limpezaRetencao(agora: Date): Promise<{ codigos: number; vinculos: number }>`
  - `ping(): Promise<void>` (`select 1`, usado no health e para detectar banco fora do ar)

**Schema (Postgres).** Igual à seção 6.5 do spec, com estes ajustes:
- `assinantes(email_hash text pk, email_cifrado text, nome text, plano text, status text check (status in ('ATIVA','INATIVA')), importado_em timestamptz)`
- `vinculos(discord_id text pk, email_hash text unique not null, vinculado_em timestamptz, inativo_desde timestamptz null)`
- `codigos_verificacao(discord_id text pk, email_hash text, codigo_hash text, expira_em timestamptz, tentativas int default 0)`
- `pedidos_codigo(id bigserial, discord_id text, criado_em timestamptz default now())`, que alimenta o limite de 3 pedidos por hora
- `eventos(id bigserial, quando timestamptz default now(), discord_id text, tipo text, detalhe text)`
- `importacoes(id bigserial, quando timestamptz, admin_id text, total int, ativos int, novos int, inativados int)`
- **`alter table … enable row level security` em todas, sem policies.** Assim a API pública do Supabase (chave `anon`) não lê nada, e só a conexão direta do bot (role `postgres`) acessa.

- [ ] **Testes de domínio:** `normalizarEmail('  Fulano@Gmail.COM ') === 'fulano@gmail.com'`; `normalizarEmail('sem-arroba') === null`; `mascararEmail('ab@x.com') === 'a***@x.com'`; `decifrar(cifrar(x,k),k) === x`; `cifrar` duas vezes gera textos diferentes (IV aleatório); `decifrar` com outra chave lança erro; `hmacEmail` é determinístico e muda com a chave.
- [ ] Implementar `email.ts` e `cripto.ts` só com `node:crypto` (sem dependência externa).
- [ ] Criar a migration com `supabase migration new schema_inicial` e testar localmente com `supabase start` + `supabase db reset` (requer Docker Desktop).
- [ ] **Testes de repo** contra o Supabase local (`DATABASE_URL` do `supabase status`): upsert de 2 assinantes e depois `buscarAssinante` encontra; criar o mesmo `email_hash` em dois vínculos viola `unique`; `limpezaRetencao` apaga código expirado e vínculo com `inativo_desde` de 13 meses atrás. Marcar esses testes com `describe.runIf(process.env.DATABASE_URL_TEST)` para o CI poder pulá-los (ou rodá-los com o serviço Postgres do Actions).
- [ ] Implementar `client.ts` (postgres.js, `max: 5`, `prepare: false` por causa do pooler) e `repo.ts`.
- [ ] Aplicar em produção: `supabase link` + `supabase db push`. Conferir no Dashboard que o RLS está ativo em todas as tabelas (o *Security Advisor* do Supabase aponta tabelas sem RLS).
- [ ] Commit `feat: schema, repositório e criptografia de e-mail`.

---

### Tarefa 3: Importação do CSV (`/admin importar`)

**Files:** create `src/dominio/importacao.ts`, `src/servicos/importador.ts`, `src/discord/interacoes/confirmacaoImport.ts`, `src/discord/comandos/admin.ts` (subcomando `importar`), `src/discord/roteador.ts`, `src/discord/registrar-comandos.ts`; tests `tests/dominio/importacao.test.ts`, fixtures `tests/fixtures/*.csv`

**Interfaces:**
- Consumes: `normalizarEmail`, `hmacEmail`, `cifrar`, `repo.listarAssinantes`, `repo.listarVinculos`, `repo.upsertAssinantes`
- Produces:
  - `lerCsv(texto: string, cfg: Config['csv']): { linhas: LinhaAssinante[]; erros: ErroLinha[] }`, onde `LinhaAssinante = { email, nome, plano, ativo: boolean }` e `ErroLinha = { linha: number; motivo: string }`
  - `calcularDiff(novas: LinhaAssinante[], atuaisHash: Map<string, Assinante>, vinculados: Set<string>, hmac: (e: string) => string): DiffImportacao`, onde `DiffImportacao = { novos, reativados, inativados, inalterados, inativadosVinculados, percentualInativadosVinculados }`
  - `importador.previsualizar(texto, adminId): Promise<{ token: string; diff: DiffImportacao; erros: ErroLinha[] }>` (guarda o diff em memória por **10 min**, indexado por `token`)
  - `importador.aplicar(token, adminId): Promise<DiffImportacao>`, que grava e dispara `sincronizador.executar('importacao')`

**Regras de leitura:**
- Remover BOM. Detectar o separador (`;` ou `,`) pela primeira linha. Tentar UTF-8 e, se aparecer `�`, decodificar como `latin1`.
- Localizar as colunas pelo nome configurado, ignorando maiúsculas e acentos. Se faltar uma coluna obrigatória, o erro é **fatal** e nada é aplicado.
- Linha com e-mail inválido vira `ErroLinha` e é ignorada. E-mail duplicado: vale a ocorrência **ativa**.
- Arquivo com 0 linhas válidas é recusado com erro fatal.
- Se `csvContemSoAtivos=true`, assinante atual ausente do arquivo conta como inativo.

- [ ] **Testes (com fixtures):** `excel-ponto-e-virgula-bom.csv` é lido corretamente; `latin1.csv` preserva "João"; `sem-coluna-status.csv` dá erro fatal citando a coluna; `vazio.csv` dá erro fatal; `duplicado.csv` mantém o ativo; `emails-sujos.csv` normaliza. Em `calcularDiff`, 10 vinculados com 3 inativados resulta em `percentualInativadosVinculados === 30`.
- [ ] Implementar `importacao.ts` com `csv-parse/sync` e validar cada linha com zod.
- [ ] **Comando** `/admin importar arquivo:<attachment>`: `deferReply` efêmero; baixar o anexo (`fetch(anexo.url)`, recusar acima de 5 MB ou se não for `.csv`); `previsualizar`; responder com um embed de resumo (novos, reativados, inativados, vinculados afetados, as 5 primeiras linhas com erro) e os botões `importar:confirmar:<token>` / `importar:cancelar:<token>`.
- [ ] Se `percentualInativadosVinculados > 20`, o primeiro "Confirmar" troca a mensagem por um aviso vermelho com o botão `importar:confirmar-forte:<token>`.
- [ ] Só quem executou o comando pode clicar nos botões (comparar `interaction.user.id`).
- [ ] `roteador.ts`: um único listener `InteractionCreate` que despacha por `commandName` ou pelo prefixo do `customId`, com `try/catch` que responde "Erro inesperado" e loga.
- [ ] `registrar-comandos.ts`: registra os comandos **no servidor** (`Routes.applicationGuildCommands`), o que tem efeito imediato. `/admin` com `setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)`, e o handler também confere o cargo `Diretoria`.
- [ ] **Verificação manual:** importar o CSV anonimizado no servidor de teste, ver o resumo, confirmar e conferir as linhas no Supabase (e-mails cifrados).
- [ ] Commit `feat: importação de CSV com prévia e confirmação`.

---

### Tarefa 4: Sincronização de cargos

**Files:** create `src/dominio/sincronizacao.ts`, `src/servicos/sincronizador.ts`, `src/servicos/cargos.ts`, `src/servicos/auditoria.ts`, `src/discord/eventos/guildMemberAdd.ts`, `src/agendador.ts`; tests `tests/dominio/sincronizacao.test.ts`, `tests/servicos/cargos.test.ts`, `tests/servicos/sincronizador.test.ts`

**Interfaces:**
- Produces:
  - `decidirAcoes(vinculos: Vinculo[], assinantes: Map<string, Assinante>, agora: Date, carenciaDias: number): Acao[]`, com `Acao = { tipo: 'DAR_CARGO' | 'INICIAR_CARENCIA' | 'REMOVER_CARGO' | 'LIMPAR_CARENCIA'; discordId: string }`
  - `cargos.aplicar(acoes: Acao[]): Promise<ResultadoExecucao>` (`{ ok: number; ignorados: {discordId, motivo}[]; falhas: {discordId, codigo}[] }`)
  - `sincronizador.executar(origem: 'importacao' | 'diaria' | 'manual'): Promise<ResultadoExecucao>`
  - `sincronizador.sincronizarMembro(discordId: string): Promise<void>` (usado no `GuildMemberAdd` e após a verificação)
  - `auditoria.registrar(tipo: TipoEvento, discordId: string | null, detalhe: string): Promise<void>` (grava em `eventos` e envia para `#log-bot`)

**Regras (do spec, seção 5.2):**
- Assinatura ativa: gera `DAR_CARGO`, e também `LIMPAR_CARENCIA` se havia `inativo_desde`.
- Inativa ou ausente, sem `inativo_desde`: gera `INICIAR_CARENCIA` (grava a data e manda DM de aviso).
- Inativa com `agora - inativo_desde >= carenciaDias`: gera `REMOVER_CARGO` (DM "acesso pausado").
- `DAR_CARGO` para quem já tem o cargo é no-op no executor (checa `member.roles.cache`).

- [ ] **Testes de `decidirAcoes`:** ativo → `DAR_CARGO`; inativo novo → `INICIAR_CARENCIA`; inativo há 6 dias → nenhuma ação; inativo há 7 dias → `REMOVER_CARGO`; reativado em carência → `DAR_CARGO` + `LIMPAR_CARENCIA`; e-mail ausente da base conta como inativo.
- [ ] **Testes do executor** (com `GuildMember` falso): erro `10007` vai para `ignorados` sem lançar; erro `50013` vai para `falhas` e a auditoria recebe a mensagem *"Mova o cargo do bot acima de Associado"*; uma falha não interrompe os demais membros; DM recusada (`50007`) é ignorada.
- [ ] **Teste do sincronizador:** se `repo.ping()` lança erro, `executar` aborta **antes** de decidir ações, não chama `cargos.aplicar` e registra o evento `SYNC_ABORTADA`.
- [ ] Implementar. Buscar membros com `guild.members.fetch()` uma vez por execução (exige o intent GuildMembers). O discord.js já respeita os rate limits.
- [ ] `agendador.ts`: `cron.schedule('0 4 * * *', …, { timezone: 'America/Sao_Paulo' })` executa `sincronizador.executar('diaria')` e depois `repo.limpezaRetencao`. Ao final, envia o resumo no `#log-bot` ("✅ Sincronização diária: N ativos, M em carência, K removidos").
- [ ] `guildMemberAdd.ts` chama `sincronizarMembro`.
- [ ] Commit `feat: sincronização de cargos com carência`.

---

### Tarefa 5: Comandos da Diretoria

**Files:** modify `src/discord/comandos/admin.ts`; create `tests/discord/admin.test.ts`

**Interfaces:**
- Consumes: repo (vínculos, assinantes, eventos), `sincronizador`, `mascararEmail`, `decifrar`
- Produces: os subcomandos `/admin sincronizar | membro usuario | vincular usuario email | desvincular usuario | relatorio | publicar-verificacao`

- [ ] `vincular`: normaliza o e-mail e recusa se ele estiver vinculado a outra conta (mostra qual). Cria o vínculo, chama `sincronizarMembro` e registra `VINCULO_MANUAL` com o ID do admin.
- [ ] `desvincular`: remove o vínculo e o cargo, e registra o evento.
- [ ] `membro`: embed com e-mail mascarado, status, plano, `inativo_desde` e os últimos 5 eventos.
- [ ] `relatorio`: totais (ativos na base, vinculados, ativos sem vínculo, vinculados inativos, em carência). Botão "Baixar CSV" gera um anexo **com e-mails mascarados**.
- [ ] `publicar-verificacao`: envia ou atualiza em `#verificação` o embed do spec (seção 3.1) com o botão `verificar:inicio` e o link para a política de privacidade.
- [ ] **Teste:** um usuário sem o cargo `Diretoria` (mesmo com Manage Roles) recebe "Sem permissão" e nenhuma escrita acontece no repo.
- [ ] Commit `feat: comandos administrativos`.

---

### Tarefa 6: Verificação self-service

**Files:** create `src/dominio/verificacao.ts`, `src/servicos/verificador.ts`, `src/servicos/mailer.ts`, `src/discord/interacoes/verificacao.ts`, `src/discord/comandos/associado.ts`; tests `tests/dominio/verificacao.test.ts`, `tests/servicos/verificador.test.ts`

**Interfaces:**
- Produces:
  - `gerarCodigo(): string` (`crypto.randomInt(0, 1_000_000)` com zero à esquerda)
  - `verificador.solicitar(discordId: string, emailBruto: string, agora: Date): Promise<'ENVIADO_OU_SILENCIOSO' | 'EMAIL_INVALIDO' | 'LIMITE_PEDIDOS'>`
  - `verificador.confirmar(discordId: string, codigo: string, agora: Date): Promise<'VINCULADO_ATIVO' | 'VINCULADO_INATIVO' | 'CODIGO_INVALIDO' | 'CODIGO_EXPIRADO' | 'TENTATIVAS_ESGOTADAS' | 'EMAIL_JA_VINCULADO'>`
  - `mailer.enviarCodigo(para: string, codigo: string): Promise<void>` (interface `Mailer` injetável, com fake nos testes)

**Fluxo de interface** (spec, seção 3.1):
- Botão `verificar:inicio` abre o modal `verificar:email` (campo `email`, máx. 254). O `showModal` deve ser a **primeira** resposta, sem `defer`.
- O submit do modal faz `deferReply` efêmero e chama `solicitar`. Se o retorno for `ENVIADO_OU_SILENCIOSO`, a mensagem é a fixa *"Se esse e-mail estiver na base…"* com o botão `verificar:codigo`.
- O botão `verificar:codigo` abre o modal `verificar:codigo` (campo de 6 caracteres). O submit chama `confirmar` e responde a mensagem correspondente. Em `VINCULADO_*`, chama `sincronizarMembro`.
- `/associado status` mostra o e-mail mascarado e o status. `/associado desvincular` pede confirmação por botão e então remove o vínculo e o cargo.

- [ ] **Testes do verificador** (repo em memória, mailer fake, relógio fixo):
  - e-mail fora da base → `ENVIADO_OU_SILENCIOSO` e **nenhum** e-mail enviado;
  - e-mail na base → `ENVIADO_OU_SILENCIOSO` e 1 e-mail enviado;
  - 4º pedido na mesma hora → `LIMITE_PEDIDOS`;
  - código certo → `VINCULADO_ATIVO` e o código é apagado;
  - código certo após 15 min → `CODIGO_EXPIRADO`;
  - 5 erros seguidos e depois o código certo → `TENTATIVAS_ESGOTADAS`;
  - e-mail já vinculado a outro `discordId` → `EMAIL_JA_VINCULADO` e um evento de alerta para a Diretoria;
  - comparação de hash do código com `crypto.timingSafeEqual`;
  - com o `repo` lançando erro de conexão, a interface responde "Sistema temporariamente indisponível" (teste no handler).
- [ ] Implementar `mailer.ts` com nodemailer (Brevo SMTP, porta 587, STARTTLS). O template em texto + HTML simples diz que o código expira em 15 min e que, se a pessoa não pediu, pode ignorar.
- [ ] **Verificação manual:** ciclo completo no servidor de teste com 2 contas Discord, incluindo a tentativa de usar o mesmo e-mail na segunda conta.
- [ ] Commit `feat: verificação self-service por código de e-mail`.

---

### Tarefa 7: Operação, segurança e documentação

**Files:** create `.github/workflows/backup.yml`, `docs/runbook-diretoria.md`, `docs/privacidade.md` (publicada via GitHub Pages ou Notion público); modify `src/index.ts`, `src/agendador.ts`

- [ ] **Heartbeat:** a cada 5 min, se o client estiver `ready` e `repo.ping()` responder, o bot faz um `fetch(HEALTHCHECK_URL)`. O **Healthchecks.io** (gratuito) manda e-mail para a Diretoria se os pings pararem. Isso cobre bot caído, Railway parado e Supabase pausado.
- [ ] **Erros:** logs JSON do pino aparecem no painel do Railway. Opcional: **Sentry** (plano gratuito) com `@sentry/node` capturando exceções não tratadas.
- [ ] **Backup semanal** (`backup.yml`, `schedule: '0 7 * * 1'`): `pg_dump` via `DATABASE_URL` (secret do repo), cifrado com **age** (chave pública no repo, chave privada só com a Diretoria) e salvo como artifact com retenção de 90 dias. O e-mail no banco já está cifrado, então o backup tem dupla proteção.
- [ ] **Teste de restauração:** baixar um artifact, decifrar e fazer `psql` no Supabase local. Documentar no runbook.
- [ ] **Política de privacidade** curta: quais dados são usados, por que, por quanto tempo e como pedir exclusão (`/associado desvincular`). Linkar na mensagem de `#verificação`.
- [ ] **Runbook da Diretoria** (`docs/runbook-diretoria.md`): exportar o CSV do Catarse passo a passo com prints; usar `/admin importar`; o que fazer com o alerta de >20%; o que fazer se o Healthchecks avisar; como girar as chaves (`DISCORD_TOKEN`, `SMTP_PASS`); como restaurar um backup.
- [ ] **Revisão de segurança:** rodar `npm audit --omit=dev` e conferir que nenhum segredo aparece nos logs (pino com `redact: ['*.email', '*.codigo', 'smtp.pass']`).
- [ ] Commit `chore: monitoramento, backup e documentação operacional`.

---

### Tarefa 8: Piloto e lançamento

- [ ] Usar um **servidor Discord de teste** (cópia da estrutura) com um segundo app/bot "dev" e uma **branch `dev`** com deploy num segundo serviço do Railway. Mesmo Supabase com um **schema** separado, ou um segundo projeto gratuito.
- [ ] **Piloto** com 5–10 associados por 1 semana. Coletar dúvidas e ajustar os textos das mensagens.
- [ ] **Lançamento:** importar o CSV completo, publicar a mensagem de verificação, anunciar em `#boas-vindas` e nas redes da Associação.
- [ ] **Pós-lançamento** (2 semanas): acompanhar `/admin relatorio` (ativos sem vínculo) e mandar lembrete aos associados que não vincularam.

---

## Custos esperados

| Serviço | Plano | Custo |
|---|---|---|
| Railway | Hobby (inclui US$ 5 de uso) | US$ 5/mês |
| Supabase | Free (500 MB, não pausa porque o bot usa diariamente) | R$ 0 |
| GitHub | Free (repo privado, 2.000 min/mês de Actions) | R$ 0 |
| Brevo | Free (~300 e-mails/dia) | R$ 0 |
| Healthchecks.io / Sentry | Free | R$ 0 |
| **Total** | | **≈ US$ 5/mês** |

## O que conscientemente NÃO faremos (YAGNI)
- Painel web próprio: o Discord e o Dashboard do Supabase já cumprem esse papel.
- Cargos por plano (Fundador, Ouro…): só serão feitos se a Tarefa 0 confirmar que existem níveis. Nesse caso, `Acao` ganha `roleId` e o `config.json` ganha um mapa `plano → roleId`.
- Linked Roles: fica como evolução futura (spec, seção 10). O banco e a importação continuam reaproveitáveis.
- Scraping do Catarse: frágil e possivelmente contra os termos de uso.
- Framework de bot (Sapphire, Necord): para cerca de 10 comandos, o roteador simples é menos coisa para aprender.
- ORM: com cerca de 15 consultas, SQL direto em um único arquivo (`repo.ts`) é mais simples de auditar.

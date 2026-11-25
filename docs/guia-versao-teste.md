# Guia: subir a versão de teste

Ambiente: servidor Discord de teste + Railway (plano Free) + Supabase (plano Free) + GitHub (repositório privado).
Tempo estimado: 30–45 minutos.

---

## 1. Servidor Discord de teste

1. Crie um servidor novo (ex.: "APRPG – Teste").
2. **Cargos** (Configurações do servidor → Cargos), nesta ordem, de cima para baixo:
   `Diretoria` › *(o cargo do bot aparece aqui depois de convidá-lo)* › `Associado`.
   Dê o cargo `Diretoria` a você mesmo.
3. **Canais:**
   - `#verificação`: todos veem e ninguém escreve (o bot publica a mensagem com o botão).
   - `#log-bot`: só `Diretoria` vê.
   - Categoria `🔒 ASSOCIADOS` com um canal qualquer dentro. Nas permissões da categoria: `@everyone` → Ver canal ❌ e `Associado` → Ver canal ✅.
4. Ative o **Modo Desenvolvedor** (Configurações do usuário → Avançado). Depois clique com o botão direito em cada item e use "Copiar ID" para anotar: ID do servidor, dos cargos `Associado` e `Diretoria` e dos canais `#verificação` e `#log-bot`.

## 2. Aplicação no Discord Developer Portal

1. Acesse https://discord.com/developers/applications, clique em **New Application** e dê o nome "Bot Associação (teste)".
2. **General Information:** copie o **Application ID** (vai em `DISCORD_CLIENT_ID`).
3. Aba **Bot:**
   - **Reset Token**, copie o token (vai em `DISCORD_TOKEN`). Não compartilhe.
   - Public Bot: **desligado**.
   - **Server Members Intent: ligado.** Message Content Intent: desligado.
4. **OAuth2 → URL Generator:**
   - Scopes: `bot` e `applications.commands`.
   - Bot permissions: Manage Roles, View Channels, Send Messages, Embed Links, Read Message History.
   - Abra a URL gerada e adicione o bot ao servidor de teste.
5. No servidor, em **Cargos**, arraste o cargo do bot para **acima de `Associado`**.

## 3. Supabase (banco)

1. Em https://supabase.com, crie um projeto na região **South America (São Paulo)** e guarde a senha do banco.
2. Clique em **Connect** (topo da página) → **Session pooler** e copie a URI. Ela tem a forma:
   `postgresql://postgres.<ref>:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
   Troque `<SENHA>` pela senha do banco. Essa URI vai em `DATABASE_URL`.
3. Não é preciso criar tabelas: o bot cria tudo sozinho na primeira vez que sobe, dentro do schema
   **`associados`** (no Table Editor, troque o seletor de schema de `public` para `associados` para ver).
   Por isso dá para reaproveitar o Supabase de outro projeto: o bot não cria nem altera nada em `public`.
   Para remover tudo do bot depois: `drop schema associados cascade;` no SQL Editor.

## 4. Chaves de criptografia

Rode duas vezes no terminal (uma para cada chave):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use uma em `EMAIL_ENC_KEY` e a outra em `EMAIL_HMAC_KEY`. **Guarde as duas num gerenciador de senhas.** Se alguma se perder, os e-mails já gravados não poderão mais ser lidos nem buscados, e será preciso importar o CSV de novo e refazer os vínculos.

## 5. GitHub

1. Crie um repositório **privado** (ex.: `bot-associacao`).
2. Envie este projeto:
   ```bash
   git remote add origin https://github.com/<conta>/bot-associacao.git
   ```
   ```bash
   git push -u origin feat/bot-teste
   ```
3. O GitHub Actions roda lint, tipos e testes a cada push (aba **Actions**).

## 6. Railway (plano Free)

1. Em https://railway.com, clique em **New Project → Deploy from GitHub repo** e escolha o repositório e a branch `feat/bot-teste` (ou `main`, depois do merge).
2. O Railway detecta o `Dockerfile` sozinho.
3. Na aba **Variables**, cadastre:

| Variável | Valor |
|---|---|
| `DISCORD_TOKEN` | token do bot |
| `DISCORD_CLIENT_ID` | Application ID |
| `GUILD_ID` | ID do servidor de teste |
| `ROLE_ASSOCIADO_ID` | ID do cargo Associado |
| `ROLE_DIRETORIA_ID` | ID do cargo Diretoria |
| `CHANNEL_LOG_ID` | ID do `#log-bot` |
| `CHANNEL_VERIFICACAO_ID` | ID do `#verificação` |
| `DATABASE_URL` | URI do Session pooler |
| `EMAIL_ENC_KEY` / `EMAIL_HMAC_KEY` | chaves do passo 4 |
| `MAILER_MODO` | `console` (o código aparece no log do Railway) ou `smtp` |
| `CARENCIA_DIAS` | `7` (use `0` para testar a remoção imediata) |

   Para enviar e-mails de verdade, use `MAILER_MODO=smtp` e preencha também `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS` e `EMAIL_FROM`.
4. Faça o deploy. Nos **Logs** devem aparecer: `Banco pronto`, `Online como ...` e `Comandos registrados`.

> **Plano Free do Railway:** o crédito é de US$ 1/mês. Se ele acabar, o serviço fica parado até o mês seguinte. Para um teste curto isso basta. Para manter o bot ligado continuamente, mude para o Hobby (US$ 5).

## 7. Roteiro de teste

1. **Importar:** edite `tests/fixtures/assinantes-teste.csv` com e-mails de teste (inclua um seu). No `#log-bot`, rode `/admin importar` e anexe o arquivo. Confira a prévia e clique em **Confirmar importação**.
2. **Publicar o botão:** rode `/admin publicar-verificacao`.
3. **Verificar (com uma segunda conta Discord, sem o cargo Diretoria):**
   - Em `#verificação`, clique em **Sou associado** e informe um e-mail do CSV.
   - Pegue o código no log do Railway (modo `console`) ou na caixa de entrada (modo `smtp`).
   - Clique em **Inserir código** e digite o código. O cargo `Associado` deve aparecer e a categoria privada deve ficar visível.
4. **Conferir:** rode `/associado status` (como membro), `/admin membro`, `/admin relatorio` e veja os registros no `#log-bot`.
5. **Remoção:** importe um CSV **sem** aquele e-mail. Com `CARENCIA_DIAS=0`, rode `/admin sincronizar` e o cargo deve sair. Com `7`, o membro entra em carência e recebe uma DM de aviso.
6. **Proteções:**
   - Pedir código 4 vezes em 1 hora deve ser bloqueado.
   - Usar o mesmo e-mail numa terceira conta deve ser bloqueado, com alerta no `#log-bot`.
   - Mover o cargo do bot para baixo de `Associado` e sincronizar deve gerar um alerta de permissão no `#log-bot`.

## Rodar localmente (opcional)

```bash
npm ci
```
```bash
npm test
```
Para rodar o bot no seu computador, copie `.env.example` para `.env`, preencha e rode:
```bash
npx tsx --env-file=.env src/index.ts
```

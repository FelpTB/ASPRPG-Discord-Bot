# Detalhamento: Ponta do Discord (Bot de Associados)

> Continuação de `Pesquisa - Integração Catarse x Discord.md`.
> Escopo: como o lado do Discord funciona, como implementar e onde hospedar.
> Decisão adotada: **opção A (bot com botões e comandos)**. Linked Roles fica como evolução futura (seção 10).

---

## 1. Visão geral

```
                         ┌─────────────────────────────────────────┐
                         │            BOT DA ASSOCIAÇÃO            │
  Admin ── CSV ────────▶ │  Importador CSV ──▶ tabela assinantes   │
  (Catarse Estúdio)      │                                         │
                         │  Verificação ─────▶ tabela vinculos     │
  Membro ── botão ─────▶ │   (e-mail + código)  discord_id ↔ email │
          ◀─ código ──── │  Envio de e-mail (SMTP)                 │
            por e-mail   │                                         │
                         │  Sincronizador (diário + pós-import)    │
                         │   compara vinculos × assinantes         │
                         └───────────────┬─────────────────────────┘
                                         │ API do Discord
                                         ▼
                           Servidor: dá/remove cargo "Associado"
                           Canal #log-bot: registra tudo
```

Tudo roda em **um único processo Node.js**: bot, importador, envio de e-mail e agendador. Não precisa de site nem de domínio.

---

## 2. Estrutura do servidor Discord

### 2.1 Cargos (ordem da hierarquia, de cima para baixo)
| Cargo | Função |
|---|---|
| `Diretoria` | Admins humanos. Usam os comandos `/admin`. |
| `Bot Associação` | Cargo do bot. **Precisa ficar acima de `Associado`**, senão o bot não consegue atribuí-lo. |
| `Associado` | Dado e removido **somente pelo bot**. Libera as áreas exclusivas. |
| *(opcional)* `Associado Fundador`, `Associado Ouro`… | Um por plano do Catarse, se houver níveis diferentes. |
| `@everyone` | Visitantes (não associados). |

### 2.2 Canais
```
📢 PÚBLICO (todos veem)
   #boas-vindas        regras + explicação de como virar associado (link do Catarse)
   #verificação        mensagem fixa do bot com o botão "Sou associado"
   #geral, #eventos-abertos…

🔒 ASSOCIADOS (categoria privada)
   permissões da categoria: @everyone → Ver canal ❌ | Associado → Ver canal ✅
   #mural-associados, #mesas, #votações, 🔊 Mesa 1, 🔊 Mesa 2…

🛠️ STAFF
   #log-bot            apenas Diretoria + bot; o bot registra cada ação
```
As permissões ficam na **categoria**, e os canais herdam. Assim, ao criar um canal novo na categoria, ele já nasce restrito.

---

## 3. Experiência do membro (fluxo de verificação)

### 3.1 Passo a passo
1. A pessoa entra no servidor e vê só os canais públicos.
2. Em `#verificação` há uma mensagem fixa do bot:
   > **Área de Associados** — Se você é associado(a) pelo Catarse, clique abaixo e informe o e-mail usado no Catarse.
   > `[ ✅ Sou associado ]`
3. Ao clicar, abre um **modal** (pop-up) com o campo *"E-mail usado no Catarse"*.
4. O bot responde com uma mensagem **efêmera** (só a pessoa vê):
   > Se esse e-mail estiver na base de associados, enviamos um código de 6 dígitos. Ele vale por 15 minutos.
   > `[ 🔑 Inserir código ]`
   - A resposta é **sempre a mesma**, exista o e-mail ou não. Isso impede que alguém descubra quem é associado testando e-mails.
5. A pessoa recebe o e-mail *"Seu código de verificação: 482913"*.
6. Ela clica em **Inserir código**, digita no modal e o bot confere.
7. Se o código estiver correto:
   - O bot grava o vínculo `discord_id ↔ email`.
   - Se a assinatura estiver **ativa**, o bot dá o cargo `Associado` e responde: *"Pronto! Bem-vindo(a) à área de associados 🎲"*.
   - Se o vínculo for feito mas a assinatura estiver **inativa**, o bot responde: *"Seu e-mail foi vinculado, mas não encontramos assinatura ativa. Assim que ela estiver ativa, o cargo será liberado automaticamente."*
8. No canal `#log-bot` fica registrado: `✅ @Fulano vinculado a fu***@gmail.com — cargo concedido`.

### 3.2 Regras de segurança da verificação
| Regra | Valor sugerido |
|---|---|
| Validade do código | 15 minutos |
| Tentativas erradas por código | 5 (depois disso o código é invalidado) |
| Pedidos de código por usuário | 3 por hora |
| Armazenamento do código | **hash** (nunca o código em texto puro) |
| Um e-mail ↔ uma conta Discord | Se o e-mail já estiver vinculado a outra conta, a verificação é bloqueada e a Diretoria é avisada no `#log-bot`. Isso evita que um associado "empreste" o acesso. |

### 3.3 Comandos do membro
| Comando | O que faz |
|---|---|
| `/associado status` | Mostra se a conta está vinculada, o e-mail mascarado e o status da assinatura. |
| `/associado desvincular` | Remove o vínculo e o cargo (direito do titular, pela LGPD). |

---

## 4. Ferramentas da Diretoria (comandos admin)

Os comandos ficam visíveis só para quem tem a permissão **Gerenciar Cargos** (`setDefaultMemberPermissions`). O bot também confere o cargo `Diretoria` no código.

| Comando | O que faz |
|---|---|
| `/admin importar arquivo:<CSV>` | Recebe o CSV exportado do Catarse, mostra um **resumo antes de aplicar** (novos, reativados, inativados, linhas com erro) e pede confirmação por botão. Depois, roda a sincronização. |
| `/admin sincronizar` | Força a sincronização agora. |
| `/admin membro usuario:@x` | Mostra o vínculo, o status, a data da última importação e o histórico daquela pessoa. |
| `/admin vincular usuario:@x email:...` | Vínculo manual, para casos especiais (ex.: a pessoa não recebe e-mail). |
| `/admin desvincular usuario:@x` | Remove o vínculo e o cargo. |
| `/admin relatorio` | Mostra totais: ativos na base, vinculados, **ativos sem vínculo** (associados que ainda não entraram no Discord), vinculados inativos e quem está em carência. Pode gerar um CSV. |
| `/admin publicar-verificacao` | (Re)publica a mensagem com o botão em `#verificação`. |

### 4.1 Rotina da Diretoria
1. **Toda segunda-feira** (ou com a frequência combinada): entrar no Catarse Estúdio → Gerenciador de Assinantes → exportar CSV.
2. No Discord, rodar `/admin importar`, anexar o arquivo, conferir o resumo e confirmar.
3. Se o resumo mostrar algo estranho (ex.: "200 inativados"), **cancelar**. Provavelmente o arquivo está errado ou o formato mudou.

> O passo de confirmação protege contra o pior erro possível: importar um CSV vazio ou errado e remover o cargo de todo mundo.

---

## 5. Regras de sincronização

### 5.1 Quando roda
- Logo após cada `/admin importar` confirmado.
- **Diariamente às 04:00**, para aplicar o fim das carências.
- Quando um membro **entra (ou reentra)** no servidor (evento `GuildMemberAdd`): se ele já tem vínculo e assinatura ativa, o cargo volta na hora.

### 5.2 Lógica (para cada vínculo)
```
assinatura = assinantes[vinculo.email]

se assinatura.status == ATIVA:
    garantir cargo Associado (e cargo do plano, se houver)
    limpar "inativo_desde"

senão (inativa, cancelada ou ausente do CSV):
    se "inativo_desde" está vazio → marcar inativo_desde = hoje, mandar DM de aviso
    se hoje - inativo_desde >= CARENCIA (ex.: 7 dias):
        remover cargo, mandar DM "seu acesso foi pausado", logar
```

### 5.3 Status do Catarse
O texto exato da coluna de status **precisa ser confirmado com um CSV real**. O mapeamento fica em configuração:
```json
{ "statusAtivos": ["Ativa", "active", "paid"], "colunaEmail": "Email", "colunaStatus": "Status da Assinatura", "colunaPlano": "Recompensa" }
```
Se o CSV contiver **apenas assinantes ativos**, a ausência do e-mail no arquivo conta como inativo. Se contiver **todos**, vale o que estiver na coluna de status. O importador detecta isso pela presença da coluna.

### 5.4 Salvaguardas
- Se a importação for **inativar mais de 20%** dos vinculados de uma vez, ela exige uma confirmação extra.
- O bot **nunca** mexe em cargos que não gerencia.
- Toda alteração de cargo vai para `#log-bot` e para a tabela `eventos`, para auditoria.

---

## 6. Implementação técnica

### 6.1 Stack
| Item | Escolha | Por quê |
|---|---|---|
| Runtime | **Node.js 22 LTS** | Suporte longo e amplamente hospedável. |
| Linguagem | **TypeScript** | Tipagem ajuda na manutenção por voluntários. |
| Biblioteca Discord | **discord.js v14** (atual 14.27) | A mais usada, com boa documentação em PT/EN. |
| Banco | **SQLite** (`better-sqlite3`) | Um arquivo só, zero administração, sobra para milhares de associados. |
| CSV | `csv-parse` | Lida com `;`/`,`, aspas e BOM do Excel. |
| E-mail | `nodemailer` + SMTP do **Brevo** | O plano gratuito permite ~300 e-mails/dia, muito além do necessário. |
| Agendador | `node-cron` | Para a sincronização diária. |
| Empacotamento | **Docker** | O mesmo ambiente local e no servidor. |

### 6.2 Configuração no Discord Developer Portal
1. Em https://discord.com/developers/applications, clique em **New Application** ("Associação Paulista de RPG").
2. Aba **Bot**:
   - Gere o **Token** e guarde em segredo (vai para `.env`).
   - **Privileged Gateway Intents**: ligue **Server Members Intent**. Ele é necessário para o evento de entrada de membro e para listar membros. Para um bot de um servidor só, não precisa de aprovação.
   - Message Content Intent: **desligado** (não é necessário, porque usamos só botões e comandos slash).
   - Public Bot: **desligado** (só a Diretoria adiciona o bot).
3. Aba **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`.
   - Permissões: **Manage Roles**, **View Channels**, **Send Messages**, **Embed Links**, **Read Message History**.
   - Abra a URL gerada e adicione o bot ao servidor.
4. No servidor, arraste o cargo do bot **acima** de `Associado`.

### 6.3 Variáveis de ambiente (`.env`)
```
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
GUILD_ID=...
ROLE_ASSOCIADO_ID=...
ROLE_DIRETORIA_ID=...
CHANNEL_LOG_ID=...
CHANNEL_VERIFICACAO_ID=...
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM="Associação Paulista de RPG <nao-responda@...>"
CARENCIA_DIAS=7
DB_PATH=/data/associacao.db
EMAIL_ENC_KEY=...            # chave para criptografar e-mails no banco
```

### 6.4 Estrutura do projeto
```
bot-associacao/
├─ src/
│  ├─ index.ts                 # cria o client, registra handlers, inicia o cron
│  ├─ config.ts                # lê .env e config.json (mapeamento CSV)
│  ├─ db/
│  │  ├─ schema.sql
│  │  └─ repo.ts               # funções de acesso: vinculos, assinantes, codigos, eventos
│  ├─ commands/
│  │  ├─ associado.ts          # /associado status | desvincular
│  │  └─ admin.ts              # /admin importar | sincronizar | membro | ...
│  ├─ interactions/
│  │  ├─ verificacao.ts        # botão → modal e-mail → botão → modal código
│  │  └─ confirmacaoImport.ts  # botões Confirmar/Cancelar importação
│  ├─ services/
│  │  ├─ importador.ts         # parse e validação do CSV, geração do diff
│  │  ├─ sincronizador.ts      # regras da seção 5
│  │  ├─ email.ts              # envio do código
│  │  └─ cripto.ts             # hash de código, criptografia de e-mail
│  ├─ events/
│  │  └─ guildMemberAdd.ts
│  └─ deploy-commands.ts       # registra os comandos slash no servidor
├─ config.json
├─ Dockerfile
├─ docker-compose.yml
└─ .env.example
```

### 6.5 Banco de dados (SQLite)
```sql
CREATE TABLE assinantes (
  email_hash     TEXT PRIMARY KEY,   -- sha256(email normalizado) para busca
  email_cifrado  TEXT NOT NULL,      -- AES-GCM, para exibir mascarado/relatórios
  nome           TEXT,
  plano          TEXT,
  status         TEXT NOT NULL,      -- ATIVA | INATIVA
  importado_em   TEXT NOT NULL
);

CREATE TABLE vinculos (
  discord_id     TEXT PRIMARY KEY,
  email_hash     TEXT NOT NULL UNIQUE,  -- 1 e-mail ↔ 1 conta
  vinculado_em   TEXT NOT NULL,
  inativo_desde  TEXT                   -- início da carência
);

CREATE TABLE codigos_verificacao (
  discord_id     TEXT PRIMARY KEY,
  email_hash     TEXT NOT NULL,
  codigo_hash    TEXT NOT NULL,
  expira_em      TEXT NOT NULL,
  tentativas     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE eventos (                  -- auditoria
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando TEXT NOT NULL, discord_id TEXT, tipo TEXT NOT NULL, detalhe TEXT
);

CREATE TABLE importacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando TEXT NOT NULL, admin_id TEXT NOT NULL,
  total INTEGER, ativos INTEGER, novos INTEGER, inativados INTEGER
);
```

### 6.6 Trechos de código-chave (discord.js v14)

**Cliente e intents**
```ts
import { Client, GatewayIntentBits, Events } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});
client.once(Events.ClientReady, c => console.log(`Online como ${c.user.tag}`));
client.login(process.env.DISCORD_TOKEN);
```

**Botão "Sou associado" → modal de e-mail**
```ts
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

if (interaction.isButton() && interaction.customId === 'verificar:inicio') {
  const modal = new ModalBuilder().setCustomId('verificar:email').setTitle('Verificação de associado');
  const email = new TextInputBuilder()
    .setCustomId('email').setLabel('E-mail usado no Catarse')
    .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(254);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(email));
  await interaction.showModal(modal); // tem de ser a 1ª resposta (sem defer)
}
```

**Recebendo o e-mail e enviando o código**
```ts
if (interaction.isModalSubmit() && interaction.customId === 'verificar:email') {
  await interaction.deferReply({ ephemeral: true });
  const email = normalizar(interaction.fields.getTextInputValue('email'));
  if (rateLimitExcedido(interaction.user.id)) return interaction.editReply('Muitas tentativas. Tente em 1 hora.');

  const assinante = repo.buscarAssinante(hash(email));
  if (assinante) {
    const codigo = gerarCodigo6();                       // crypto.randomInt
    repo.salvarCodigo(interaction.user.id, hash(email), hash(codigo), agora() + 15 * 60_000);
    await enviarEmailCodigo(email, codigo);
  }
  // resposta idêntica nos dois casos (anti-enumeração)
  await interaction.editReply({ content: MSG_CODIGO_ENVIADO, components: [botaoInserirCodigo] });
}
```

**Dando o cargo**
```ts
const member = await interaction.guild!.members.fetch(discordId);
await member.roles.add(ROLE_ASSOCIADO_ID, 'Verificado via Catarse');
await logChannel.send(`✅ <@${discordId}> vinculado — cargo concedido`);
```

**Importação: receber o anexo**
```ts
// definição: .addAttachmentOption(o => o.setName('arquivo').setDescription('CSV do Catarse').setRequired(true))
const anexo = interaction.options.getAttachment('arquivo', true);
const texto = await (await fetch(anexo.url)).text();
const diff = importador.analisar(texto);   // não grava nada ainda
await interaction.reply({ ephemeral: true, embeds: [resumo(diff)], components: [botoesConfirmar] });
```

### 6.7 Tratamento de erros importantes
| Situação | Tratamento |
|---|---|
| Bot sem permissão ou cargo abaixo de `Associado` | Erro `50013 Missing Permissions` → avisa em `#log-bot` com instrução de correção. |
| Membro saiu do servidor | Mantém o vínculo. Se ele voltar, `GuildMemberAdd` devolve o cargo se a assinatura estiver ativa. |
| Membro com DMs fechadas | Ignora a falha da DM, porque o aviso já fica no log. |
| Falha no envio do e-mail | Responde de forma neutra e loga o erro para a Diretoria. |
| Bot fora do ar | Nada se perde: na volta, a sincronização diária corrige o estado. |

---

## 7. Hospedagem

### 7.1 Requisitos reais do bot
- Processo **sempre ligado** (conexão WebSocket com o Discord).
- ~100–200 MB de RAM e CPU mínima.
- **Disco persistente** para o arquivo SQLite. Esse é o ponto que mais elimina opções.
- **Não precisa** de domínio, HTTPS nem porta aberta: o bot só faz conexões de saída.

### 7.2 Opções

| Opção | Custo aprox. | Prós | Contras |
|---|---|---|---|
| **VPS Linux + Docker** (Hetzner, Contabo, DigitalOcean, Magalu Cloud…) | ~US$ 4–6/mês | Controle total, disco persistente, roda também backups e outros serviços da Associação. | Alguém precisa saber o básico de Linux. |
| **Oracle Cloud Always Free** (VM ARM) | Grátis | VM completa grátis, generosa em recursos. | Exige cartão para cadastro, configuração mais técnica e risco de a instância ociosa ser recuperada. |
| **Hosts de bot dedicados** (Discloud, Square Cloud, Sparked etc.) | ~R$ 5–20/mês (planos variam) | Upload do projeto e pronto. Discloud e Square Cloud são brasileiros (PIX, suporte em PT). | Confirme se o **disco é persistente** e se há backup. Planos gratuitos costumam ter anúncios e limites. |
| **Railway / Fly.io** (PaaS) | Por uso, ~US$ 5+/mês | Deploy via Git e volumes persistentes. | Sem plano gratuito real para contas novas, e a cobrança por uso é menos previsível. |
| PC de alguém / Raspberry Pi | Grátis | Simples. | Cai quando a luz ou a internet caem. **Não recomendado.** |

### 7.3 Recomendação
1. **Principal:** uma **VPS pequena (~US$ 5/mês) com Docker**. É barata e previsível, e serve para crescer (ex.: depois hospedar o site da opção Linked Roles no mesmo lugar).
2. **Sem orçamento:** **Oracle Cloud Always Free** com o mesmo Docker. Como o projeto é containerizado, migrar depois é trivial.
3. **Sem ninguém com Linux:** **Square Cloud ou Discloud** no plano pago, desde que confirmem armazenamento persistente.

> A conta da hospedagem, do Discord Developer e do Brevo deve ficar num **e-mail institucional da Associação**, com 2FA, e não no e-mail pessoal de um voluntário. Isso evita perder o acesso quando a diretoria mudar.

### 7.3.1 E o Railway? E o GitHub?
- **Railway funciona bem.** No plano Hobby (US$ 5/mês, com US$ 5 de uso incluso) o bot fica ligado 24/7. É preciso criar um **Volume** montado em `/data` para o SQLite não se perder a cada deploy. O deploy é automático a cada `git push` no GitHub, e as variáveis do `.env` ficam no painel. Um bot pequeno deve caber nos US$ 5 inclusos.
- **GitHub não hospeda o bot.** O GitHub Pages só serve sites estáticos, e o GitHub Actions roda tarefas com duração limitada, não processos 24/7. O papel do GitHub é **guardar o código** (repositório da Associação) e **disparar o deploy** (Railway conectado ao repo, ou uma Action que publica na VPS).

### 7.3.2 Dá para ficar 100% gratuito? (GitHub + Railway + Supabase)
- **Supabase gratuito serve como banco.** Ele oferece Postgres com 500 MB, muito mais que o necessário. Um projeto gratuito é pausado após 1 semana sem atividade, mas a sincronização diária mantém o banco ativo. Ele substituiria o SQLite e o Volume.
- **Railway gratuito não serve para o bot.** O plano Free dá só US$ 1/mês de crédito. A documentação diz que serviços *always-on* exigem o plano Hobby (US$ 5). Se o crédito acabar, todos os serviços param até o mês seguinte.
- **Alternativa 100% gratuita: bot sem conexão permanente (HTTP Interactions).** O Discord pode entregar cliques de botão, modais e comandos slash via **HTTP**, apontando o *Interactions Endpoint URL* para uma função serverless. Assim:
  - **Supabase Edge Functions**: recebem as interações (verificam a assinatura Ed25519 e respondem em até 3 s, ou com *defer*), enviam o código por e-mail (API do Brevo) e chamam a API REST do Discord para dar ou tirar o cargo.
  - **Supabase Postgres**: guarda as tabelas.
  - **Sincronização diária**: `pg_cron` + `pg_net` no próprio Supabase chamando uma Edge Function, ou um workflow agendado do GitHub Actions.
  - **GitHub**: guarda o código e faz o deploy das funções (`supabase functions deploy` via Action).
  - **O que se perde:** o evento de entrada no servidor (`GuildMemberAdd`), porque ele só chega por conexão permanente. Quem sair e voltar recebe o cargo de volta na sincronização diária ou clicando de novo em "Sou associado".
  - **Pontos de atenção:** os limites do plano gratuito mudam com frequência. Workflows agendados do GitHub são desativados após 60 dias sem commits num repositório público. E se o Supabase pausar o projeto, o bot para de responder até alguém reativá-lo.
- **Outra opção gratuita com o design original (bot sempre ligado):** Oracle Cloud Always Free + Supabase ou SQLite.

### 7.3.3 Alternativas ao Railway (preços aproximados, nov/2026)
| Plataforma | Menor opção sempre ligada | Modelo de cobrança | Observação |
|---|---|---|---|
| **Fly.io** | ~US$ 2,19/mês (shared-cpu-1x, 256 MB) | Por uso (segundo) | A mais barata em PaaS. Deploy via Dockerfile/CLI. Exige cartão. |
| **Northflank** | Sandbox grátis (2 serviços always-on) / ~US$ 2,70/mês pago | Por uso | O Sandbox é voltado a testes. Confirme os termos antes de usar em produção. |
| **Square Cloud** (BR) | R$ 12,49/mês (Hobby) | Fixo | Pix, suporte em PT e foco em bots Discord. Deploy por upload ou GitHub. |
| **Discloud** (BR) | Grátis (100 MB RAM) / premium ~R$ 10+ | Fixo | O plano gratuito é "discricionário". Confira os preços no checkout. |
| **Render** | US$ 7/mês (Background Worker 512 MB) | Fixo | Previsível, mas mais caro. O plano gratuito só serve para web services que dormem. |
| **Railway** | US$ 5/mês (Hobby) | Assinatura + uso | Referência. |
| **VPS (Hetzner, Contabo, Oracle Free…)** | ~€4/mês ou grátis (Oracle) | Fixo | Melhor custo por recurso, mas exige administrar Linux. |

As fontes são em grande parte comparativos escritos pelos próprios fornecedores. Confira nas páginas oficiais antes de contratar.

### 7.4 Deploy na VPS (resumo)
```yaml
# docker-compose.yml
services:
  bot:
    build: .
    restart: unless-stopped        # reinicia sozinho se cair ou após reboot
    env_file: .env
    volumes:
      - ./data:/data               # SQLite persistente
```
```dockerfile
# Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist ./dist
COPY config.json ./
CMD ["node", "dist/index.js"]
```
Atualizar o bot = `git pull && docker compose up -d --build`. Isso pode ser automatizado com GitHub Actions.

### 7.5 Backup e monitoramento
- **Backup diário** do `associacao.db` (cron na VPS: `sqlite3 .backup`), enviado para armazenamento externo (Google Drive da Associação via `rclone`, ou bucket S3). Mantenha 30 dias.
- **Monitoramento:** o bot manda um "heartbeat" diário em `#log-bot` ("✅ Sincronização diária: 87 ativos, 2 em carência"). Se a mensagem não aparecer, algo caiu. Opcionalmente, use o UptimeRobot com um ping HTTP.
- **Logs:** `docker compose logs -f bot`.

### 7.6 Custo mensal estimado
| Item | Custo |
|---|---|
| VPS | ~US$ 5 (ou R$ 0 na Oracle) |
| E-mail (Brevo, plano gratuito) | R$ 0 |
| Discord | R$ 0 |
| Domínio | Não necessário (opcional ~R$ 40/ano, só para e-mail "bonito") |
| **Total** | **~R$ 0 a 30/mês** |

---

## 8. LGPD aplicada ao bot
- E-mails ficam **criptografados** no banco. A busca usa hash, e a exibição é sempre mascarada (`fu***@gmail.com`).
- Do CSV, só se importam e-mail, nome, plano e status. Endereço e meio de pagamento são **descartados na leitura**.
- O CSV não é salvo em disco: é processado em memória a partir do anexo.
- `/associado desvincular` apaga o vínculo. Vínculos inativos há mais de 12 meses são apagados automaticamente.
- A mensagem de `#verificação` deve ter um link para uma política de privacidade curta.

---

## 9. Plano de entrega (fases)

| Fase | Entrega | Esforço estimado* |
|---|---|---|
| 0 | Criar servidor, cargos e canais; criar app no Developer Portal; conta Brevo; exportar um CSV real e confirmar as colunas | 1 dia |
| 1 | Bot básico: importação CSV com confirmação + `/admin vincular` manual + concessão de cargo | 2–3 dias |
| 2 | Verificação self-service (botão, modais, código por e-mail, rate limit) | 2–3 dias |
| 3 | Sincronização diária, carência, DMs, `GuildMemberAdd`, relatórios | 2 dias |
| 4 | Docker, deploy na VPS, backup, heartbeat | 1 dia |
| 5 | Teste piloto com 5–10 associados → ajustes → lançamento | 1 semana corrida |

\* Para uma pessoa com experiência em JS/TS.

A fase 1 já resolve o problema (a Diretoria vincula manualmente). As fases seguintes tiram o trabalho manual.

---

## 10. Evolução futura: Linked Roles
Quando houver um site com HTTPS (pode ser na mesma VPS), dá para trocar o botão do bot pelo fluxo nativo **Linked Roles**:
- O membro clica no cargo "Associado" no menu do servidor, faz login com Discord (escopo `role_connections.write`) e prova o e-mail com o mesmo código.
- O sincronizador, em vez de `member.roles.add`, grava `associado_ativo: true/false` via `PUT /users/@me/applications/{id}/role-connection`.
- O banco e o importador continuam iguais. Só muda a "saída".

---

## Fontes
- [discord.js Guide – Modals](https://github.com/discordjs/guide/blob/main/guide/interactions/modals.md) · [FAQ – adicionar cargo](https://github.com/discordjs/guide/blob/main/guide/popular-topics/faq.md)
- [Discord – OAuth2 and Permissions](https://docs.discord.com/developers/platform/oauth2-and-permissions)
- [Discord – Privileged Intent Review](https://docs.discord.com/developers/gateway/getting-started-with-privileged-intent-review)
- [Discord – Linked Roles tutorial](https://docs.discord.com/developers/tutorials/configuring-app-metadata-for-linked-roles)
- [Free Discord Bot Hosting 24/7 (2026) – space-node](https://space-node.net/blog/host-discord-bot-free-247-2026) (escrito por um provedor)
- [Discord Bot Hosting Cost 2026 – space-node](https://space-node.net/blog/how-much-does-discord-bot-hosting-cost-2026)
- [Best Discord Bot Hosting 2026 – discordbothost](https://discordbothost.com/blog/best-discord-bot-hosting/)
- [Discord Bot Hosting – Renzom](https://www.renzom.com/blog/discord-bot-hosting)
- [Free vs Paid Bot Hosting – Mamba Host](https://www.mambahost.com/blog/discord-bot-hosting-free-vs-paid/)
- [Brevo free plan – Sender](https://www.sender.net/reviews/brevo/pricing/free-plan) · [Free email sending tiers 2026](https://freetier.co/articles/free-email-sending-tiers-2026)

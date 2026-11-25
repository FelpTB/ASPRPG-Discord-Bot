# Pesquisa: Integração Catarse × Discord para Associados

> Associação Paulista de RPG — pesquisa inicial (25/11/2026)
> Baseada em: `Mensagens de Requisito.txt`

## 1. Resumo do problema

Associados pagam uma assinatura mensal no **Catarse**. A Associação quer um servidor no **Discord** com salas e benefícios exclusivos, e precisa de um sistema que **dê um cargo de "Associado"** a quem tem assinatura ativa no Catarse e **o retire** quando a assinatura deixa de estar ativa.

O ponto central é **ligar duas identidades**: a pessoa no Catarse (identificada por nome/e-mail) e a conta no Discord (identificada por um ID numérico). Nenhuma das duas plataformas faz isso sozinha.

---

## 2. Catarse: quais dados existem e como acessá-los

### 2.1 Existe API pública?
**Não encontrei API pública documentada nem webhooks** para criadores de campanha.

- O Catarse construiu o produto de assinaturas (2017) em cima de uma API interna ("API Comum"). Na época, disseram que esperavam abri-la a desenvolvedores externos no futuro, mas não encontrei sinal de que isso tenha acontecido.
- O código antigo do Catarse era open source (Rails + PostgREST, `catarse/catarse`). O repositório está **descontinuado** e foi substituído por `common-group/services-core`. O endpoint legado `api.catarse.me` **não é oficial para terceiros** e não encontrei documentação dele.
- Em 2026 o Catarse está migrando para o **"Novo Catarse"**: as campanhas de assinatura passam para o **Catarse Estúdio** e as recompensas viram "Planos de Assinatura". Por isso, qualquer integração baseada em endpoints antigos pode deixar de funcionar.

### 2.2 O que o criador consegue obter oficialmente
- **Gerenciador de Assinantes** (Estúdio): lista seguidores gratuitos e assinantes pagantes, com filtros, colunas configuráveis, **relatórios enviados por e-mail** e histórico de pagamentos de cada assinante.
- **Exportação em Excel/CSV** dos assinantes e do histórico de pagamentos, com um **hub de relatórios exportados**. Os campos previstos são: Nome, E-mail, Valor mensal, Total apoiado, Plano/Recompensa, Tempo de assinatura, **Status da assinatura**, Meio de pagamento e Endereço. A lista vem de um post de roadmap, então confirme os campos exportando um arquivo real.
- A **Política de Privacidade** do Catarse diz que dados dos apoiadores (contribuições, datas, valores, meio de pagamento, plano escolhido) são compartilhados com o criador. Ou seja, a Associação **pode usar esses dados** para gerir os associados, desde que respeite a LGPD.

### 2.3 Conclusão sobre o Catarse
A única fonte oficial e estável é o **relatório exportado (CSV/Excel)**. A chave de cruzamento será o **e-mail do assinante**. Raspar o painel com login automatizado (scraping) é frágil e pode violar os termos de uso, então **não recomendo**.

> **Ação sugerida:** abrir um chamado no suporte do Catarse perguntando se existe (ou está prevista) API ou webhook de assinaturas no Novo Catarse. Se existir, o sistema pode ficar 100% automático.

---

## 3. Discord: como trata dados de usuário e o que a API permite

### 3.1 O que um bot enxerga
- Um bot no servidor enxerga **ID, nome de usuário e cargos** dos membros. **Não enxerga o e-mail** de ninguém.
- Para listar todos os membros e receber eventos de entrada e saída, o bot precisa do **intent privilegiado `GUILD_MEMBERS`**. Ele é ativado no Developer Portal e, para um bot pequeno (um servidor só), **não precisa de revisão** da Discord.
- Para dar ou tirar cargos, o bot precisa da permissão **Gerenciar Cargos**, e o cargo do bot deve ficar **acima** do cargo "Associado" na hierarquia.

### 3.2 OAuth2 (o usuário autoriza o app)
Com OAuth2, o próprio usuário autoriza o app a ler dados da conta dele:

| Escopo | O que dá |
|---|---|
| `identify` | ID e nome do usuário |
| `email` | E-mail verificado da conta Discord |
| `guilds.join` | Permite ao app adicionar o usuário ao servidor |
| `role_connections.write` | Permite escrever metadados para **Linked Roles** |

### 3.3 Linked Roles (Cargos Vinculados): recurso nativo para este caso
A Discord criou os **Linked Roles** exatamente para "verificar algo fora do Discord e liberar um cargo":

1. O app registra até **5 campos de metadados** (ex.: `associado_ativo` booleano, `meses_associado` inteiro).
2. O usuário, no servidor, clica no cargo vinculado, é levado ao site do app, faz login no Discord (OAuth `role_connections.write`) e prova quem é.
3. O app grava os metadados do usuário (`PUT /users/@me/applications/{app_id}/role-connection`).
4. O admin do servidor configura: "cargo Associado exige `associado_ativo = true`". A própria Discord concede o cargo.
5. Quando a assinatura cai, o app regrava `associado_ativo = false` (usando o refresh token guardado) e a Discord remove o cargo.

Vantagens: fluxo oficial, visual nativo e menos permissões de bot. Desvantagem: exige um **site com HTTPS** para o OAuth e o armazenamento dos tokens.

### 3.4 Política de dados da Discord (Developer Policy)
- Guardar dados **apenas pelo tempo necessário**. A Discord recomenda no máximo **30 dias** para dados não essenciais.
- **Criptografar** dados pessoais como e-mail.
- **Proibido vender** ou comercializar dados da Discord.
- É preciso ter uma **Política de Privacidade** e Termos para o app, pois o OAuth pede essas URLs.

---

## 4. Sistemas similares (referências)

| Sistema | Como funciona | O que aproveitar |
|---|---|---|
| **Patreon × Discord** (oficial) | O apoiador conecta o Discord na conta Patreon (OAuth dos dois lados). O bot do Patreon mapeia cada tier para um cargo e sincroniza periodicamente. O cargo do bot precisa ficar acima dos cargos que gerencia. | É o modelo ideal: vínculo feito **pelo próprio usuário** e sincronização periódica. Problemas comuns: atraso na atualização de tier e necessidade de reconectar. |
| **Discord Server Subscriptions** (nativo) | Assinatura paga dentro do Discord, com cargo automático. | Não serve aqui, porque o pagamento é pelo Discord e não pelo Catarse. Só vale como comparação. |
| **Bots Stripe → Discord** (open source: `stripe-discord-bot`, `StripeWall`, `Paycord`, `subscription-bot`) | O webhook de pagamento do Stripe aciona o bot, que dá ou tira o cargo. | Boa referência de código (estrutura de bot, banco de dados, sincronização). Mas eles dependem de webhook, que o Catarse não oferece. |
| **SaaS pagos** (Subscord, DoorFee, Portl, AccessDock) | Serviços prontos de paywall para Discord. | Não suportam o Catarse. |
| **Zapier / Make / IFTTT** | Automação sem código entre apps. | Não há conector do Catarse, então só serviriam para tarefas auxiliares. |

**Conclusão:** não existe solução pronta Catarse → Discord. O projeto é **customizado** e o melhor modelo a imitar é o do **Patreon**: o usuário vincula a própria conta e um processo periódico sincroniza o status.

---

## 5. Proposta de arquitetura

```
 ┌───────────────┐   CSV exportado     ┌──────────────────────┐
 │  Catarse      │ ─────────────────▶  │  Sistema da          │
 │  (Estúdio)    │  (admin envia ou    │  Associação          │
 └───────────────┘   e-mail automático)│  - banco: assinantes │
                                       │  - banco: vínculos   │
 ┌───────────────┐  /vincular + código │    email ↔ discordID │
 │  Membro no    │ ◀────────────────▶  │  - bot Discord       │
 │  Discord      │   (ou OAuth)        │  - job de sync       │
 └───────────────┘                     └──────────┬───────────┘
                                                  │ dá/remove cargo
                                                  ▼
                                         Servidor Discord
```

### 5.1 Fluxos
1. **Importação de assinantes:** o admin exporta o CSV do Catarse e envia ao sistema (comando `/importar` com anexo, ou um painel web). O sistema atualiza a tabela `assinantes(email, nome, plano, status, atualizado_em)`.
   - *Evolução:* se o Estúdio enviar relatórios por e-mail, um leitor IMAP pode importar automaticamente.
2. **Vínculo do membro:** o membro entra no servidor, vai ao canal `#verificação` e usa `/associado email:fulano@x.com`.
   - O bot envia um **código de 6 dígitos para esse e-mail**, o que prova que a pessoa é dona do e-mail usado no Catarse.
   - O membro digita o código e o sistema grava `vinculo(discord_id, email)`.
   - Se o e-mail estiver ativo na base, o bot dá o cargo **Associado**.
   - *Por que não usar só o e-mail do Discord via OAuth?* Muitas pessoas usam e-mails diferentes nas duas plataformas. O código por e-mail resolve isso. O OAuth com `email` pode ser um atalho opcional quando os e-mails coincidirem.
3. **Sincronização:** a cada nova importação ou por agendamento, o sistema compara vínculos com assinantes.
   - Assinatura inativa: remove o cargo, com **período de carência** (ex.: 7 dias, para cobrir falha de cartão e retentativas) e aviso por DM.
   - Assinatura reativada: devolve o cargo automaticamente.
4. **Administração:** comandos para status, vínculo manual, desvincular e relatório de quem está sem vínculo.

### 5.2 Duas opções de implementação

| | **A) Bot com comandos (recomendado para começar)** | **B) Linked Roles** |
|---|---|---|
| Infra | Só o bot (sem site) | Bot ou serviço + site HTTPS para OAuth |
| Quem dá o cargo | Bot (Gerenciar Cargos) | A Discord, com base nos metadados |
| Complexidade | Baixa | Média |
| Experiência | Comando slash no canal | Botão nativo "Vincular" no menu de cargos |

Dá para começar com **A** e migrar para **B** depois, reaproveitando o mesmo banco.

### 5.3 Stack sugerida
- **Linguagem:** Node.js + `discord.js`, ou Python + `discord.py`. Ambos têm comandos slash, modais e anexos.
- **Banco:** SQLite (simples) ou PostgreSQL. Criptografar a coluna de e-mail.
- **E-mail de verificação:** SMTP (Gmail, Brevo, Resend etc.).
- **Hospedagem:** VPS pequena, Railway, Fly.io ou similar. Custo baixo, já que é um servidor só.

---

## 6. LGPD e segurança
- Base legal: execução do contrato de associação. Informe no Discord **quais dados são usados e por quê** (link para uma política de privacidade simples).
- Importe **só as colunas necessárias** do CSV (e-mail, nome, status, plano). Descarte endereço e meio de pagamento.
- Apague o CSV bruto após a importação e permita que o membro peça a exclusão do vínculo (`/desvincular`).
- Guarde o token do bot em variável de ambiente e nunca no código.

## 7. Riscos e limitações
- **Sincronização manual:** sem API ou webhook, o status só fica tão atualizado quanto o último CSV importado. Combinem uma rotina (ex.: semanal).
- **Mudança de formato:** a migração para o Novo Catarse pode alterar as colunas do CSV. O importador deve mapear colunas por nome e validar o arquivo.
- **E-mail trocado:** se o associado trocar de e-mail no Catarse, é preciso refazer o vínculo.

## 8. Perguntas em aberto para a Associação
1. Existem **planos/níveis diferentes** de associado que devam virar cargos diferentes?
2. Qual **carência** aplicar quando um pagamento falha?
3. Quem será o **admin** responsável por exportar o CSV, e com que frequência?
4. A Associação já tem **hospedagem/domínio**? Isso é necessário apenas para a opção B (Linked Roles).
5. Vale consultar o suporte do Catarse sobre API/webhook antes de começar?

---

## Fontes
**Catarse**
- [Catarse Assinaturas](https://crowdfunding.catarse.com.br/assinaturas)
- [A construção do código do Catarse Assinaturas (Medium)](https://medium.com/catarse/codigo-catarse-assinaturas-ed7c26695b9a)
- [Roadmap do Assinaturas (campos do export)](https://blog.catarse.com.br/post/o-roadmap-do-assinaturas-o-que-estamos-planejando-para-os-proximos-meses)
- [Funcionalidades do Novo Catarse](https://www.catarse.com.br/posts/confira-todas-as-funcionalidades-do-novo-catarse)
- [O que mudou no Catarse (2026)](https://blog.catarse.com.br/post/confira-algumas-das-funcionalidades-que-chegam-no-novo-catarse-em-2026)
- [#26: Hub de relatórios exportados](https://www.catarse.com.br/posts/26-hub-de-relatorios-exportados-e-opcao-duplicar-recompensa-no-estudio)
- [Migração das campanhas de assinatura](https://suporte.catarse.com.br/hc/pt-br/articles/45985786203668-Como-ser%C3%A1-a-migra%C3%A7%C3%A3o-das-campanhas-de-assinatura-para-o-Novo-Catarse)
- [Changelog (problema de exportação)](https://crowdfunding.catarse.com.br/changelog?042264d1_page=2&5f7abf9c_page=1&cd37f99a_page=6)
- [Política de Privacidade – Apoiadores](https://crowdfunding.catarse.com.br/legal/politica-de-privacidade/apoiadores)
- [Repositório catarse/catarse (descontinuado)](https://github.com/catarse/catarse/wiki/%5BEnglish%5D-How-to-install-and-run-Catarse/_history)

**Discord**
- [OAuth2 and Permissions](https://docs.discord.com/developers/platform/oauth2-and-permissions)
- [Application Role Connection Metadata](https://docs.discord.com/developers/resources/application-role-connection-metadata)
- [Tutorial: Configuring App Metadata for Linked Roles](https://docs.discord.com/developers/tutorials/configuring-app-metadata-for-linked-roles)
- [Privileged Intent Review](https://docs.discord.com/developers/gateway/getting-started-with-privileged-intent-review)
- [Discord Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy)

**Sistemas similares**
- [Patreon × Discord (Discord)](https://discord.com/safety/patreon-x-discord)
- [Patreon – troubleshooting da integração](https://www.patreon.com/posts/155033459)
- [stripe-discord-bot](https://github.com/ephemeralrogue/stripe-discord-bot) · [StripeWall](https://github.com/SenorKarlos/StripeWall) · [Paycord](https://github.com/WardPearce/Paycord)

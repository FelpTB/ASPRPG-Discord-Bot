import { readFileSync } from 'node:fs';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { iniciarAgendador } from './agendador.js';
import { carregarConfig } from './config.js';
import { conectar } from './db/client.js';
import { migrar } from './db/migrar.js';
import { criarRepo } from './db/repo.js';
import { todosOsComandos } from './discord/comandos/definicoes.js';
import type { Contexto } from './discord/contexto.js';
import { criarPortaDiscord, enviarParaCanal } from './discord/porta.js';
import { rotearInteracao } from './discord/roteador.js';
import { logger } from './logger.js';
import { criarAuditoria } from './servicos/auditoria.js';
import { criarImportador } from './servicos/importador.js';
import { criarMailer } from './servicos/mailer.js';
import { criarSincronizador } from './servicos/sincronizador.js';
import { criarVerificador } from './servicos/verificador.js';
import { criarGestaoVinculos } from './servicos/vinculos.js';

const config = carregarConfig(process.env, JSON.parse(readFileSync('config.json', 'utf8')));

const sql = conectar(config.databaseUrl);
const aplicadas = await migrar(sql, 'supabase/migrations');
logger.info(`Banco pronto (${aplicadas} migrações aplicadas agora)`);

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const repo = criarRepo(sql);
const porta = criarPortaDiscord(client, config.guildId, config.roleAssociadoId);
const auditoria = criarAuditoria(repo, (texto) => enviarParaCanal(client, config.canalLogId, texto));
const sincronizador = criarSincronizador({ repo, porta, auditoria, carenciaDias: config.carenciaDias });
const chaves = { emailEncKey: config.emailEncKey, emailHmacKey: config.emailHmacKey };

const ctx: Contexto = {
  client,
  config,
  repo,
  auditoria,
  sincronizador,
  importador: criarImportador({
    repo,
    csv: config.csv,
    ...chaves,
    aoAplicar: () => sincronizador.executar('importacao'),
  }),
  verificador: criarVerificador({
    repo,
    mailer: criarMailer(config),
    auditoria,
    emailHmacKey: config.emailHmacKey,
    aoVincular: (id) => sincronizador.sincronizarMembro(id),
  }),
  vinculos: criarGestaoVinculos({ repo, porta, auditoria, sincronizador, ...chaves }),
};

client.once(Events.ClientReady, async (c) => {
  logger.info(`Online como ${c.user.tag}`);
  const guild = await c.guilds.fetch(config.guildId);
  await guild.commands.set(todosOsComandos); // registro no servidor: efeito imediato e idempotente
  logger.info('Comandos registrados');
  iniciarAgendador(ctx);
});
client.on(Events.InteractionCreate, (i) => void rotearInteracao(i, ctx));
client.on(Events.GuildMemberAdd, (m) => {
  if (m.guild.id !== config.guildId) return;
  sincronizador
    .sincronizarMembro(m.id)
    .catch((e) => logger.error({ err: e }, 'Falha ao sincronizar novo membro'));
});
client.on(Events.Error, (e) => logger.error({ err: e }, 'Erro do cliente Discord'));

async function encerrar() {
  logger.info('Encerrando...');
  await client.destroy();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);

await client.login(config.discordToken);

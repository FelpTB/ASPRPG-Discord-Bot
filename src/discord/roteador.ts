import { type Interaction, MessageFlags } from 'discord.js';
import { logger } from '../logger.js';
import { executarAdmin } from './comandos/admin.js';
import { confirmarDesvinculo, executarAssociado } from './comandos/associado.js';
import type { Contexto } from './contexto.js';
import { mensagemDeErro } from './erros.js';
import { botaoImportacao } from './interacoes/importacao.js';
import { abrirModalCodigo, abrirModalEmail, receberCodigo, receberEmail } from './interacoes/verificacao.js';

async function despachar(i: Interaction, ctx: Contexto): Promise<void> {
  if (i.guildId !== ctx.config.guildId) return;

  if (i.isChatInputCommand()) {
    if (i.commandName === 'admin') return executarAdmin(i, ctx);
    if (i.commandName === 'associado') return executarAssociado(i, ctx);
    return;
  }
  if (i.isButton()) {
    if (i.customId === 'verificar:inicio') return abrirModalEmail(i);
    if (i.customId === 'verificar:codigo') return abrirModalCodigo(i);
    if (i.customId === 'associado:desvincular') return confirmarDesvinculo(i, ctx);
    if (i.customId.startsWith('importar:')) return botaoImportacao(i, ctx);
    return;
  }
  if (i.isModalSubmit()) {
    if (i.customId === 'verificar:email') return receberEmail(i, ctx);
    if (i.customId === 'verificar:codigo') return receberCodigo(i, ctx);
  }
}

/** Único ponto de entrada das interações. Erros viram mensagem amigável e vão para o log. */
export async function rotearInteracao(i: Interaction, ctx: Contexto): Promise<void> {
  try {
    await despachar(i, ctx);
  } catch (e) {
    logger.error({ err: e, usuario: i.user.id }, 'Erro ao tratar interação');
    if (!i.isRepliable()) return;
    const content = mensagemDeErro(e);
    try {
      if (i.deferred || i.replied) await i.editReply({ content, embeds: [], components: [] });
      else await i.reply({ content, flags: MessageFlags.Ephemeral });
    } catch {
      // a interação pode ter expirado; nada mais a fazer
    }
  }
}

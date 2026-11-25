import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { ErroPrevia } from '../../servicos/importador.js';
import { ehDiretoria } from '../../servicos/vinculos.js';
import type { Contexto } from '../contexto.js';

/** Botões da prévia: importar:<acao>:<token> */
export async function botaoImportacao(i: ButtonInteraction, ctx: Contexto): Promise<void> {
  const [, acao, token = ''] = i.customId.split(':');
  if (!i.inCachedGuild() || !ehDiretoria(i.member.roles.cache.keys(), ctx.config.roleDiretoriaId)) {
    await i.reply({ content: '⛔ Sem permissão.', flags: MessageFlags.Ephemeral });
    return;
  }

  if (acao === 'cancelar') {
    await i.update({ content: 'Importação cancelada. Nada foi gravado.', embeds: [], components: [] });
    return;
  }

  if (acao === 'aviso') {
    await i.update({
      content:
        '🚨 **Atenção:** esta importação removeria o acesso de mais de 20% dos membros vinculados. ' +
        'Confira se o arquivo é o export completo e atual do Catarse antes de continuar.',
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`importar:confirmar:${token}`)
            .setLabel('Tenho certeza, importar')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`importar:cancelar:${token}`)
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
    return;
  }

  if (acao === 'confirmar') {
    await i.update({ content: '⏳ Importando e sincronizando cargos...', components: [] });
    try {
      const diff = await ctx.importador.aplicar(token, i.user.id);
      await i.editReply({
        content:
          `✅ Importação concluída: ${diff.novos.length} novos, ${diff.reativados.length} reativados, ` +
          `${diff.inativados.length} inativados. Os cargos foram sincronizados.`,
        embeds: [],
      });
    } catch (e) {
      if (!(e instanceof ErroPrevia)) throw e;
      await i.editReply({ content: `❌ ${e.message}`, embeds: [] });
    }
  }
}

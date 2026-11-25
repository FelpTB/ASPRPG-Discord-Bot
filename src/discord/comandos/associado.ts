import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import type { Contexto } from '../contexto.js';
import { fmtData } from './admin.js';

const efemero = { flags: MessageFlags.Ephemeral } as const;

export async function executarAssociado(i: ChatInputCommandInteraction, ctx: Contexto): Promise<void> {
  const sub = i.options.getSubcommand();
  if (sub === 'status') {
    await i.deferReply(efemero);
    const s = await ctx.vinculos.statusDe(i.user.id);
    if (!s.vinculado) {
      await i.editReply(
        'Sua conta não está vinculada. Use o botão **Sou associado** no canal de verificação.',
      );
      return;
    }
    const status =
      s.status === 'ATIVA'
        ? '✅ Assinatura ativa'
        : s.inativoDesde
          ? `⏳ Sem assinatura ativa (desde ${fmtData(s.inativoDesde)})`
          : '⏳ Sem assinatura ativa';
    await i.editReply(`🔗 Vinculado ao e-mail **${s.emailMascarado ?? '(fora da base)'}**\n${status}`);
    return;
  }
  if (sub === 'desvincular') {
    await i.reply({
      content: 'Tem certeza? Seu vínculo e o cargo de associado serão removidos.',
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('associado:desvincular')
            .setLabel('Sim, desvincular')
            .setStyle(ButtonStyle.Danger),
        ),
      ],
      ...efemero,
    });
  }
}

export async function confirmarDesvinculo(i: ButtonInteraction, ctx: Contexto): Promise<void> {
  const ok = await ctx.vinculos.desvincular(i.user.id, i.user.id);
  await i.update({
    content: ok ? '✅ Vínculo removido.' : 'Sua conta não estava vinculada.',
    components: [],
  });
}

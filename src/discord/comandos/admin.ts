import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { decifrar } from '../../dominio/cripto.js';
import { mascararEmail } from '../../dominio/email.js';
import { type DiffImportacao, ErroCsv, type ErroLinha } from '../../dominio/importacao.js';
import { ehDiretoria } from '../../servicos/vinculos.js';
import type { Contexto } from '../contexto.js';
import { mensagemVerificacao } from '../interacoes/verificacao.js';

const LIMITE_INATIVACAO_PCT = 20;
const TAMANHO_MAX_CSV = 5 * 1024 * 1024;
const efemero = { flags: MessageFlags.Ephemeral } as const;

export const fmtData = (d: Date | null) =>
  d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

export function embedPrevia(diff: DiffImportacao, erros: ErroLinha[]): EmbedBuilder {
  const e = new EmbedBuilder()
    .setTitle('📥 Prévia da importação')
    .setColor(diff.percentualInativadosVinculados > LIMITE_INATIVACAO_PCT ? 0xe74c3c : 0x3498db)
    .addFields(
      { name: 'Ativos no arquivo', value: String(diff.totalAtivos), inline: true },
      { name: 'Novos', value: String(diff.novos.length), inline: true },
      { name: 'Reativados', value: String(diff.reativados.length), inline: true },
      { name: 'Inativados', value: String(diff.inativados.length), inline: true },
      {
        name: 'Vinculados que perderiam acesso',
        value: `${diff.inativadosVinculados} (${diff.percentualInativadosVinculados}%)`,
        inline: true,
      },
      { name: 'Linhas com erro', value: String(erros.length), inline: true },
    )
    .setFooter({ text: 'Nada foi gravado ainda. A prévia vale por 10 minutos.' });
  if (erros.length) {
    e.addFields({
      name: 'Primeiros erros',
      value: erros
        .slice(0, 5)
        .map((x) => `Linha ${x.linha}: ${x.motivo}`)
        .join('\n')
        .slice(0, 1000),
    });
  }
  return e;
}

export function botoesPrevia(token: string, exigeAviso: boolean) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${exigeAviso ? 'importar:aviso' : 'importar:confirmar'}:${token}`)
      .setLabel('Confirmar importação')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`importar:cancelar:${token}`)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Secondary),
  );
}

export async function executarAdmin(i: ChatInputCommandInteraction, ctx: Contexto): Promise<void> {
  if (!i.inCachedGuild() || !ehDiretoria(i.member.roles.cache.keys(), ctx.config.roleDiretoriaId)) {
    await i.reply({ content: '⛔ Sem permissão: este comando é exclusivo da Diretoria.', ...efemero });
    return;
  }
  const sub = i.options.getSubcommand();

  if (sub === 'importar') {
    const anexo = i.options.getAttachment('arquivo', true);
    if (!anexo.name.toLowerCase().endsWith('.csv') || anexo.size > TAMANHO_MAX_CSV) {
      await i.reply({ content: '❌ Envie um arquivo .csv de até 5 MB.', ...efemero });
      return;
    }
    await i.deferReply(efemero);
    const bytes = Buffer.from(await (await fetch(anexo.url)).arrayBuffer());
    try {
      const { token, diff, erros } = await ctx.importador.previsualizar(bytes, i.user.id);
      await i.editReply({
        embeds: [embedPrevia(diff, erros)],
        components: [botoesPrevia(token, diff.percentualInativadosVinculados > LIMITE_INATIVACAO_PCT)],
      });
    } catch (e) {
      if (!(e instanceof ErroCsv)) throw e;
      await i.editReply(`❌ Arquivo recusado, nada foi importado.\n${e.message}`);
    }
    return;
  }

  if (sub === 'sincronizar') {
    await i.deferReply(efemero);
    const r = await ctx.sincronizador.executar('manual');
    await i.editReply(
      r
        ? `✅ Sincronização concluída: ${r.cargosDados} cargos dados, ${r.cargosRemovidos} removidos, ` +
            `${r.carenciasIniciadas} carências iniciadas, ${r.falhas.length} falhas.`
        : '🚨 Sincronização abortada: banco de dados indisponível. Nenhum cargo foi alterado.',
    );
    return;
  }

  if (sub === 'membro') {
    await i.deferReply(efemero);
    const u = i.options.getUser('usuario', true);
    const s = await ctx.vinculos.statusDe(u.id);
    const eventos = await ctx.repo.listarEventos(u.id, 5);
    const e = new EmbedBuilder().setTitle(`Membro: ${u.tag}`);
    if (!s.vinculado) e.setDescription('Sem vínculo.');
    else
      e.addFields(
        { name: 'E-mail', value: s.emailMascarado ?? '(fora da base)', inline: true },
        { name: 'Status', value: s.status, inline: true },
        { name: 'Plano', value: s.plano ?? '—', inline: true },
        { name: 'Vinculado em', value: fmtData(s.vinculadoEm), inline: true },
        { name: 'Em carência desde', value: fmtData(s.inativoDesde), inline: true },
      );
    e.addFields({
      name: 'Últimos eventos',
      value: eventos.map((x) => `${fmtData(x.quando)} — ${x.tipo}`).join('\n') || '—',
    });
    await i.editReply({ embeds: [e] });
    return;
  }

  if (sub === 'vincular') {
    await i.deferReply(efemero);
    const u = i.options.getUser('usuario', true);
    const r = await ctx.vinculos.vincularManual(u.id, i.options.getString('email', true), i.user.id);
    if ('ok' in r) await i.editReply(`✅ <@${u.id}> vinculado. O cargo foi ajustado conforme a assinatura.`);
    else if (r.erro === 'EMAIL_INVALIDO') await i.editReply('❌ E-mail inválido.');
    else await i.editReply(`❌ Esse e-mail já está vinculado a <@${r.dono}>. Desvincule antes.`);
    return;
  }

  if (sub === 'desvincular') {
    await i.deferReply(efemero);
    const u = i.options.getUser('usuario', true);
    const ok = await ctx.vinculos.desvincular(u.id, i.user.id);
    await i.editReply(ok ? `✅ Vínculo de <@${u.id}> removido.` : 'Esse membro não tinha vínculo.');
    return;
  }

  if (sub === 'relatorio') {
    await i.deferReply(efemero);
    const r = await ctx.vinculos.relatorio();
    const vinculos = await ctx.repo.listarVinculos();
    const linhas = ['discord_id,email,status,em_carencia_desde'];
    for (const v of vinculos) {
      const a = await ctx.repo.buscarAssinante(v.emailHash);
      const email = a ? mascararEmail(decifrar(a.emailCifrado, ctx.config.emailEncKey)) : '';
      linhas.push(
        `${v.discordId},${email},${a?.status ?? 'FORA_DA_BASE'},${v.inativoDesde?.toISOString() ?? ''}`,
      );
    }
    const e = new EmbedBuilder()
      .setTitle('📊 Relatório de associados')
      .addFields(
        { name: 'Ativos na base', value: String(r.ativosNaBase), inline: true },
        { name: 'Vinculados', value: String(r.vinculados), inline: true },
        { name: 'Ativos sem vínculo', value: String(r.ativosSemVinculo), inline: true },
        { name: 'Vinculados inativos', value: String(r.vinculadosInativos), inline: true },
        { name: 'Em carência', value: String(r.emCarencia), inline: true },
        { name: 'Última importação', value: fmtData(r.ultimaImportacao), inline: true },
      );
    await i.editReply({
      embeds: [e],
      files: [new AttachmentBuilder(Buffer.from(linhas.join('\n')), { name: 'vinculos.csv' })],
    });
    return;
  }

  if (sub === 'publicar-verificacao') {
    const canal = await ctx.client.channels.fetch(ctx.config.canalVerificacaoId);
    if (!canal?.isSendable()) {
      await i.reply({ content: '❌ Não consigo enviar mensagens no canal de verificação.', ...efemero });
      return;
    }
    await canal.send(mensagemVerificacao(ctx.config.privacidadeUrl));
    await i.reply({ content: `✅ Mensagem publicada em <#${canal.id}>.`, ...efemero });
  }
}

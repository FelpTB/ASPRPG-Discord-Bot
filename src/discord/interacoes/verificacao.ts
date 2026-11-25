import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { ResultadoConfirmacao } from '../../servicos/verificador.js';
import type { Contexto } from '../contexto.js';

const efemero = { flags: MessageFlags.Ephemeral } as const;

export function mensagemVerificacao(privacidadeUrl?: string) {
  const e = new EmbedBuilder()
    .setTitle('🎲 Área de Associados')
    .setColor(0x9b59b6)
    .setDescription(
      'Se você é associado(a) pelo **Catarse**, clique no botão abaixo e informe o **e-mail usado no Catarse**. ' +
        'Enviaremos um código para confirmar que o e-mail é seu.' +
        (privacidadeUrl ? `\n\n[Como usamos seus dados](${privacidadeUrl})` : ''),
    );
  return {
    embeds: [e],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('verificar:inicio')
          .setLabel('Sou associado')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

function modal(id: string, titulo: string, rotulo: string, campo: TextInputBuilder) {
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle(titulo)
    .addLabelComponents(new LabelBuilder().setLabel(rotulo).setTextInputComponent(campo));
}

/** Botão "Sou associado" → modal do e-mail. showModal precisa ser a primeira resposta. */
export async function abrirModalEmail(i: ButtonInteraction): Promise<void> {
  await i.showModal(
    modal(
      'verificar:email',
      'Verificação de associado',
      'E-mail usado no Catarse',
      new TextInputBuilder()
        .setCustomId('email')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(254)
        .setRequired(true),
    ),
  );
}

export async function abrirModalCodigo(i: ButtonInteraction): Promise<void> {
  await i.showModal(
    modal(
      'verificar:codigo',
      'Código de verificação',
      'Código de 6 dígitos recebido por e-mail',
      new TextInputBuilder()
        .setCustomId('codigo')
        .setStyle(TextInputStyle.Short)
        .setMinLength(6)
        .setMaxLength(6)
        .setRequired(true),
    ),
  );
}

export async function receberEmail(i: ModalSubmitInteraction, ctx: Contexto): Promise<void> {
  await i.deferReply(efemero);
  const r = await ctx.verificador.solicitar(i.user.id, i.fields.getTextInputValue('email'));
  if (r === 'EMAIL_INVALIDO') {
    await i.editReply('❌ Esse e-mail não parece válido. Clique em **Sou associado** e tente de novo.');
    return;
  }
  if (r === 'LIMITE_PEDIDOS') {
    await i.editReply('⏳ Muitos pedidos de código. Aguarde 1 hora e tente novamente.');
    return;
  }
  await i.editReply({
    content:
      '📧 Se esse e-mail estiver na base de associados, enviamos um código de 6 dígitos. ' +
      'Ele vale por 15 minutos. Confira também a caixa de spam.',
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('verificar:codigo')
          .setLabel('Inserir código')
          .setEmoji('🔑')
          .setStyle(ButtonStyle.Success),
      ),
    ],
  });
}

const RESPOSTAS: Record<ResultadoConfirmacao, string> = {
  VINCULADO_ATIVO: '🎉 Pronto! Bem-vindo(a) à área de associados.',
  VINCULADO_INATIVO:
    '🔗 Seu e-mail foi vinculado, mas não encontramos assinatura ativa. Assim que ela estiver ativa, o cargo será liberado automaticamente.',
  CODIGO_INVALIDO: '❌ Código incorreto. Clique em **Inserir código** e tente de novo.',
  CODIGO_EXPIRADO: '⌛ O código expirou. Clique em **Sou associado** para receber um novo.',
  TENTATIVAS_ESGOTADAS:
    '⛔ Muitas tentativas erradas. Clique em **Sou associado** para receber um novo código.',
  EMAIL_JA_VINCULADO:
    '⚠️ Esse e-mail já está vinculado a outra conta do Discord. Fale com a Diretoria se precisar de ajuda.',
  SEM_CODIGO: 'Não há código pendente. Clique em **Sou associado** para começar.',
};

export async function receberCodigo(i: ModalSubmitInteraction, ctx: Contexto): Promise<void> {
  await i.deferReply(efemero);
  const r = await ctx.verificador.confirmar(i.user.id, i.fields.getTextInputValue('codigo'));
  await i.editReply(RESPOSTAS[r]);
}

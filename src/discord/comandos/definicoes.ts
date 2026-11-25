import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const comandoAdmin = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Ferramentas da Diretoria para gerenciar associados')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('importar')
      .setDescription('Importa o CSV de assinantes exportado do Catarse')
      .addAttachmentOption((o) => o.setName('arquivo').setDescription('Arquivo .csv').setRequired(true)),
  )
  .addSubcommand((s) => s.setName('sincronizar').setDescription('Sincroniza os cargos agora'))
  .addSubcommand((s) =>
    s
      .setName('membro')
      .setDescription('Mostra o vínculo e o histórico de um membro')
      .addUserOption((o) => o.setName('usuario').setDescription('Membro').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('vincular')
      .setDescription('Vincula manualmente um membro a um e-mail')
      .addUserOption((o) => o.setName('usuario').setDescription('Membro').setRequired(true))
      .addStringOption((o) => o.setName('email').setDescription('E-mail usado no Catarse').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('desvincular')
      .setDescription('Remove o vínculo e o cargo de um membro')
      .addUserOption((o) => o.setName('usuario').setDescription('Membro').setRequired(true)),
  )
  .addSubcommand((s) => s.setName('relatorio').setDescription('Totais de associados e vínculos'))
  .addSubcommand((s) =>
    s.setName('publicar-verificacao').setDescription('Publica a mensagem com o botão de verificação'),
  );

export const comandoAssociado = new SlashCommandBuilder()
  .setName('associado')
  .setDescription('Seu vínculo de associado')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s.setName('status').setDescription('Mostra se sua conta está vinculada'))
  .addSubcommand((s) => s.setName('desvincular').setDescription('Remove seu vínculo e o cargo de associado'));

export const todosOsComandos = [comandoAdmin, comandoAssociado].map((c) => c.toJSON());

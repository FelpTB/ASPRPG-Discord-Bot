import type { Client, GuildMember } from 'discord.js';
import { codigoDeErro, type MembroPorta, type PortaDiscord } from '../servicos/portas.js';

const MEMBRO_DESCONHECIDO = new Set([10007, 10013]);

export function adaptarMembro(m: GuildMember, roleId: string): MembroPorta {
  return {
    id: m.id,
    temCargo: () => m.roles.cache.has(roleId),
    darCargo: async (motivo) => void (await m.roles.add(roleId, motivo)),
    removerCargo: async (motivo) => void (await m.roles.remove(roleId, motivo)),
    enviarDM: async (texto) => void (await m.send(texto)),
  };
}

export function criarPortaDiscord(client: Client, guildId: string, roleAssociadoId: string): PortaDiscord {
  return {
    async buscarMembro(discordId) {
      const guild = await client.guilds.fetch(guildId);
      try {
        return adaptarMembro(await guild.members.fetch(discordId), roleAssociadoId);
      } catch (e) {
        if (MEMBRO_DESCONHECIDO.has(codigoDeErro(e) ?? 0)) return null;
        throw e;
      }
    },
  };
}

export async function enviarParaCanal(client: Client, canalId: string, texto: string): Promise<void> {
  const canal = await client.channels.fetch(canalId);
  if (canal?.isSendable()) await canal.send({ content: texto, allowedMentions: { parse: [] } });
}

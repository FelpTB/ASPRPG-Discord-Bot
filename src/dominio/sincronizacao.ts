import type { Assinante, Vinculo } from '../db/repo.js';

export type TipoAcao = 'DAR_CARGO' | 'INICIAR_CARENCIA' | 'REMOVER_CARGO' | 'LIMPAR_CARENCIA';
export type Acao = { tipo: TipoAcao; discordId: string };

const DIA_MS = 86_400_000;

/** Decide o que fazer com cada vínculo comparando com a base de assinantes (spec, seção 5.2). */
export function decidirAcoes(
  vinculos: Vinculo[],
  assinantes: Map<string, Assinante>,
  agora: Date,
  carenciaDias: number,
): Acao[] {
  const acoes: Acao[] = [];
  for (const v of vinculos) {
    const ativo = assinantes.get(v.emailHash)?.status === 'ATIVA';
    const add = (tipo: TipoAcao) => acoes.push({ tipo, discordId: v.discordId });

    if (ativo) {
      add('DAR_CARGO');
      if (v.inativoDesde) add('LIMPAR_CARENCIA');
      continue;
    }
    const inicio = v.inativoDesde ?? agora;
    if (!v.inativoDesde) add('INICIAR_CARENCIA');
    if (agora.getTime() - inicio.getTime() >= carenciaDias * DIA_MS) add('REMOVER_CARGO');
  }
  return acoes;
}

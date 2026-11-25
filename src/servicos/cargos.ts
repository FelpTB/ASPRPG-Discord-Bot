import type { Repo } from '../db/repo.js';
import type { Acao } from '../dominio/sincronizacao.js';
import { type Auditoria, codigoDeErro, type MembroPorta, type PortaDiscord } from './portas.js';

export type ResultadoExecucao = {
  cargosDados: number;
  cargosRemovidos: number;
  carenciasIniciadas: number;
  ignorados: { discordId: string; motivo: string }[];
  falhas: { discordId: string; codigo: number | undefined }[];
};

const ERRO_SEM_PERMISSAO = 50013;

export const mensagens = {
  carencia: (dias: number) =>
    `Olá! Não encontramos uma assinatura ativa do Catarse vinculada à sua conta. ` +
    `Se nada mudar, seu acesso à área de associados será pausado em ${dias} dias. ` +
    `Se você já regularizou, ignore esta mensagem.`,
  removido:
    'Seu acesso à área de associados foi pausado porque não encontramos assinatura ativa no Catarse. ' +
    'Assim que ela voltar a ficar ativa, o cargo é devolvido automaticamente.',
};

async function dmSilenciosa(m: MembroPorta, texto: string) {
  try {
    await m.enviarDM(texto);
  } catch {
    // DM fechada (50007) ou outra falha: o aviso já fica registrado no #log-bot.
  }
}

export async function aplicarAcoes(
  acoes: Acao[],
  deps: { porta: PortaDiscord; repo: Repo; auditoria: Auditoria; agora: Date; carenciaDias: number },
): Promise<ResultadoExecucao> {
  const r: ResultadoExecucao = {
    cargosDados: 0,
    cargosRemovidos: 0,
    carenciasIniciadas: 0,
    ignorados: [],
    falhas: [],
  };
  let permissaoAvisada = false;

  for (const { tipo, discordId } of acoes) {
    if (tipo === 'LIMPAR_CARENCIA') {
      await deps.repo.marcarInativoDesde(discordId, null);
      continue;
    }
    if (tipo === 'INICIAR_CARENCIA') {
      await deps.repo.marcarInativoDesde(discordId, deps.agora);
      r.carenciasIniciadas++;
      await deps.auditoria.registrar('CARENCIA_INICIADA', discordId, `Carência de ${deps.carenciaDias} dias`);
    }

    try {
      const membro = await deps.porta.buscarMembro(discordId);
      if (!membro) {
        if (tipo !== 'INICIAR_CARENCIA') r.ignorados.push({ discordId, motivo: 'fora do servidor' });
        continue;
      }
      if (tipo === 'INICIAR_CARENCIA') {
        await dmSilenciosa(membro, mensagens.carencia(deps.carenciaDias));
      } else if (tipo === 'DAR_CARGO' && !membro.temCargo()) {
        await membro.darCargo('Assinatura ativa no Catarse');
        r.cargosDados++;
        await deps.auditoria.registrar('CARGO_DADO', discordId, 'Assinatura ativa');
      } else if (tipo === 'REMOVER_CARGO' && membro.temCargo()) {
        await membro.removerCargo('Sem assinatura ativa após a carência');
        r.cargosRemovidos++;
        await dmSilenciosa(membro, mensagens.removido);
        await deps.auditoria.registrar('CARGO_REMOVIDO', discordId, 'Fim da carência');
      }
    } catch (e) {
      const codigo = codigoDeErro(e);
      r.falhas.push({ discordId, codigo });
      if (codigo === ERRO_SEM_PERMISSAO && !permissaoAvisada) {
        permissaoAvisada = true;
        await deps.auditoria.registrar(
          'ERRO_PERMISSAO',
          discordId,
          'O bot não tem permissão para alterar cargos. Em Configurações do servidor → Cargos, ' +
            'mova o cargo do bot acima de Associado e confirme a permissão Gerenciar Cargos.',
        );
      }
    }
  }
  return r;
}

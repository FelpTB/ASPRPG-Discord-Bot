import type { Repo } from '../db/repo.js';
import { decidirAcoes } from '../dominio/sincronizacao.js';
import { logger } from '../logger.js';
import { aplicarAcoes, type ResultadoExecucao } from './cargos.js';
import type { Auditoria, PortaDiscord } from './portas.js';

export type OrigemSync = 'importacao' | 'diaria' | 'manual';

export function criarSincronizador(deps: {
  repo: Repo;
  porta: PortaDiscord;
  auditoria: Auditoria;
  carenciaDias: number;
  agora?: () => Date;
}) {
  const agora = deps.agora ?? (() => new Date());
  let rodando: Promise<ResultadoExecucao | null> | null = null;

  async function executarAgora(origem: OrigemSync): Promise<ResultadoExecucao | null> {
    try {
      await deps.repo.ping();
    } catch (e) {
      logger.error({ err: e }, 'Banco indisponível: sincronização abortada');
      await deps.auditoria.registrar(
        'SYNC_ABORTADA',
        null,
        `Sincronização (${origem}) abortada: banco de dados indisponível. Nenhum cargo foi alterado.`,
      );
      return null;
    }
    const [vinculos, assinantes] = await Promise.all([
      deps.repo.listarVinculos(),
      deps.repo.listarAssinantes(),
    ]);
    const acoes = decidirAcoes(
      vinculos,
      new Map(assinantes.map((a) => [a.emailHash, a])),
      agora(),
      deps.carenciaDias,
    );
    return aplicarAcoes(acoes, { ...deps, agora: agora() });
  }

  return {
    /** Sincroniza todos os vínculos. Retorna null se abortou (banco indisponível). Execuções não se sobrepõem. */
    executar(origem: OrigemSync): Promise<ResultadoExecucao | null> {
      if (!rodando) rodando = executarAgora(origem).finally(() => (rodando = null));
      return rodando;
    },

    /** Sincroniza um único membro (entrada no servidor, após verificação, vínculo manual). */
    async sincronizarMembro(discordId: string): Promise<ResultadoExecucao | null> {
      const v = await deps.repo.buscarVinculoPorDiscord(discordId);
      if (!v) return null;
      const a = await deps.repo.buscarAssinante(v.emailHash);
      const acoes = decidirAcoes([v], new Map(a ? [[a.emailHash, a]] : []), agora(), deps.carenciaDias);
      return aplicarAcoes(acoes, { ...deps, agora: agora() });
    },
  };
}

export type Sincronizador = ReturnType<typeof criarSincronizador>;

import type { Repo, TipoEvento } from '../db/repo.js';
import { logger } from '../logger.js';
import type { Auditoria } from './portas.js';

const ICONES: Record<TipoEvento, string> = {
  CARGO_DADO: '✅',
  CARENCIA_INICIADA: '⏳',
  CARGO_REMOVIDO: '⛔',
  VINCULO_CRIADO: '🔗',
  VINCULO_MANUAL: '🛠️',
  VINCULO_REMOVIDO: '✂️',
  EMAIL_CONFLITO: '⚠️',
  IMPORTACAO: '📥',
  SYNC_ABORTADA: '🚨',
  ERRO_PERMISSAO: '🚨',
};

/** Registra no banco (tabela eventos) e no canal #log-bot. Falhas em um não impedem o outro. */
export function criarAuditoria(repo: Repo, enviarLog: (texto: string) => Promise<void>): Auditoria {
  return {
    async registrar(tipo, discordId, detalhe) {
      try {
        await repo.registrarEvento({ discordId, tipo, detalhe });
      } catch (e) {
        logger.warn({ err: e, tipo }, 'Falha ao gravar evento no banco');
      }
      const quem = discordId ? ` <@${discordId}>` : '';
      try {
        await enviarLog(`${ICONES[tipo]} **${tipo}**${quem} — ${detalhe}`);
      } catch (e) {
        logger.warn({ err: e, tipo }, 'Falha ao enviar para o #log-bot');
      }
    },
  };
}

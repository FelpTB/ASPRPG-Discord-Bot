import cron from 'node-cron';
import type { Contexto } from './discord/contexto.js';
import { enviarParaCanal } from './discord/porta.js';
import { logger } from './logger.js';

export async function rotinaDiaria(ctx: Contexto): Promise<void> {
  const r = await ctx.sincronizador.executar('diaria');
  if (!r) return; // abortada: a auditoria já avisou no #log-bot
  const limpeza = await ctx.repo.limpezaRetencao(new Date());
  const rel = await ctx.vinculos.relatorio();
  await enviarParaCanal(
    ctx.client,
    ctx.config.canalLogId,
    `✅ **Sincronização diária**: ${rel.vinculados} vinculados, ${rel.ativosNaBase} ativos na base, ` +
      `${rel.emCarencia} em carência. Hoje: ${r.cargosDados} cargos dados, ${r.cargosRemovidos} removidos, ` +
      `${r.carenciasIniciadas} carências iniciadas, ${r.falhas.length} falhas. ` +
      `Limpeza: ${limpeza.codigos} códigos e ${limpeza.vinculos} vínculos antigos removidos.`,
  );
}

async function heartbeat(ctx: Contexto, url: string): Promise<void> {
  if (!ctx.client.isReady()) return;
  await ctx.repo.ping();
  await fetch(url, { signal: AbortSignal.timeout(10_000) });
}

export function iniciarAgendador(ctx: Contexto): void {
  cron.schedule(
    '0 4 * * *',
    () => rotinaDiaria(ctx).catch((e) => logger.error({ err: e }, 'Falha na rotina diária')),
    { timezone: 'America/Sao_Paulo' },
  );
  const url = ctx.config.healthcheckUrl;
  if (url) {
    cron.schedule('*/5 * * * *', () =>
      heartbeat(ctx, url).catch((e) => logger.warn({ err: e }, 'Heartbeat não enviado')),
    );
  }
}

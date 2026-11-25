import { describe, expect, it } from 'vitest';
import type { Repo } from '../../src/db/repo.js';
import { criarAuditoria } from '../../src/servicos/auditoria.js';

describe('auditoria', () => {
  it('grava o evento e envia ao #log-bot', async () => {
    const gravados: unknown[] = [];
    const logs: string[] = [];
    const repo = { registrarEvento: async (e: unknown) => void gravados.push(e) } as unknown as Repo;
    const aud = criarAuditoria(repo, async (t) => void logs.push(t));
    await aud.registrar('CARGO_DADO', '123', 'Assinatura ativa');
    expect(gravados).toEqual([{ discordId: '123', tipo: 'CARGO_DADO', detalhe: 'Assinatura ativa' }]);
    expect(logs[0]).toContain('<@123>');
  });

  it('banco fora do ar não impede o aviso no canal, e canal fora do ar não lança erro', async () => {
    const logs: string[] = [];
    const repo = {
      registrarEvento: async () => {
        throw new Error('down');
      },
    } as unknown as Repo;
    await criarAuditoria(repo, async (t) => void logs.push(t)).registrar('SYNC_ABORTADA', null, 'x');
    expect(logs).toHaveLength(1);
    const semCanal = criarAuditoria(repo, async () => {
      throw new Error('canal');
    });
    await expect(semCanal.registrar('SYNC_ABORTADA', null, 'x')).resolves.toBeUndefined();
  });
});

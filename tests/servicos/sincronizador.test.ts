import { describe, expect, it } from 'vitest';
import type { Assinante, Repo, Vinculo } from '../../src/db/repo.js';
import { criarSincronizador } from '../../src/servicos/sincronizador.js';
import { auditoriaFake, MembroFake, portaFake } from './fakes.js';

const agora = new Date('2026-11-25T04:00:00Z');
const v = (id: string): Vinculo => ({
  discordId: id,
  emailHash: `h-${id}`,
  vinculadoEm: agora,
  inativoDesde: null,
});
const a = (id: string): Assinante => ({
  emailHash: `h-${id}`,
  emailCifrado: '',
  nome: null,
  plano: null,
  status: 'ATIVA',
  importadoEm: agora,
});

function repoFake(opcoes: { pingFalha?: boolean } = {}) {
  return {
    ping: async () => {
      if (opcoes.pingFalha) throw new Error('ECONNREFUSED');
    },
    listarVinculos: async () => [v('u1')],
    listarAssinantes: async () => [a('u1')],
    buscarVinculoPorDiscord: async (id: string) => (id === 'u1' ? v('u1') : null),
    buscarAssinante: async (h: string) => (h === 'h-u1' ? a('u1') : null),
    marcarInativoDesde: async () => {},
  } as unknown as Repo;
}

describe('sincronizador', () => {
  it('executar dá o cargo aos vinculados ativos', async () => {
    const m = new MembroFake('u1');
    const s = criarSincronizador({
      repo: repoFake(),
      porta: portaFake([m]),
      auditoria: auditoriaFake(),
      carenciaDias: 7,
      agora: () => agora,
    });
    const r = await s.executar('manual');
    expect(m.cargo).toBe(true);
    expect(r?.cargosDados).toBe(1);
  });

  it('banco fora do ar: aborta sem mexer em cargos e registra SYNC_ABORTADA', async () => {
    const m = new MembroFake('u1', true);
    const aud = auditoriaFake();
    const s = criarSincronizador({
      repo: repoFake({ pingFalha: true }),
      porta: portaFake([m]),
      auditoria: aud,
      carenciaDias: 7,
      agora: () => agora,
    });
    await expect(s.executar('diaria')).resolves.toBeNull();
    expect(m.cargo).toBe(true);
    expect(aud.eventos.map((e) => e.tipo)).toEqual(['SYNC_ABORTADA']);
  });

  it('sincronizarMembro dá o cargo ao membro vinculado e ignora quem não tem vínculo', async () => {
    const m1 = new MembroFake('u1');
    const m2 = new MembroFake('u2');
    const s = criarSincronizador({
      repo: repoFake(),
      porta: portaFake([m1, m2]),
      auditoria: auditoriaFake(),
      carenciaDias: 7,
      agora: () => agora,
    });
    await s.sincronizarMembro('u1');
    await s.sincronizarMembro('u2');
    expect(m1.cargo).toBe(true);
    expect(m2.cargo).toBe(false);
  });
});

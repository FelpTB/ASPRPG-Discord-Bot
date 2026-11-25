import { describe, expect, it } from 'vitest';
import type { Repo } from '../../src/db/repo.js';
import { aplicarAcoes } from '../../src/servicos/cargos.js';
import { auditoriaFake, MembroFake, portaFake } from './fakes.js';

const agora = new Date('2026-11-25T04:00:00Z');
function repoFake() {
  const inativo = new Map<string, Date | null>();
  return {
    inativo,
    repo: {
      marcarInativoDesde: async (id: string, d: Date | null) => {
        inativo.set(id, d);
      },
    } as unknown as Repo,
  };
}

describe('aplicarAcoes', () => {
  it('dá o cargo a quem não tem e ignora quem já tem', async () => {
    const a = new MembroFake('a');
    const b = new MembroFake('b', true);
    const aud = auditoriaFake();
    const r = await aplicarAcoes(
      [
        { tipo: 'DAR_CARGO', discordId: 'a' },
        { tipo: 'DAR_CARGO', discordId: 'b' },
      ],
      { porta: portaFake([a, b]), repo: repoFake().repo, auditoria: aud, agora, carenciaDias: 7 },
    );
    expect(a.cargo).toBe(true);
    expect(r.cargosDados).toBe(1);
    expect(aud.eventos.map((e) => e.tipo)).toEqual(['CARGO_DADO']);
  });

  it('membro que saiu do servidor (10007) é ignorado sem erro', async () => {
    const r = await aplicarAcoes([{ tipo: 'DAR_CARGO', discordId: 'sumiu' }], {
      porta: portaFake([]),
      repo: repoFake().repo,
      auditoria: auditoriaFake(),
      agora,
      carenciaDias: 7,
    });
    expect(r.ignorados).toEqual([{ discordId: 'sumiu', motivo: 'fora do servidor' }]);
    expect(r.falhas).toEqual([]);
  });

  it('sem permissão (50013) registra falha com instrução e continua com os próximos', async () => {
    const a = new MembroFake('a');
    a.erroCargo = { code: 50013 };
    const b = new MembroFake('b');
    const aud = auditoriaFake();
    const r = await aplicarAcoes(
      [
        { tipo: 'DAR_CARGO', discordId: 'a' },
        { tipo: 'DAR_CARGO', discordId: 'b' },
      ],
      { porta: portaFake([a, b]), repo: repoFake().repo, auditoria: aud, agora, carenciaDias: 7 },
    );
    expect(r.falhas).toEqual([{ discordId: 'a', codigo: 50013 }]);
    expect(b.cargo).toBe(true);
    expect(aud.eventos.find((e) => e.tipo === 'ERRO_PERMISSAO')?.detalhe).toMatch(/acima de Associado/);
  });

  it('iniciar carência grava a data e avisa por DM; DM fechada (50007) é ignorada', async () => {
    const a = new MembroFake('a', true);
    const b = new MembroFake('b', true);
    b.dmFechada = true;
    const { repo, inativo } = repoFake();
    const r = await aplicarAcoes(
      [
        { tipo: 'INICIAR_CARENCIA', discordId: 'a' },
        { tipo: 'INICIAR_CARENCIA', discordId: 'b' },
      ],
      { porta: portaFake([a, b]), repo, auditoria: auditoriaFake(), agora, carenciaDias: 7 },
    );
    expect(inativo.get('a')).toEqual(agora);
    expect(a.dms[0]).toMatch(/7 dias/);
    expect(r.carenciasIniciadas).toBe(2);
    expect(r.falhas).toEqual([]);
  });

  it('remover cargo tira o cargo e avisa; quem já não tem não recebe nova DM', async () => {
    const a = new MembroFake('a', true);
    const b = new MembroFake('b', false);
    const r = await aplicarAcoes(
      [
        { tipo: 'REMOVER_CARGO', discordId: 'a' },
        { tipo: 'REMOVER_CARGO', discordId: 'b' },
      ],
      { porta: portaFake([a, b]), repo: repoFake().repo, auditoria: auditoriaFake(), agora, carenciaDias: 7 },
    );
    expect(a.cargo).toBe(false);
    expect(a.dms).toHaveLength(1);
    expect(b.dms).toHaveLength(0);
    expect(r.cargosRemovidos).toBe(1);
  });

  it('limpar carência zera a data', async () => {
    const { repo, inativo } = repoFake();
    await aplicarAcoes([{ tipo: 'LIMPAR_CARENCIA', discordId: 'a' }], {
      porta: portaFake([]),
      repo,
      auditoria: auditoriaFake(),
      agora,
      carenciaDias: 7,
    });
    expect(inativo.get('a')).toBeNull();
  });
});

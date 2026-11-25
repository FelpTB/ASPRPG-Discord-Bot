import { describe, expect, it } from 'vitest';
import type { Assinante, Vinculo } from '../../src/db/repo.js';
import { decidirAcoes } from '../../src/dominio/sincronizacao.js';

const agora = new Date('2026-11-25T04:00:00Z');
const dias = (n: number) => new Date(agora.getTime() - n * 86_400_000);
const vinculo = (discordId: string, inativoDesde: Date | null = null): Vinculo => ({
  discordId,
  emailHash: `h-${discordId}`,
  vinculadoEm: dias(30),
  inativoDesde,
});
const base = (pares: [string, 'ATIVA' | 'INATIVA'][]) =>
  new Map<string, Assinante>(
    pares.map(([id, status]) => [
      `h-${id}`,
      { emailHash: `h-${id}`, emailCifrado: '', nome: null, plano: null, status, importadoEm: agora },
    ]),
  );
const decidir = (v: Vinculo, b: Map<string, Assinante>) => decidirAcoes([v], b, agora, 7).map((a) => a.tipo);

describe('decidirAcoes', () => {
  it('assinatura ativa → DAR_CARGO', () => {
    expect(decidir(vinculo('u'), base([['u', 'ATIVA']]))).toEqual(['DAR_CARGO']);
  });
  it('inativa sem carência iniciada → INICIAR_CARENCIA', () => {
    expect(decidir(vinculo('u'), base([['u', 'INATIVA']]))).toEqual(['INICIAR_CARENCIA']);
  });
  it('inativa há 6 dias → nenhuma ação', () => {
    expect(decidir(vinculo('u', dias(6)), base([['u', 'INATIVA']]))).toEqual([]);
  });
  it('inativa há 7 dias → REMOVER_CARGO', () => {
    expect(decidir(vinculo('u', dias(7)), base([['u', 'INATIVA']]))).toEqual(['REMOVER_CARGO']);
  });
  it('reativada durante a carência → DAR_CARGO e LIMPAR_CARENCIA', () => {
    expect(decidir(vinculo('u', dias(3)), base([['u', 'ATIVA']]))).toEqual(['DAR_CARGO', 'LIMPAR_CARENCIA']);
  });
  it('e-mail ausente da base conta como inativo', () => {
    expect(decidir(vinculo('u'), base([]))).toEqual(['INICIAR_CARENCIA']);
  });
  it('carência 0 remove na hora', () => {
    expect(decidirAcoes([vinculo('u')], base([]), agora, 0).map((a) => a.tipo)).toEqual([
      'INICIAR_CARENCIA',
      'REMOVER_CARGO',
    ]);
  });
});

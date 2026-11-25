import { describe, expect, it } from 'vitest';
import { mensagemDeErro } from '../../src/discord/erros.js';

describe('mensagemDeErro', () => {
  it('banco inacessível vira "Sistema temporariamente indisponível"', () => {
    for (const code of ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'CONNECT_TIMEOUT', 'CONNECTION_CLOSED']) {
      expect(mensagemDeErro(Object.assign(new Error('x'), { code }))).toMatch(/temporariamente indisponível/);
    }
  });
  it('outros erros viram mensagem genérica sem detalhes internos', () => {
    const m = mensagemDeErro(new Error('segredo interno'));
    expect(m).toMatch(/erro inesperado/i);
    expect(m).not.toContain('segredo');
  });
});

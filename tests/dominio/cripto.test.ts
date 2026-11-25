import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cifrar, codigoConfere, decifrar, hashCodigo, hmacEmail } from '../../src/dominio/cripto.js';

const k1 = randomBytes(32);
const k2 = randomBytes(32);

describe('cifrar/decifrar', () => {
  it('ida e volta recupera o texto', () => {
    expect(decifrar(cifrar('fulano@gmail.com', k1), k1)).toBe('fulano@gmail.com');
  });
  it('cifrar duas vezes gera textos diferentes (IV aleatório)', () => {
    expect(cifrar('x@y.com', k1)).not.toBe(cifrar('x@y.com', k1));
  });
  it('decifrar com outra chave lança erro', () => {
    expect(() => decifrar(cifrar('x@y.com', k1), k2)).toThrow();
  });
});

describe('hmacEmail', () => {
  it('é determinístico e depende da chave', () => {
    expect(hmacEmail('x@y.com', k1)).toBe(hmacEmail('x@y.com', k1));
    expect(hmacEmail('x@y.com', k1)).not.toBe(hmacEmail('x@y.com', k2));
  });
});

describe('hashCodigo / codigoConfere', () => {
  it('confere o código certo e rejeita o errado ou de outro usuário', () => {
    const h = hashCodigo('123456', 'u1');
    expect(codigoConfere('123456', 'u1', h)).toBe(true);
    expect(codigoConfere('654321', 'u1', h)).toBe(false);
    expect(codigoConfere('123456', 'u2', h)).toBe(false);
  });
});

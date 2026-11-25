import { describe, expect, it } from 'vitest';
import { mascararEmail, normalizarEmail } from '../../src/dominio/email.js';

describe('normalizarEmail', () => {
  it('remove espaços e converte para minúsculas', () => {
    expect(normalizarEmail('  Fulano@Gmail.COM ')).toBe('fulano@gmail.com');
  });
  it('retorna null para texto sem arroba', () => {
    expect(normalizarEmail('sem-arroba')).toBeNull();
  });
  it('retorna null para vazio e para domínio sem ponto', () => {
    expect(normalizarEmail('')).toBeNull();
    expect(normalizarEmail('a@b')).toBeNull();
  });
});

describe('mascararEmail', () => {
  it('mantém as 2 primeiras letras e o domínio', () => {
    expect(mascararEmail('fulano@gmail.com')).toBe('fu***@gmail.com');
  });
  it('mantém só 1 letra quando a parte local é curta', () => {
    expect(mascararEmail('ab@x.com')).toBe('a***@x.com');
  });
});

import { randomInt } from 'node:crypto';

export const VALIDADE_CODIGO_MS = 15 * 60_000;
export const MAX_TENTATIVAS = 5;
export const MAX_PEDIDOS_POR_HORA = 3;

export function gerarCodigo(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

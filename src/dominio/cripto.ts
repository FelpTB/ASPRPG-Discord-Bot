import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** Chave de busca do e-mail: HMAC-SHA256 com chave secreta (resiste a ataque de dicionário). */
export function hmacEmail(email: string, chave: Buffer): string {
  return createHmac('sha256', chave).update(email).digest('hex');
}

/** AES-256-GCM. Formato: iv.tag.dados (base64). */
export function cifrar(texto: string, chave: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave, iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), dados].map((b) => b.toString('base64')).join('.');
}

export function decifrar(cifrado: string, chave: Buffer): string {
  const [iv, tag, dados] = cifrado.split('.').map((p) => Buffer.from(p, 'base64'));
  if (!iv || !tag || !dados) throw new Error('Texto cifrado inválido');
  const d = createDecipheriv('aes-256-gcm', chave, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(dados), d.final()]).toString('utf8');
}

export function hashCodigo(codigo: string, discordId: string): string {
  return createHash('sha256').update(`${discordId}:${codigo}`).digest('hex');
}

export function codigoConfere(codigo: string, discordId: string, hashSalvo: string): boolean {
  const a = Buffer.from(hashCodigo(codigo, discordId), 'hex');
  const b = Buffer.from(hashSalvo, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

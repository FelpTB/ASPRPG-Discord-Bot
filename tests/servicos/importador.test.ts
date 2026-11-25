import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarRepo, type Repo } from '../../src/db/repo.js';
import { decifrar, hmacEmail } from '../../src/dominio/cripto.js';
import { criarImportador } from '../../src/servicos/importador.js';
import { bancoDeTeste } from '../db/pg.js';

let banco: Awaited<ReturnType<typeof bancoDeTeste>>;
let repo: Repo;
const chaves = { emailEncKey: randomBytes(32), emailHmacKey: randomBytes(32) };
const csvCfg = { colunas: { email: 'Email' }, statusAtivos: [], csvContemSoAtivos: true };
const csv = (...emails: string[]) => Buffer.from(`Email\n${emails.join('\n')}\n`);

beforeAll(async () => {
  banco = await bancoDeTeste();
  repo = criarRepo(banco.sql);
}, 60_000);
afterAll(async () => banco?.fechar());
beforeEach(async () => {
  await banco.sql`truncate associados.assinantes, associados.vinculos, associados.importacoes, associados.eventos`;
});

function novoImportador(agora = () => new Date('2026-11-25T12:00:00Z')) {
  let sincronizacoes = 0;
  const imp = criarImportador({
    repo,
    csv: csvCfg,
    ...chaves,
    agora,
    aoAplicar: async () => {
      sincronizacoes++;
    },
  });
  return { imp, sincronizacoes: () => sincronizacoes };
}

describe('importador', () => {
  it('previsualizar não grava nada', async () => {
    const { imp } = novoImportador();
    const p = await imp.previsualizar(csv('a@x.com', 'b@x.com'), 'adm');
    expect(p.diff.novos).toHaveLength(2);
    expect(await repo.listarAssinantes()).toHaveLength(0);
  });

  it('aplicar grava e-mails cifrados, marca ausentes como inativos e dispara a sincronização', async () => {
    const { imp, sincronizacoes } = novoImportador();
    await imp.aplicar((await imp.previsualizar(csv('a@x.com', 'b@x.com'), 'adm')).token, 'adm');
    await imp.aplicar((await imp.previsualizar(csv('a@x.com'), 'adm')).token, 'adm');

    const b = await repo.buscarAssinante(hmacEmail('b@x.com', chaves.emailHmacKey));
    expect(b?.status).toBe('INATIVA');
    expect(decifrar(b?.emailCifrado ?? '', chaves.emailEncKey)).toBe('b@x.com');
    expect(sincronizacoes()).toBe(2);
  });

  it('token só pode ser usado pelo admin que o criou, uma única vez', async () => {
    const { imp } = novoImportador();
    const { token } = await imp.previsualizar(csv('a@x.com'), 'adm');
    await expect(imp.aplicar(token, 'outro')).rejects.toThrow(/expirou|inválid/i);
    await imp.aplicar(token, 'adm');
    await expect(imp.aplicar(token, 'adm')).rejects.toThrow(/expirou|inválid/i);
  });

  it('token expira após 10 minutos', async () => {
    let t = new Date('2026-11-25T12:00:00Z').getTime();
    const { imp } = novoImportador(() => new Date(t));
    const { token } = await imp.previsualizar(csv('a@x.com'), 'adm');
    t += 10 * 60_000 + 1;
    await expect(imp.aplicar(token, 'adm')).rejects.toThrow(/expirou/i);
  });
});

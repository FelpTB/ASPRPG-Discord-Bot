import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarRepo, type Repo } from '../../src/db/repo.js';
import { cifrar, hmacEmail } from '../../src/dominio/cripto.js';
import { criarSincronizador } from '../../src/servicos/sincronizador.js';
import { criarGestaoVinculos, ehDiretoria } from '../../src/servicos/vinculos.js';
import { bancoDeTeste } from '../db/pg.js';
import { auditoriaFake, MembroFake, portaFake } from './fakes.js';

let banco: Awaited<ReturnType<typeof bancoDeTeste>>;
let repo: Repo;
const emailEncKey = randomBytes(32);
const emailHmacKey = randomBytes(32);
const h = (e: string) => hmacEmail(e, emailHmacKey);
const agora = new Date('2026-11-25T12:00:00Z');

beforeAll(async () => {
  banco = await bancoDeTeste();
  repo = criarRepo(banco.sql);
}, 60_000);
afterAll(async () => banco?.fechar());
beforeEach(async () => {
  await banco.sql`truncate associados.assinantes, associados.vinculos, associados.eventos, associados.importacoes`;
  await repo.upsertAssinantes(
    [
      {
        emailHash: h('a@x.com'),
        emailCifrado: cifrar('a@x.com', emailEncKey),
        nome: null,
        plano: null,
        status: 'ATIVA',
      },
      {
        emailHash: h('b@x.com'),
        emailCifrado: cifrar('b@x.com', emailEncKey),
        nome: null,
        plano: null,
        status: 'ATIVA',
      },
      {
        emailHash: h('c@x.com'),
        emailCifrado: cifrar('c@x.com', emailEncKey),
        nome: null,
        plano: null,
        status: 'INATIVA',
      },
    ],
    { adminId: 'adm', total: 3, ativos: 2, novos: 3, inativados: 0 },
    agora,
  );
});

function montar(membros: MembroFake[]) {
  const porta = portaFake(membros);
  const auditoria = auditoriaFake();
  const sincronizador = criarSincronizador({ repo, porta, auditoria, carenciaDias: 7, agora: () => agora });
  const g = criarGestaoVinculos({
    repo,
    porta,
    auditoria,
    sincronizador,
    emailEncKey,
    emailHmacKey,
    agora: () => agora,
  });
  return { g, auditoria };
}

describe('ehDiretoria', () => {
  it('exige o cargo Diretoria', () => {
    expect(ehDiretoria(['x', 'dir'], 'dir')).toBe(true);
    expect(ehDiretoria(['x'], 'dir')).toBe(false);
  });
});

describe('gestão de vínculos', () => {
  it('vincularManual cria o vínculo, dá o cargo e registra VINCULO_MANUAL', async () => {
    const m = new MembroFake('u1');
    const { g, auditoria } = montar([m]);
    expect(await g.vincularManual('u1', ' A@x.com ', 'adm')).toEqual({ ok: true });
    expect(m.cargo).toBe(true);
    expect(auditoria.eventos.find((e) => e.tipo === 'VINCULO_MANUAL')?.detalhe).toContain('adm');
  });

  it('vincularManual recusa e-mail de outra conta e e-mail inválido', async () => {
    const { g } = montar([]);
    await repo.criarVinculo('dono', h('a@x.com'), agora);
    expect(await g.vincularManual('u1', 'a@x.com', 'adm')).toEqual({ erro: 'EMAIL_DE_OUTRO', dono: 'dono' });
    expect(await g.vincularManual('u1', 'xx', 'adm')).toEqual({ erro: 'EMAIL_INVALIDO' });
  });

  it('desvincular remove o vínculo e o cargo', async () => {
    const m = new MembroFake('u1', true);
    const { g } = montar([m]);
    await repo.criarVinculo('u1', h('a@x.com'), agora);
    expect(await g.desvincular('u1', 'u1')).toBe(true);
    expect(m.cargo).toBe(false);
    expect(await repo.buscarVinculoPorDiscord('u1')).toBeNull();
    expect(await g.desvincular('u1', 'u1')).toBe(false);
  });

  it('statusDe mostra e-mail mascarado e status', async () => {
    const { g } = montar([]);
    expect(await g.statusDe('u1')).toEqual({ vinculado: false });
    await repo.criarVinculo('u1', h('c@x.com'), agora);
    expect(await g.statusDe('u1')).toMatchObject({
      vinculado: true,
      emailMascarado: 'c***@x.com',
      status: 'INATIVA',
    });
  });

  it('relatorio conta ativos, vinculados, ativos sem vínculo e inativos vinculados', async () => {
    const { g } = montar([]);
    await repo.criarVinculo('u1', h('a@x.com'), agora);
    await repo.criarVinculo('u3', h('c@x.com'), agora);
    await repo.marcarInativoDesde('u3', agora);
    expect(await g.relatorio()).toMatchObject({
      ativosNaBase: 2,
      vinculados: 2,
      ativosSemVinculo: 1,
      vinculadosInativos: 1,
      emCarencia: 1,
    });
  });
});

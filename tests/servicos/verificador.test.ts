import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarRepo, type Repo } from '../../src/db/repo.js';
import { cifrar, hmacEmail } from '../../src/dominio/cripto.js';
import { gerarCodigo } from '../../src/dominio/verificacao.js';
import { criarVerificador } from '../../src/servicos/verificador.js';
import { bancoDeTeste } from '../db/pg.js';
import { auditoriaFake } from './fakes.js';

let banco: Awaited<ReturnType<typeof bancoDeTeste>>;
let repo: Repo;
const encKey = randomBytes(32);
const hmacKey = randomBytes(32);
const h = (e: string) => hmacEmail(e, hmacKey);

beforeAll(async () => {
  banco = await bancoDeTeste();
  repo = criarRepo(banco.sql);
}, 60_000);
afterAll(async () => banco?.fechar());
beforeEach(async () => {
  await banco.sql`truncate assinantes, vinculos, codigos_verificacao, pedidos_codigo, eventos`;
  const base = new Date('2026-11-25T12:00:00Z');
  await repo.upsertAssinantes(
    [
      {
        emailHash: h('ativo@x.com'),
        emailCifrado: cifrar('ativo@x.com', encKey),
        nome: null,
        plano: null,
        status: 'ATIVA',
      },
      {
        emailHash: h('inativo@x.com'),
        emailCifrado: cifrar('inativo@x.com', encKey),
        nome: null,
        plano: null,
        status: 'INATIVA',
      },
    ],
    { adminId: 'adm', total: 2, ativos: 1, novos: 2, inativados: 0 },
    base,
  );
});

function montar() {
  let t = new Date('2026-11-25T12:00:00Z').getTime();
  const enviados: { para: string; codigo: string }[] = [];
  const vinculados: string[] = [];
  const aud = auditoriaFake();
  const v = criarVerificador({
    repo,
    emailHmacKey: hmacKey,
    mailer: { enviarCodigo: async (para, codigo) => void enviados.push({ para, codigo }) },
    auditoria: aud,
    aoVincular: async (id) => void vinculados.push(id),
    agora: () => new Date(t),
  });
  return { v, enviados, vinculados, aud, avancar: (ms: number) => (t += ms) };
}

describe('gerarCodigo', () => {
  it('gera 6 dígitos', () => {
    for (let i = 0; i < 50; i++) expect(gerarCodigo()).toMatch(/^\d{6}$/);
  });
});

describe('verificador', () => {
  it('e-mail fora da base: resposta neutra e nenhum e-mail enviado', async () => {
    const { v, enviados } = montar();
    expect(await v.solicitar('u1', 'naoexiste@x.com')).toBe('ENVIADO_OU_SILENCIOSO');
    expect(enviados).toHaveLength(0);
  });

  it('e-mail na base (normalizado): resposta neutra e 1 e-mail enviado', async () => {
    const { v, enviados } = montar();
    expect(await v.solicitar('u1', '  ATIVO@x.com ')).toBe('ENVIADO_OU_SILENCIOSO');
    expect(enviados).toEqual([{ para: 'ativo@x.com', codigo: expect.stringMatching(/^\d{6}$/) }]);
  });

  it('e-mail inválido', async () => {
    expect(await montar().v.solicitar('u1', 'abc')).toBe('EMAIL_INVALIDO');
  });

  it('4º pedido na mesma hora é bloqueado; volta a funcionar depois de 1 hora', async () => {
    const { v, avancar } = montar();
    for (let i = 0; i < 3; i++) expect(await v.solicitar('u1', 'ativo@x.com')).toBe('ENVIADO_OU_SILENCIOSO');
    expect(await v.solicitar('u1', 'ativo@x.com')).toBe('LIMITE_PEDIDOS');
    avancar(61 * 60_000);
    expect(await v.solicitar('u1', 'ativo@x.com')).toBe('ENVIADO_OU_SILENCIOSO');
  });

  it('código certo vincula (ativo), apaga o código e sincroniza o membro', async () => {
    const { v, enviados, vinculados } = montar();
    await v.solicitar('u1', 'ativo@x.com');
    expect(await v.confirmar('u1', enviados[0]?.codigo ?? '')).toBe('VINCULADO_ATIVO');
    expect((await repo.buscarVinculoPorDiscord('u1'))?.emailHash).toBe(h('ativo@x.com'));
    expect(await repo.buscarCodigo('u1')).toBeNull();
    expect(vinculados).toEqual(['u1']);
  });

  it('e-mail inativo vincula e informa VINCULADO_INATIVO', async () => {
    const { v, enviados } = montar();
    await v.solicitar('u1', 'inativo@x.com');
    expect(await v.confirmar('u1', enviados[0]?.codigo ?? '')).toBe('VINCULADO_INATIVO');
  });

  it('código certo depois de 15 minutos → CODIGO_EXPIRADO', async () => {
    const { v, enviados, avancar } = montar();
    await v.solicitar('u1', 'ativo@x.com');
    avancar(15 * 60_000 + 1);
    expect(await v.confirmar('u1', enviados[0]?.codigo ?? '')).toBe('CODIGO_EXPIRADO');
  });

  it('5 erros seguidos e depois o código certo → TENTATIVAS_ESGOTADAS', async () => {
    const { v, enviados } = montar();
    await v.solicitar('u1', 'ativo@x.com');
    const certo = enviados[0]?.codigo ?? '';
    const errado = certo === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect(await v.confirmar('u1', errado)).toBe('CODIGO_INVALIDO');
    expect(await v.confirmar('u1', certo)).toBe('TENTATIVAS_ESGOTADAS');
  });

  it('confirmar sem ter pedido código → SEM_CODIGO', async () => {
    expect(await montar().v.confirmar('u1', '123456')).toBe('SEM_CODIGO');
  });

  it('e-mail já vinculado a outra conta → EMAIL_JA_VINCULADO e alerta para a Diretoria', async () => {
    const { v, enviados, aud } = montar();
    await repo.criarVinculo('dono', h('ativo@x.com'), new Date());
    await v.solicitar('intruso', 'ativo@x.com');
    expect(await v.confirmar('intruso', enviados[0]?.codigo ?? '')).toBe('EMAIL_JA_VINCULADO');
    expect(aud.eventos.map((e) => e.tipo)).toContain('EMAIL_CONFLITO');
    expect(await repo.buscarVinculoPorDiscord('intruso')).toBeNull();
  });

  it('mesma conta trocando de e-mail substitui o vínculo anterior', async () => {
    const { v, enviados } = montar();
    await repo.criarVinculo('u1', h('inativo@x.com'), new Date());
    await v.solicitar('u1', 'ativo@x.com');
    expect(await v.confirmar('u1', enviados[0]?.codigo ?? '')).toBe('VINCULADO_ATIVO');
    expect((await repo.buscarVinculoPorDiscord('u1'))?.emailHash).toBe(h('ativo@x.com'));
  });
});

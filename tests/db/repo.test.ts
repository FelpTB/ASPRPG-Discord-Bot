import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrar } from '../../src/db/migrar.js';
import { criarRepo, type Repo } from '../../src/db/repo.js';
import { bancoDeTeste } from './pg.js';

let banco: Awaited<ReturnType<typeof bancoDeTeste>>;
let repo: Repo;
const agora = new Date('2026-11-25T12:00:00Z');
const dias = (n: number) => new Date(agora.getTime() - n * 86_400_000);

beforeAll(async () => {
  banco = await bancoDeTeste();
  repo = criarRepo(banco.sql);
}, 60_000);
afterAll(async () => banco?.fechar());
beforeEach(async () => {
  await banco.sql`truncate associados.assinantes, associados.vinculos, associados.codigos_verificacao, associados.pedidos_codigo, associados.eventos, associados.importacoes`;
});

const assinante = (h: string, status: 'ATIVA' | 'INATIVA' = 'ATIVA') => ({
  emailHash: h,
  emailCifrado: `cif-${h}`,
  nome: null,
  plano: null,
  status,
});
const meta = { adminId: 'adm', total: 2, ativos: 2, novos: 2, inativados: 0 };

describe('repo', () => {
  it('migrar é idempotente (segunda execução aplica 0 arquivos)', async () => {
    await expect(migrar(banco.sql, 'supabase/migrations')).resolves.toBe(0);
  });

  it('todas as tabelas ficam no schema associados; nada é criado em public', async () => {
    const tabelas = await banco.sql<{ table_schema: string; table_name: string }[]>`
      select table_schema, table_name from information_schema.tables
      where table_type = 'BASE TABLE' and table_schema in ('public', 'associados')
      order by table_name`;
    expect(tabelas.filter((t) => t.table_schema === 'public')).toEqual([]);
    expect(tabelas.map((t) => t.table_name)).toEqual([
      '_migracoes',
      'assinantes',
      'codigos_verificacao',
      'eventos',
      'importacoes',
      'pedidos_codigo',
      'vinculos',
    ]);
  });

  it('convive com uma tabela homônima de outro projeto em public sem tocá-la', async () => {
    await banco.sql`create table public.eventos (rpg text)`;
    try {
      await banco.sql`insert into public.eventos values ('sessão de sábado')`;
      await repo.registrarEvento({ discordId: 'u1', tipo: 'CARGO_DADO', detalhe: 'teste' });
      expect(await repo.listarEventos('u1', 10)).toHaveLength(1);
      expect(await banco.sql`select rpg from public.eventos`).toEqual([{ rpg: 'sessão de sábado' }]);
    } finally {
      await banco.sql`drop table public.eventos`;
    }
  });

  it('upsertAssinantes grava, buscarAssinante encontra e segundo upsert atualiza status', async () => {
    await repo.upsertAssinantes([assinante('h1'), assinante('h2')], meta, agora);
    expect((await repo.buscarAssinante('h1'))?.status).toBe('ATIVA');
    await repo.upsertAssinantes([assinante('h1', 'INATIVA')], { ...meta, total: 1 }, agora);
    expect((await repo.buscarAssinante('h1'))?.status).toBe('INATIVA');
    expect(await repo.listarAssinantes()).toHaveLength(2);
  });

  it('o mesmo email_hash não pode estar em dois vínculos', async () => {
    await repo.criarVinculo('u1', 'h1', agora);
    await expect(repo.criarVinculo('u2', 'h1', agora)).rejects.toThrow();
  });

  it('marcarInativoDesde grava e limpa a data', async () => {
    await repo.criarVinculo('u1', 'h1', agora);
    await repo.marcarInativoDesde('u1', dias(3));
    expect((await repo.buscarVinculoPorDiscord('u1'))?.inativoDesde?.toISOString()).toBe(
      dias(3).toISOString(),
    );
    await repo.marcarInativoDesde('u1', null);
    expect((await repo.buscarVinculoPorDiscord('u1'))?.inativoDesde).toBeNull();
  });

  it('contarPedidosUltimaHora conta só os da última hora', async () => {
    await repo.registrarPedido('u1', new Date(agora.getTime() - 2 * 3_600_000));
    await repo.registrarPedido('u1', new Date(agora.getTime() - 10 * 60_000));
    await repo.registrarPedido('u1', agora);
    expect(await repo.contarPedidosUltimaHora('u1', agora)).toBe(2);
  });

  it('salvarCodigo substitui o anterior e zera tentativas', async () => {
    await repo.salvarCodigo({ discordId: 'u1', emailHash: 'h1', codigoHash: 'a', expiraEm: agora });
    await repo.incrementarTentativa('u1');
    await repo.salvarCodigo({ discordId: 'u1', emailHash: 'h2', codigoHash: 'b', expiraEm: agora });
    expect(await repo.buscarCodigo('u1')).toMatchObject({ emailHash: 'h2', codigoHash: 'b', tentativas: 0 });
    await repo.incrementarTentativa('u1');
    expect((await repo.buscarCodigo('u1'))?.tentativas).toBe(1);
  });

  it('limpezaRetencao apaga código expirado e vínculo inativo há mais de 12 meses', async () => {
    await repo.salvarCodigo({ discordId: 'u1', emailHash: 'h1', codigoHash: 'a', expiraEm: dias(1) });
    await repo.salvarCodigo({
      discordId: 'u2',
      emailHash: 'h2',
      codigoHash: 'b',
      expiraEm: new Date(agora.getTime() + 60_000),
    });
    await repo.criarVinculo('v-velho', 'h3', dias(500));
    await repo.marcarInativoDesde('v-velho', dias(400));
    await repo.criarVinculo('v-recente', 'h4', dias(100));
    await repo.marcarInativoDesde('v-recente', dias(30));
    expect(await repo.limpezaRetencao(agora)).toEqual({ codigos: 1, vinculos: 1 });
    expect(await repo.buscarVinculoPorDiscord('v-velho')).toBeNull();
    expect(await repo.buscarCodigo('u2')).not.toBeNull();
  });

  it('listarEventos retorna do mais recente para o mais antigo', async () => {
    await repo.registrarEvento({ discordId: 'u1', tipo: 'VINCULO_CRIADO', detalhe: 'a' });
    await repo.registrarEvento({ discordId: 'u1', tipo: 'CARGO_DADO', detalhe: 'b' });
    expect((await repo.listarEventos('u1', 5)).map((e) => e.tipo)).toEqual(['CARGO_DADO', 'VINCULO_CRIADO']);
  });

  it('ping responde', async () => {
    await expect(repo.ping()).resolves.toBeUndefined();
  });
});

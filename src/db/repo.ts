import type { Sql } from 'postgres';

export type Status = 'ATIVA' | 'INATIVA';

export type Assinante = {
  emailHash: string;
  emailCifrado: string;
  nome: string | null;
  plano: string | null;
  status: Status;
  importadoEm: Date;
};
export type AssinanteNovo = Omit<Assinante, 'importadoEm'>;
export type ImportacaoMeta = {
  adminId: string;
  total: number;
  ativos: number;
  novos: number;
  inativados: number;
};
export type Vinculo = { discordId: string; emailHash: string; vinculadoEm: Date; inativoDesde: Date | null };
export type CodigoNovo = { discordId: string; emailHash: string; codigoHash: string; expiraEm: Date };
export type Codigo = CodigoNovo & { tentativas: number };
export type TipoEvento =
  | 'CARGO_DADO'
  | 'CARENCIA_INICIADA'
  | 'CARGO_REMOVIDO'
  | 'VINCULO_CRIADO'
  | 'VINCULO_MANUAL'
  | 'VINCULO_REMOVIDO'
  | 'EMAIL_CONFLITO'
  | 'IMPORTACAO'
  | 'SYNC_ABORTADA'
  | 'ERRO_PERMISSAO';
export type Evento = { quando: Date; discordId: string | null; tipo: TipoEvento; detalhe: string | null };

const RETENCAO_VINCULO_DIAS = 365;

export function criarRepo(sql: Sql) {
  const assinanteDe = (r: Record<string, unknown>): Assinante => ({
    emailHash: r.email_hash as string,
    emailCifrado: r.email_cifrado as string,
    nome: (r.nome as string | null) ?? null,
    plano: (r.plano as string | null) ?? null,
    status: r.status as Status,
    importadoEm: r.importado_em as Date,
  });
  const vinculoDe = (r: Record<string, unknown>): Vinculo => ({
    discordId: r.discord_id as string,
    emailHash: r.email_hash as string,
    vinculadoEm: r.vinculado_em as Date,
    inativoDesde: (r.inativo_desde as Date | null) ?? null,
  });

  return {
    async ping(): Promise<void> {
      await sql`select 1`;
    },

    async upsertAssinantes(linhas: AssinanteNovo[], meta: ImportacaoMeta, agora: Date): Promise<void> {
      await sql.begin(async (tx) => {
        for (const l of linhas) {
          await tx`
            insert into associados.assinantes (email_hash, email_cifrado, nome, plano, status, importado_em)
            values (${l.emailHash}, ${l.emailCifrado}, ${l.nome}, ${l.plano}, ${l.status}, ${agora})
            on conflict (email_hash) do update set
              email_cifrado = excluded.email_cifrado, nome = excluded.nome, plano = excluded.plano,
              status = excluded.status, importado_em = excluded.importado_em`;
        }
        await tx`
          insert into associados.importacoes (quando, admin_id, total, ativos, novos, inativados)
          values (${agora}, ${meta.adminId}, ${meta.total}, ${meta.ativos}, ${meta.novos}, ${meta.inativados})`;
        await tx`insert into associados.eventos (quando, discord_id, tipo, detalhe)
          values (${agora}, ${meta.adminId}, 'IMPORTACAO', ${JSON.stringify(meta)})`;
      });
    },

    async listarAssinantes(): Promise<Assinante[]> {
      return (await sql`select * from associados.assinantes`).map(assinanteDe);
    },

    async buscarAssinante(emailHash: string): Promise<Assinante | null> {
      const [r] = await sql`select * from associados.assinantes where email_hash = ${emailHash}`;
      return r ? assinanteDe(r) : null;
    },

    async ultimaImportacao(): Promise<{ quando: Date; total: number } | null> {
      const [r] = await sql`select quando, total from associados.importacoes order by quando desc limit 1`;
      return r ? { quando: r.quando as Date, total: r.total as number } : null;
    },

    async buscarVinculoPorDiscord(discordId: string): Promise<Vinculo | null> {
      const [r] = await sql`select * from associados.vinculos where discord_id = ${discordId}`;
      return r ? vinculoDe(r) : null;
    },

    async buscarVinculoPorEmail(emailHash: string): Promise<Vinculo | null> {
      const [r] = await sql`select * from associados.vinculos where email_hash = ${emailHash}`;
      return r ? vinculoDe(r) : null;
    },

    async criarVinculo(discordId: string, emailHash: string, agora: Date): Promise<void> {
      await sql`insert into associados.vinculos (discord_id, email_hash, vinculado_em) values (${discordId}, ${emailHash}, ${agora})`;
    },

    async removerVinculo(discordId: string): Promise<boolean> {
      const r = await sql`delete from associados.vinculos where discord_id = ${discordId}`;
      return r.count > 0;
    },

    async listarVinculos(): Promise<Vinculo[]> {
      return (await sql`select * from associados.vinculos`).map(vinculoDe);
    },

    async marcarInativoDesde(discordId: string, data: Date | null): Promise<void> {
      await sql`update associados.vinculos set inativo_desde = ${data} where discord_id = ${discordId}`;
    },

    async salvarCodigo(c: CodigoNovo): Promise<void> {
      await sql`
        insert into associados.codigos_verificacao (discord_id, email_hash, codigo_hash, expira_em, tentativas)
        values (${c.discordId}, ${c.emailHash}, ${c.codigoHash}, ${c.expiraEm}, 0)
        on conflict (discord_id) do update set
          email_hash = excluded.email_hash, codigo_hash = excluded.codigo_hash,
          expira_em = excluded.expira_em, tentativas = 0`;
    },

    async buscarCodigo(discordId: string): Promise<Codigo | null> {
      const [r] = await sql`select * from associados.codigos_verificacao where discord_id = ${discordId}`;
      return r
        ? {
            discordId: r.discord_id as string,
            emailHash: r.email_hash as string,
            codigoHash: r.codigo_hash as string,
            expiraEm: r.expira_em as Date,
            tentativas: r.tentativas as number,
          }
        : null;
    },

    async incrementarTentativa(discordId: string): Promise<void> {
      await sql`update associados.codigos_verificacao set tentativas = tentativas + 1 where discord_id = ${discordId}`;
    },

    async apagarCodigo(discordId: string): Promise<void> {
      await sql`delete from associados.codigos_verificacao where discord_id = ${discordId}`;
    },

    async registrarPedido(discordId: string, agora: Date): Promise<void> {
      await sql`insert into associados.pedidos_codigo (discord_id, criado_em) values (${discordId}, ${agora})`;
    },

    async contarPedidosUltimaHora(discordId: string, agora: Date): Promise<number> {
      const desde = new Date(agora.getTime() - 3_600_000);
      const [r] = await sql`
        select count(*)::int as n from associados.pedidos_codigo
        where discord_id = ${discordId} and criado_em > ${desde} and criado_em <= ${agora}`;
      return (r?.n as number) ?? 0;
    },

    async registrarEvento(e: {
      discordId?: string | null;
      tipo: TipoEvento;
      detalhe?: string;
    }): Promise<void> {
      await sql`insert into associados.eventos (discord_id, tipo, detalhe)
        values (${e.discordId ?? null}, ${e.tipo}, ${e.detalhe ?? null})`;
    },

    async listarEventos(discordId: string, limite: number): Promise<Evento[]> {
      const rs = await sql`
        select * from associados.eventos where discord_id = ${discordId} order by quando desc, id desc limit ${limite}`;
      return rs.map((r) => ({
        quando: r.quando as Date,
        discordId: r.discord_id as string | null,
        tipo: r.tipo as TipoEvento,
        detalhe: r.detalhe as string | null,
      }));
    },

    async limpezaRetencao(agora: Date): Promise<{ codigos: number; vinculos: number }> {
      const limite = new Date(agora.getTime() - RETENCAO_VINCULO_DIAS * 86_400_000);
      const c = await sql`delete from associados.codigos_verificacao where expira_em < ${agora}`;
      const v =
        await sql`delete from associados.vinculos where inativo_desde is not null and inativo_desde < ${limite}`;
      await sql`delete from associados.pedidos_codigo where criado_em < ${new Date(agora.getTime() - 86_400_000)}`;
      return { codigos: c.count, vinculos: v.count };
    },
  };
}

export type Repo = ReturnType<typeof criarRepo>;

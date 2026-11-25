import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Sql } from 'postgres';

/** Aplica, em ordem, os arquivos .sql ainda não aplicados. Retorna quantos foram aplicados. */
export async function migrar(sql: Sql, pasta: string): Promise<number> {
  await sql`create table if not exists _migracoes (nome text primary key, aplicada_em timestamptz not null default now())`;
  const aplicadas = new Set((await sql<{ nome: string }[]>`select nome from _migracoes`).map((r) => r.nome));
  const pendentes = readdirSync(pasta)
    .filter((f) => f.endsWith('.sql') && !aplicadas.has(f))
    .sort();
  for (const nome of pendentes) {
    const conteudo = readFileSync(join(pasta, nome), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(conteudo);
      await tx`insert into _migracoes (nome) values (${nome})`;
    });
  }
  return pendentes.length;
}

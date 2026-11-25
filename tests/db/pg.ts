import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { migrar } from '../../src/db/migrar.js';

/** Postgres embutido (PGlite) exposto via socket para o driver postgres.js. */
export async function bancoDeTeste() {
  const db = await PGlite.create();
  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();
  const sql = postgres({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    database: 'postgres',
    max: 1,
    prepare: false,
    onnotice: () => {},
  });
  await migrar(sql, 'supabase/migrations');
  return {
    sql,
    async fechar() {
      await sql.end();
      await server.stop();
      await db.close();
    },
  };
}

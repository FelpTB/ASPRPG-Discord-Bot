import postgres from 'postgres';

/** Conexão com o Supabase via Session pooler. `prepare: false` é exigido pelo pooler. */
export function conectar(databaseUrl: string) {
  return postgres(databaseUrl, {
    max: 5,
    prepare: false,
    idle_timeout: 60,
    connect_timeout: 10,
    onnotice: () => {},
  });
}

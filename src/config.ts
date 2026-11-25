import { z } from 'zod';

const chave32 = (nome: string) =>
  z
    .string({ error: `${nome} é obrigatória` })
    .transform((v) => Buffer.from(v, 'base64'))
    .refine((b) => b.length === 32, { message: `${nome} deve ter 32 bytes em base64` });

const id = (nome: string) => z.string({ error: `${nome} é obrigatório` }).min(1, `${nome} é obrigatório`);

const envSchema = z
  .object({
    DISCORD_TOKEN: id('DISCORD_TOKEN'),
    DISCORD_CLIENT_ID: id('DISCORD_CLIENT_ID'),
    GUILD_ID: id('GUILD_ID'),
    ROLE_ASSOCIADO_ID: id('ROLE_ASSOCIADO_ID'),
    ROLE_DIRETORIA_ID: id('ROLE_DIRETORIA_ID'),
    CHANNEL_LOG_ID: id('CHANNEL_LOG_ID'),
    CHANNEL_VERIFICACAO_ID: id('CHANNEL_VERIFICACAO_ID'),
    DATABASE_URL: id('DATABASE_URL'),
    EMAIL_ENC_KEY: chave32('EMAIL_ENC_KEY'),
    EMAIL_HMAC_KEY: chave32('EMAIL_HMAC_KEY'),
    MAILER_MODO: z.enum(['smtp', 'console']).default('smtp'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    CARENCIA_DIAS: z.coerce.number().int().min(0).default(7),
    HEALTHCHECK_URL: z.url().optional(),
    PRIVACIDADE_URL: z.url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.MAILER_MODO !== 'smtp') return;
    for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'] as const) {
      if (!env[k])
        ctx.addIssue({ code: 'custom', path: [k], message: `${k} é obrigatório com MAILER_MODO=smtp` });
    }
  });

const arquivoSchema = z.object({
  colunas: z.object({
    email: z.string().min(1),
    nome: z.string().optional(),
    plano: z.string().optional(),
    status: z.string().optional(),
  }),
  statusAtivos: z.array(z.string()).default([]),
  csvContemSoAtivos: z.boolean().optional(),
});

export type ConfigCsv = {
  colunas: { email: string; nome?: string; plano?: string; status?: string };
  statusAtivos: string[];
  csvContemSoAtivos: boolean;
};

export type Config = {
  discordToken: string;
  clientId: string;
  guildId: string;
  roleAssociadoId: string;
  roleDiretoriaId: string;
  canalLogId: string;
  canalVerificacaoId: string;
  databaseUrl: string;
  mailerModo: 'smtp' | 'console';
  smtp: { host: string; port: number; user: string; pass: string; from: string };
  emailEncKey: Buffer;
  emailHmacKey: Buffer;
  carenciaDias: number;
  csv: ConfigCsv;
  healthcheckUrl?: string;
  privacidadeUrl?: string;
};

function formatarErro(e: z.ZodError): Error {
  const linhas = e.issues.map((i) => `- ${i.path.join('.') || '(raiz)'}: ${i.message}`);
  return new Error(`Configuração inválida:\n${linhas.join('\n')}`);
}

export function carregarConfig(env: Record<string, string | undefined>, arquivo: unknown): Config {
  const semVazios = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const e = envSchema.safeParse(semVazios);
  if (!e.success) throw formatarErro(e.error);
  const a = arquivoSchema.safeParse(arquivo);
  if (!a.success) throw formatarErro(a.error);
  const v = e.data;
  const csv = a.data;
  return {
    discordToken: v.DISCORD_TOKEN,
    clientId: v.DISCORD_CLIENT_ID,
    guildId: v.GUILD_ID,
    roleAssociadoId: v.ROLE_ASSOCIADO_ID,
    roleDiretoriaId: v.ROLE_DIRETORIA_ID,
    canalLogId: v.CHANNEL_LOG_ID,
    canalVerificacaoId: v.CHANNEL_VERIFICACAO_ID,
    databaseUrl: v.DATABASE_URL,
    mailerModo: v.MAILER_MODO,
    smtp: {
      host: v.SMTP_HOST ?? '',
      port: v.SMTP_PORT,
      user: v.SMTP_USER ?? '',
      pass: v.SMTP_PASS ?? '',
      from: v.EMAIL_FROM ?? '',
    },
    emailEncKey: v.EMAIL_ENC_KEY,
    emailHmacKey: v.EMAIL_HMAC_KEY,
    carenciaDias: v.CARENCIA_DIAS,
    csv: {
      colunas: csv.colunas,
      statusAtivos: csv.statusAtivos,
      // Sem coluna de status, todas as linhas do CSV são consideradas assinaturas ativas.
      csvContemSoAtivos: csv.colunas.status ? (csv.csvContemSoAtivos ?? false) : true,
    },
    healthcheckUrl: v.HEALTHCHECK_URL,
    privacidadeUrl: v.PRIVACIDADE_URL,
  };
}

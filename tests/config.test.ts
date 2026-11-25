import { describe, expect, it } from 'vitest';
import { carregarConfig } from '../src/config.js';

const chave = Buffer.alloc(32, 7).toString('base64');
const envValido = {
  DISCORD_TOKEN: 'tok',
  DISCORD_CLIENT_ID: '1',
  GUILD_ID: '2',
  ROLE_ASSOCIADO_ID: '3',
  ROLE_DIRETORIA_ID: '4',
  CHANNEL_LOG_ID: '5',
  CHANNEL_VERIFICACAO_ID: '6',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  EMAIL_ENC_KEY: chave,
  EMAIL_HMAC_KEY: chave,
  MAILER_MODO: 'console',
};
const arquivo = { colunas: { email: 'Email' } };

describe('carregarConfig', () => {
  it('lança erro citando DISCORD_TOKEN quando ausente', () => {
    const { DISCORD_TOKEN: _, ...semToken } = envValido;
    expect(() => carregarConfig(semToken, arquivo)).toThrow(/DISCORD_TOKEN/);
  });

  it('rejeita EMAIL_ENC_KEY que não tem 32 bytes', () => {
    const env = { ...envValido, EMAIL_ENC_KEY: Buffer.alloc(16).toString('base64') };
    expect(() => carregarConfig(env, arquivo)).toThrow(/EMAIL_ENC_KEY/);
  });

  it('usa CARENCIA_DIAS = 7 por padrão', () => {
    expect(carregarConfig(envValido, arquivo).carenciaDias).toBe(7);
  });

  it('exige SMTP quando MAILER_MODO = smtp', () => {
    expect(() => carregarConfig({ ...envValido, MAILER_MODO: 'smtp' }, arquivo)).toThrow(/SMTP_HOST/);
  });

  it('sem coluna de status, trata o CSV como contendo só ativos', () => {
    const cfg = carregarConfig(envValido, arquivo);
    expect(cfg.csv.colunas.status).toBeUndefined();
    expect(cfg.csv.csvContemSoAtivos).toBe(true);
  });

  it('trata variáveis vazias (ex.: HEALTHCHECK_URL=) como ausentes', () => {
    const cfg = carregarConfig({ ...envValido, HEALTHCHECK_URL: '', CARENCIA_DIAS: '' }, arquivo);
    expect(cfg.healthcheckUrl).toBeUndefined();
    expect(cfg.carenciaDias).toBe(7);
  });
});

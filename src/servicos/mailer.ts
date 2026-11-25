import nodemailer from 'nodemailer';
import type { Config } from '../config.js';
import { mascararEmail } from '../dominio/email.js';
import { logger } from '../logger.js';
import type { Mailer } from './portas.js';

const assunto = 'Seu código de verificação — Associação Paulista de RPG';
const texto = (codigo: string) =>
  `Seu código de verificação é: ${codigo}\n\n` +
  'Digite-o no Discord, no botão "Inserir código". Ele vale por 15 minutos.\n' +
  'Se você não pediu este código, pode ignorar este e-mail.';

export function criarMailer(config: Config): Mailer {
  if (config.mailerModo === 'console') {
    logger.warn('MAILER_MODO=console: os códigos aparecem no log. Use apenas em TESTE.');
    return {
      async enviarCodigo(para, codigo) {
        logger.warn(`[MAILER CONSOLE] código para ${mascararEmail(para)}: ${codigo}`);
      },
    };
  }
  const transporte = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  return {
    async enviarCodigo(para, codigo) {
      await transporte.sendMail({
        from: config.smtp.from,
        to: para,
        subject: assunto,
        text: texto(codigo),
        html: `<p>Seu código de verificação é:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">${codigo}</p><p>Digite-o no Discord, no botão "Inserir código". Ele vale por 15 minutos.</p><p style="color:#666">Se você não pediu este código, pode ignorar este e-mail.</p>`,
      });
    },
  };
}

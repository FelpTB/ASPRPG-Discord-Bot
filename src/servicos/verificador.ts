import type { Repo } from '../db/repo.js';
import { codigoConfere, hashCodigo, hmacEmail } from '../dominio/cripto.js';
import { normalizarEmail } from '../dominio/email.js';
import {
  gerarCodigo,
  MAX_PEDIDOS_POR_HORA,
  MAX_TENTATIVAS,
  VALIDADE_CODIGO_MS,
} from '../dominio/verificacao.js';
import { logger } from '../logger.js';
import type { Auditoria, Mailer } from './portas.js';

export type ResultadoSolicitacao = 'ENVIADO_OU_SILENCIOSO' | 'EMAIL_INVALIDO' | 'LIMITE_PEDIDOS';
export type ResultadoConfirmacao =
  | 'VINCULADO_ATIVO'
  | 'VINCULADO_INATIVO'
  | 'CODIGO_INVALIDO'
  | 'CODIGO_EXPIRADO'
  | 'TENTATIVAS_ESGOTADAS'
  | 'EMAIL_JA_VINCULADO'
  | 'SEM_CODIGO';

export function criarVerificador(deps: {
  repo: Repo;
  mailer: Mailer;
  auditoria: Auditoria;
  emailHmacKey: Buffer;
  aoVincular: (discordId: string) => Promise<unknown>;
  agora?: () => Date;
}) {
  const agora = deps.agora ?? (() => new Date());
  const { repo } = deps;

  return {
    /**
     * Envia o código se o e-mail estiver na base. A resposta é a mesma exista o e-mail ou não,
     * para ninguém descobrir quem é associado testando e-mails.
     */
    async solicitar(discordId: string, emailBruto: string): Promise<ResultadoSolicitacao> {
      const email = normalizarEmail(emailBruto);
      if (!email) return 'EMAIL_INVALIDO';
      const t = agora();
      if ((await repo.contarPedidosUltimaHora(discordId, t)) >= MAX_PEDIDOS_POR_HORA) return 'LIMITE_PEDIDOS';
      await repo.registrarPedido(discordId, t);

      const emailHash = hmacEmail(email, deps.emailHmacKey);
      if (!(await repo.buscarAssinante(emailHash))) return 'ENVIADO_OU_SILENCIOSO';

      const codigo = gerarCodigo();
      await repo.salvarCodigo({
        discordId,
        emailHash,
        codigoHash: hashCodigo(codigo, discordId),
        expiraEm: new Date(t.getTime() + VALIDADE_CODIGO_MS),
      });
      // Sem await: o tempo de resposta não pode revelar se o e-mail está na base.
      deps.mailer
        .enviarCodigo(email, codigo)
        .catch((e) => logger.error({ err: e, discordId }, 'Falha ao enviar código por e-mail'));
      return 'ENVIADO_OU_SILENCIOSO';
    },

    async confirmar(discordId: string, codigoDigitado: string): Promise<ResultadoConfirmacao> {
      const c = await repo.buscarCodigo(discordId);
      if (!c) return 'SEM_CODIGO';
      if (c.tentativas >= MAX_TENTATIVAS) {
        await repo.apagarCodigo(discordId);
        return 'TENTATIVAS_ESGOTADAS';
      }
      if (agora() > c.expiraEm) {
        await repo.apagarCodigo(discordId);
        return 'CODIGO_EXPIRADO';
      }
      if (!codigoConfere(codigoDigitado.trim(), discordId, c.codigoHash)) {
        await repo.incrementarTentativa(discordId);
        return 'CODIGO_INVALIDO';
      }
      await repo.apagarCodigo(discordId);

      const dono = await repo.buscarVinculoPorEmail(c.emailHash);
      if (dono && dono.discordId !== discordId) {
        await deps.auditoria.registrar(
          'EMAIL_CONFLITO',
          discordId,
          `Tentou vincular um e-mail que já pertence a <@${dono.discordId}>. Verificação bloqueada.`,
        );
        return 'EMAIL_JA_VINCULADO';
      }
      if (!dono) {
        const anterior = await repo.buscarVinculoPorDiscord(discordId);
        if (anterior) await repo.removerVinculo(discordId);
        try {
          await repo.criarVinculo(discordId, c.emailHash, agora());
        } catch {
          return 'EMAIL_JA_VINCULADO'; // outra conta vinculou o mesmo e-mail ao mesmo tempo
        }
        await deps.auditoria.registrar('VINCULO_CRIADO', discordId, 'Verificado por código de e-mail');
      }

      const assinante = await repo.buscarAssinante(c.emailHash);
      await deps.aoVincular(discordId);
      return assinante?.status === 'ATIVA' ? 'VINCULADO_ATIVO' : 'VINCULADO_INATIVO';
    },
  };
}

export type Verificador = ReturnType<typeof criarVerificador>;

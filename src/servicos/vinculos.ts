import type { Repo } from '../db/repo.js';
import { decifrar, hmacEmail } from '../dominio/cripto.js';
import { mascararEmail, normalizarEmail } from '../dominio/email.js';
import type { Auditoria, PortaDiscord } from './portas.js';
import type { Sincronizador } from './sincronizador.js';

export function ehDiretoria(cargosDoMembro: Iterable<string>, roleDiretoriaId: string): boolean {
  for (const c of cargosDoMembro) if (c === roleDiretoriaId) return true;
  return false;
}

export type StatusMembro =
  | { vinculado: false }
  | {
      vinculado: true;
      emailMascarado: string | null;
      status: 'ATIVA' | 'INATIVA' | 'FORA_DA_BASE';
      plano: string | null;
      inativoDesde: Date | null;
      vinculadoEm: Date;
    };

export function criarGestaoVinculos(deps: {
  repo: Repo;
  porta: PortaDiscord;
  auditoria: Auditoria;
  sincronizador: Sincronizador;
  emailEncKey: Buffer;
  emailHmacKey: Buffer;
  agora?: () => Date;
}) {
  const agora = deps.agora ?? (() => new Date());
  const { repo } = deps;

  return {
    async vincularManual(
      discordId: string,
      emailBruto: string,
      adminId: string,
    ): Promise<{ ok: true } | { erro: 'EMAIL_INVALIDO' } | { erro: 'EMAIL_DE_OUTRO'; dono: string }> {
      const email = normalizarEmail(emailBruto);
      if (!email) return { erro: 'EMAIL_INVALIDO' };
      const hash = hmacEmail(email, deps.emailHmacKey);
      const dono = await repo.buscarVinculoPorEmail(hash);
      if (dono && dono.discordId !== discordId) return { erro: 'EMAIL_DE_OUTRO', dono: dono.discordId };
      if (!dono) {
        await repo.removerVinculo(discordId);
        await repo.criarVinculo(discordId, hash, agora());
        await deps.auditoria.registrar(
          'VINCULO_MANUAL',
          discordId,
          `Vinculado manualmente por <@${adminId}>`,
        );
      }
      await deps.sincronizador.sincronizarMembro(discordId);
      return { ok: true };
    },

    /** Remove o vínculo e o cargo. Retorna false se não havia vínculo. */
    async desvincular(discordId: string, porQuem: string): Promise<boolean> {
      const removido = await repo.removerVinculo(discordId);
      if (!removido) return false;
      const membro = await deps.porta.buscarMembro(discordId);
      if (membro?.temCargo()) await membro.removerCargo('Vínculo removido');
      await deps.auditoria.registrar('VINCULO_REMOVIDO', discordId, `Removido por <@${porQuem}>`);
      return true;
    },

    async statusDe(discordId: string): Promise<StatusMembro> {
      const v = await repo.buscarVinculoPorDiscord(discordId);
      if (!v) return { vinculado: false };
      const a = await repo.buscarAssinante(v.emailHash);
      return {
        vinculado: true,
        emailMascarado: a ? mascararEmail(decifrar(a.emailCifrado, deps.emailEncKey)) : null,
        status: a?.status ?? 'FORA_DA_BASE',
        plano: a?.plano ?? null,
        inativoDesde: v.inativoDesde,
        vinculadoEm: v.vinculadoEm,
      };
    },

    async relatorio() {
      const [assinantes, vinculos, ultima] = await Promise.all([
        repo.listarAssinantes(),
        repo.listarVinculos(),
        repo.ultimaImportacao(),
      ]);
      const ativos = new Set(assinantes.filter((a) => a.status === 'ATIVA').map((a) => a.emailHash));
      const vinculadosHash = new Set(vinculos.map((v) => v.emailHash));
      return {
        ativosNaBase: ativos.size,
        vinculados: vinculos.length,
        ativosSemVinculo: [...ativos].filter((h) => !vinculadosHash.has(h)).length,
        vinculadosInativos: vinculos.filter((v) => !ativos.has(v.emailHash)).length,
        emCarencia: vinculos.filter((v) => v.inativoDesde !== null).length,
        ultimaImportacao: ultima?.quando ?? null,
      };
    },
  };
}

export type GestaoVinculos = ReturnType<typeof criarGestaoVinculos>;

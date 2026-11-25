import { randomUUID } from 'node:crypto';
import type { ConfigCsv } from '../config.js';
import type { AssinanteNovo, Repo } from '../db/repo.js';
import { cifrar, hmacEmail } from '../dominio/cripto.js';
import { calcularDiff, type DiffImportacao, type ErroLinha, lerCsv } from '../dominio/importacao.js';

const VALIDADE_PREVIA_MS = 10 * 60_000;

type Previa = { adminId: string; criadaEm: number; registros: AssinanteNovo[]; diff: DiffImportacao };

export class ErroPrevia extends Error {}

export function criarImportador(deps: {
  repo: Repo;
  csv: ConfigCsv;
  emailEncKey: Buffer;
  emailHmacKey: Buffer;
  aoAplicar: () => Promise<unknown>;
  agora?: () => Date;
}) {
  const agora = deps.agora ?? (() => new Date());
  const previas = new Map<string, Previa>();
  const hmac = (e: string) => hmacEmail(e, deps.emailHmacKey);

  return {
    /** Lê o CSV e calcula o que mudaria, sem gravar nada. Lança ErroCsv se o arquivo for inválido. */
    async previsualizar(
      bytes: Buffer,
      adminId: string,
    ): Promise<{ token: string; diff: DiffImportacao; erros: ErroLinha[] }> {
      const { linhas, erros } = lerCsv(bytes, deps.csv);
      const [atuais, vinculos] = await Promise.all([
        deps.repo.listarAssinantes(),
        deps.repo.listarVinculos(),
      ]);
      const diff = calcularDiff(linhas, atuais, new Set(vinculos.map((v) => v.emailHash)), hmac);

      const noCsv = new Set<string>();
      const registros: AssinanteNovo[] = linhas.map((l) => {
        const emailHash = hmac(l.email);
        noCsv.add(emailHash);
        return {
          emailHash,
          emailCifrado: cifrar(l.email, deps.emailEncKey),
          nome: l.nome,
          plano: l.plano,
          status: l.ativo ? 'ATIVA' : 'INATIVA',
        };
      });
      for (const a of atuais) {
        if (!noCsv.has(a.emailHash) && a.status === 'ATIVA') registros.push({ ...a, status: 'INATIVA' });
      }

      for (const [t, p] of previas)
        if (agora().getTime() - p.criadaEm > VALIDADE_PREVIA_MS) previas.delete(t);
      const token = randomUUID().slice(0, 8);
      previas.set(token, { adminId, criadaEm: agora().getTime(), registros, diff });
      return { token, diff, erros };
    },

    /** Grava a prévia (uma única vez, só pelo mesmo admin, em até 10 min) e dispara a sincronização. */
    async aplicar(token: string, adminId: string): Promise<DiffImportacao> {
      const p = previas.get(token);
      if (!p || p.adminId !== adminId)
        throw new ErroPrevia('Prévia inválida ou expirou. Envie o arquivo de novo.');
      previas.delete(token);
      if (agora().getTime() - p.criadaEm > VALIDADE_PREVIA_MS) {
        throw new ErroPrevia('A prévia expirou (10 min). Envie o arquivo de novo.');
      }
      await deps.repo.upsertAssinantes(
        p.registros,
        {
          adminId,
          total: p.registros.length,
          ativos: p.diff.totalAtivos,
          novos: p.diff.novos.length,
          inativados: p.diff.inativados.length,
        },
        agora(),
      );
      await deps.aoAplicar();
      return p.diff;
    },
  };
}

export type Importador = ReturnType<typeof criarImportador>;

import { parse } from 'csv-parse/sync';
import type { ConfigCsv } from '../config.js';
import type { Assinante } from '../db/repo.js';
import { normalizarEmail } from './email.js';

export type LinhaAssinante = { email: string; nome: string | null; plano: string | null; ativo: boolean };
export type ErroLinha = { linha: number; motivo: string };
export type DiffImportacao = {
  novos: string[];
  reativados: string[];
  inativados: string[];
  inalterados: number;
  totalAtivos: number;
  inativadosVinculados: number;
  percentualInativadosVinculados: number;
};

/** Erro que impede a importação inteira (nada é aplicado). */
export class ErroCsv extends Error {}

const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function decodificar(bytes: Buffer): string {
  const utf8 = bytes.toString('utf8');
  const texto = utf8.includes('�') ? bytes.toString('latin1') : utf8;
  return texto.replace(/^﻿/, '');
}

function detectarSeparador(texto: string): ';' | ',' {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? '';
  return (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
}

export function lerCsv(bytes: Buffer, cfg: ConfigCsv): { linhas: LinhaAssinante[]; erros: ErroLinha[] } {
  const texto = decodificar(bytes);
  if (!texto.trim()) throw new ErroCsv('O arquivo está vazio.');

  let registros: { record: string[]; info: { lines: number } }[];
  try {
    registros = parse(texto, {
      delimiter: detectarSeparador(texto),
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      info: true,
    }) as unknown as { record: string[]; info: { lines: number } }[];
  } catch (e) {
    throw new ErroCsv(`Não foi possível ler o CSV: ${(e as Error).message}`);
  }

  const [cabecalho, ...dados] = registros;
  if (!cabecalho) throw new ErroCsv('O arquivo está vazio.');
  const indices = cabecalho.record.map(chave);
  const indice = (nome: string | undefined, obrigatoria: boolean): number | undefined => {
    if (!nome) return undefined;
    const i = indices.indexOf(chave(nome));
    if (i === -1 && obrigatoria) {
      throw new ErroCsv(
        `Coluna obrigatória "${nome}" não encontrada. Colunas do arquivo: ${cabecalho.record.join(', ')}`,
      );
    }
    return i === -1 ? undefined : i;
  };
  const iEmail = indice(cfg.colunas.email, true) as number;
  const iStatus = indice(cfg.colunas.status, !cfg.csvContemSoAtivos);
  const iNome = indice(cfg.colunas.nome, false);
  const iPlano = indice(cfg.colunas.plano, false);
  const ativos = new Set(cfg.statusAtivos.map(chave));
  const valor = (r: string[], i: number | undefined) => (i === undefined ? null : r[i] || null);

  const porEmail = new Map<string, LinhaAssinante>();
  const erros: ErroLinha[] = [];
  for (const { record, info } of dados) {
    const bruto = record[iEmail] ?? '';
    const email = normalizarEmail(bruto);
    if (!email) {
      erros.push({ linha: info.lines, motivo: `E-mail inválido: "${bruto}"` });
      continue;
    }
    const ativo = iStatus === undefined ? true : ativos.has(chave(record[iStatus] ?? ''));
    const linha = { email, nome: valor(record, iNome), plano: valor(record, iPlano), ativo };
    const existente = porEmail.get(email);
    if (!existente || (!existente.ativo && ativo)) porEmail.set(email, linha);
  }

  if (porEmail.size === 0) throw new ErroCsv('Nenhuma linha com e-mail válido foi encontrada.');
  return { linhas: [...porEmail.values()], erros };
}

/** Compara o CSV com a base atual. Assinante atual ausente do CSV é considerado inativo. */
export function calcularDiff(
  novas: LinhaAssinante[],
  atuais: Assinante[],
  vinculados: Set<string>,
  hmac: (email: string) => string,
): DiffImportacao {
  const atualPorHash = new Map(atuais.map((a) => [a.emailHash, a]));
  const vistos = new Set<string>();
  const d: DiffImportacao = {
    novos: [],
    reativados: [],
    inativados: [],
    inalterados: 0,
    totalAtivos: 0,
    inativadosVinculados: 0,
    percentualInativadosVinculados: 0,
  };

  for (const l of novas) {
    const h = hmac(l.email);
    vistos.add(h);
    const a = atualPorHash.get(h);
    if (l.ativo) d.totalAtivos++;
    if (!a) {
      if (l.ativo) d.novos.push(h);
      else d.inalterados++;
    } else if (a.status === 'INATIVA' && l.ativo) d.reativados.push(h);
    else if (a.status === 'ATIVA' && !l.ativo) d.inativados.push(h);
    else d.inalterados++;
  }
  for (const a of atuais) {
    if (!vistos.has(a.emailHash) && a.status === 'ATIVA') d.inativados.push(a.emailHash);
  }

  d.inativadosVinculados = d.inativados.filter((h) => vinculados.has(h)).length;
  d.percentualInativadosVinculados =
    vinculados.size === 0 ? 0 : Math.round((d.inativadosVinculados / vinculados.size) * 100);
  return d;
}

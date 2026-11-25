import { describe, expect, it } from 'vitest';
import type { ConfigCsv } from '../../src/config.js';
import type { Assinante } from '../../src/db/repo.js';
import { calcularDiff, ErroCsv, lerCsv } from '../../src/dominio/importacao.js';

const soEmail: ConfigCsv = { colunas: { email: 'Email' }, statusAtivos: [], csvContemSoAtivos: true };
const completo: ConfigCsv = {
  colunas: { email: 'Email', nome: 'Nome', plano: 'Recompensa', status: 'Status da Assinatura' },
  statusAtivos: ['Ativa'],
  csvContemSoAtivos: false,
};
const utf8 = (s: string) => Buffer.from(s, 'utf8');

describe('lerCsv', () => {
  it('lê CSV só com e-mails, tratando todos como ativos', () => {
    const r = lerCsv(utf8('Email\na@x.com\nb@x.com\n'), soEmail);
    expect(r.linhas).toEqual([
      { email: 'a@x.com', nome: null, plano: null, ativo: true },
      { email: 'b@x.com', nome: null, plano: null, ativo: true },
    ]);
    expect(r.erros).toEqual([]);
  });

  it('aceita CSV do Excel: separador ; e BOM UTF-8', () => {
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8('Nome;Email\nJoão;joao@x.com\n')]);
    expect(lerCsv(bom, soEmail).linhas[0]).toMatchObject({ email: 'joao@x.com' });
  });

  it('decodifica Latin-1 preservando acentos', () => {
    const latin = Buffer.from('Nome;Email\nJoão;joao@x.com\n', 'latin1');
    const cfg: ConfigCsv = { ...soEmail, colunas: { email: 'Email', nome: 'Nome' } };
    expect(lerCsv(latin, cfg).linhas[0]?.nome).toBe('João');
  });

  it('encontra colunas ignorando maiúsculas, acentos e espaços', () => {
    const r = lerCsv(utf8(' E-MAIL ,x\na@x.com,1\n'), { ...soEmail, colunas: { email: 'e-mail' } });
    expect(r.linhas).toHaveLength(1);
  });

  it('normaliza e-mails sujos', () => {
    expect(lerCsv(utf8('Email\n  Fulano@Gmail.COM \n'), soEmail).linhas[0]?.email).toBe('fulano@gmail.com');
  });

  it('linha com e-mail inválido vira erro e é ignorada', () => {
    const r = lerCsv(utf8('Email\na@x.com\nnao-e-email\n'), soEmail);
    expect(r.linhas).toHaveLength(1);
    expect(r.erros).toEqual([{ linha: 3, motivo: 'E-mail inválido: "nao-e-email"' }]);
  });

  it('e-mail duplicado: vale a ocorrência ativa', () => {
    const csv =
      'Email,Status da Assinatura\na@x.com,Ativa\na@x.com,Cancelada\nb@x.com,Cancelada\nb@x.com,Ativa\n';
    const r = lerCsv(utf8(csv), completo);
    expect(r.linhas.map((l) => [l.email, l.ativo])).toEqual([
      ['a@x.com', true],
      ['b@x.com', true],
    ]);
  });

  it('usa a coluna de status quando configurada', () => {
    const csv = 'Email,Status da Assinatura,Recompensa\na@x.com,Ativa,Ouro\nb@x.com,Cancelada,Prata\n';
    const r = lerCsv(utf8(csv), completo);
    expect(r.linhas).toEqual([
      { email: 'a@x.com', nome: null, plano: 'Ouro', ativo: true },
      { email: 'b@x.com', nome: null, plano: 'Prata', ativo: false },
    ]);
  });

  it('coluna obrigatória ausente é erro fatal citando a coluna', () => {
    expect(() => lerCsv(utf8('Email\na@x.com\n'), completo)).toThrow(ErroCsv);
    expect(() => lerCsv(utf8('Email\na@x.com\n'), completo)).toThrow(/Status da Assinatura/);
    expect(() => lerCsv(utf8('Mail\na@x.com\n'), soEmail)).toThrow(/Email/);
  });

  it('arquivo sem nenhuma linha válida é erro fatal', () => {
    expect(() => lerCsv(utf8('Email\n'), soEmail)).toThrow(ErroCsv);
    expect(() => lerCsv(utf8(''), soEmail)).toThrow(ErroCsv);
    expect(() => lerCsv(utf8('Email\nlixo\n'), soEmail)).toThrow(ErroCsv);
  });
});

describe('calcularDiff', () => {
  const hmac = (e: string) => `h:${e}`;
  const atual = (email: string, status: 'ATIVA' | 'INATIVA'): Assinante => ({
    emailHash: hmac(email),
    emailCifrado: '',
    nome: null,
    plano: null,
    status,
    importadoEm: new Date(),
  });
  const linha = (email: string, ativo = true) => ({ email, nome: null, plano: null, ativo });

  it('classifica novos, reativados, inativados e inalterados', () => {
    const atuais = [
      atual('a@x', 'ATIVA'),
      atual('b@x', 'INATIVA'),
      atual('c@x', 'ATIVA'),
      atual('d@x', 'ATIVA'),
    ];
    const novas = [linha('a@x'), linha('b@x'), linha('c@x', false), linha('e@x')];
    const d = calcularDiff(novas, atuais, new Set(), hmac);
    expect(d.novos).toEqual(['h:e@x']);
    expect(d.reativados).toEqual(['h:b@x']);
    expect(d.inativados.sort()).toEqual(['h:c@x', 'h:d@x']); // d@x ausente do CSV conta como inativo
    expect(d.inalterados).toBe(1);
    expect(d.totalAtivos).toBe(3);
  });

  it('calcula o percentual de vinculados que seriam inativados', () => {
    const emails = Array.from({ length: 10 }, (_, i) => `u${i}@x`);
    const atuais = emails.map((e) => atual(e, 'ATIVA'));
    const novas = emails.slice(3).map((e) => linha(e));
    const d = calcularDiff(novas, atuais, new Set(emails.map(hmac)), hmac);
    expect(d.inativadosVinculados).toBe(3);
    expect(d.percentualInativadosVinculados).toBe(30);
  });

  it('percentual é 0 quando não há vinculados', () => {
    expect(calcularDiff([linha('a@x')], [], new Set(), hmac).percentualInativadosVinculados).toBe(0);
  });
});

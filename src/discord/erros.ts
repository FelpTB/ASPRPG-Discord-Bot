const CODIGOS_DE_CONEXAO = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
]);

/** Converte um erro em mensagem para o usuário, sem vazar detalhes internos. */
export function mensagemDeErro(e: unknown): string {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : '';
  if (CODIGOS_DE_CONEXAO.has(code)) {
    return '⚠️ Sistema temporariamente indisponível. Tente novamente em alguns minutos.';
  }
  return '❌ Ocorreu um erro inesperado. A Diretoria foi avisada pelo registro do bot.';
}

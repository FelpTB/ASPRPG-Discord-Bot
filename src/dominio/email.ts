const FORMATO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarEmail(bruto: string): string | null {
  const email = bruto.trim().toLowerCase();
  if (email.length > 254 || !FORMATO.test(email)) return null;
  return email;
}

export function mascararEmail(email: string): string {
  const [local = '', dominio = ''] = email.split('@');
  const visivel = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visivel}***@${dominio}`;
}

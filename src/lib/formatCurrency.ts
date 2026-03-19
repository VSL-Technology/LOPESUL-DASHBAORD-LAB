export function formatCurrencyBRL(value = 0) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatPlanLabel(plan) {
  if (!plan) return 'Acesso';
  const normalized = String(plan).trim().toLowerCase();
  if (normalized.includes('12h')) return '12h';
  if (normalized.includes('24h')) return '24h';
  if (normalized.includes('48h')) return '48h';
  return plan;
}

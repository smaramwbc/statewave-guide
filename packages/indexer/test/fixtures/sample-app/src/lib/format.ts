export function formatClientName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

export const formatCurrency = (amount: number, currency = 'USD'): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

function notExported(value: string): string {
  return value.toUpperCase();
}

export const upper = (value: string): string => notExported(value);

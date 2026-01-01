export const DAYS_OPTIONS = [1, 5, 10, 20, 30, 40, 60] as const;
export type Days = (typeof DAYS_OPTIONS)[number];

export const SIDE_OPTIONS = ['netBuy', 'netSell'] as const;
export type Side = (typeof SIDE_OPTIONS)[number];

export function parseSide(v: string | null): Side {
  return v === 'netSell' ? 'netSell' : 'netBuy';
}

export function parseDays(v: string | null): Days {
  const n = Number(v);
  return (DAYS_OPTIONS as readonly number[]).includes(n) ? (n as Days) : 10;
}

export function parseTicker(v: string | null): string {
  const t = (v ?? '').trim();
  return t.length > 0 ? t.toUpperCase() : 'NVDA';
}

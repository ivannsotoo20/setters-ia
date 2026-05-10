/**
 * Sprint Kappa — Resolución del time window seleccionado en el banner KPI.
 * Soporta presets (today/7d/30d/thisMonth/lastMonth) + custom (from/to ISO).
 */

export type WindowKey = 'today' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom';

const VALID: readonly WindowKey[] = ['today', '7d', '30d', 'thisMonth', 'lastMonth', 'custom'];

export function parseWindowKey(value: string | null | undefined): WindowKey {
  if (value && (VALID as readonly string[]).includes(value)) return value as WindowKey;
  return '30d';
}

export interface WindowRange {
  from: string;
  to: string;
}

export function resolveWindowRange(
  key: WindowKey,
  customFrom: string | null,
  customTo: string | null,
  now: Date = new Date(),
): WindowRange {
  const to = new Date(now);
  const from = new Date(now);

  switch (key) {
    case 'today':
      from.setHours(0, 0, 0, 0);
      break;
    case '7d':
      from.setDate(from.getDate() - 7);
      break;
    case '30d':
      from.setDate(from.getDate() - 30);
      break;
    case 'thisMonth':
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      break;
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    case 'custom': {
      const fromIso =
        customFrom && !Number.isNaN(Date.parse(customFrom))
          ? new Date(customFrom).toISOString()
          : (() => {
              const d = new Date(now);
              d.setDate(d.getDate() - 30);
              return d.toISOString();
            })();
      const toIso =
        customTo && !Number.isNaN(Date.parse(customTo))
          ? new Date(customTo).toISOString()
          : to.toISOString();
      return { from: fromIso, to: toIso };
    }
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

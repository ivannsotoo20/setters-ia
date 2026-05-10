/**
 * Sprint Iota.1 — Cliente HTTP YCloud Templates inline en panel.
 *
 * Duplica `packages/channel-adapters/src/ycloud/templates.ts` para evitar
 * issues de Turbopack con resolución de imports `.js` desde workspace
 * packages (mismo workaround que `manual-send.ts` ha usado desde Sprint Zeta).
 */

const DEFAULT_BASE_URL = 'https://api.ycloud.com';

export interface YCloudTemplateRow {
  name: string;
  language: string;
  category: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'DISABLED' | string;
  components?: Array<{
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS' | string;
    text?: string;
    example?: { body_text?: string[][] };
  }>;
  [key: string]: unknown;
}

export class YCloudPanelError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'YCloudPanelError';
    this.status = status;
    this.body = body;
  }
}

export async function ycloudListTemplates(params: {
  apiKey: string;
  wabaId: string;
  baseUrl?: string;
}): Promise<YCloudTemplateRow[]> {
  const { apiKey, wabaId, baseUrl = DEFAULT_BASE_URL } = params;
  if (!apiKey || !wabaId) throw new Error('ycloudListTemplates: apiKey + wabaId requeridos');

  // YCloud rechaza limit > 100 con 400 PARAM_INVALID. Si en algún tenant Iván
  // llega a tener >100 plantillas, habrá que paginar con offset (raro: el cap
  // típico de Meta es ~100-250 plantillas por WABA y el trainer rara vez supera
  // las 20). Para MVP el primer batch de 100 cubre todos los casos reales.
  const url = `${baseUrl.replace(/\/$/, '')}/v2/whatsapp/templates?wabaId=${encodeURIComponent(wabaId)}&limit=100`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
  });

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    throw new YCloudPanelError(
      `YCloud listTemplates HTTP ${response.status}`,
      response.status,
      parsed,
    );
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  // YCloud devuelve {offset, limit, length, items: [...]}. Mantenemos fallbacks
  // a `list` / `data` por defensa (otros wrappers pueden devolver shapes
  // distintos), pero el shape real verificado de YCloud usa `items`.
  const list = Array.isArray(obj.items)
    ? obj.items
    : Array.isArray(obj.list)
      ? obj.list
      : Array.isArray(obj.data)
        ? obj.data
        : [];
  return list.filter((it) => typeof it === 'object' && it != null) as YCloudTemplateRow[];
}

export function extractTemplateBody(template: YCloudTemplateRow): string | null {
  const body = (template.components ?? []).find(
    (c) => c.type === 'BODY' || c.type === 'body',
  );
  return body?.text ?? null;
}

export function extractTemplateVariables(
  template: YCloudTemplateRow,
): Array<{ name: string; sample: string | null }> {
  const body = extractTemplateBody(template);
  if (!body) return [];
  // Soporta dos formatos de placeholder en plantillas Meta WhatsApp:
  //   - Numérico clásico: {{1}}, {{2}}  → orden estricto.
  //   - Named (NEW v15+): {{nombre}}, {{producto}} → más legible, mismo orden.
  // Capturamos cualquier {{anything}} y deduplicamos preservando orden de aparición.
  const matches = body.match(/\{\{([^{}]+)\}\}/g) ?? [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const m of matches) {
    const name = m.replace(/[{}]/g, '').trim();
    if (!seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  }
  const samples =
    template.components?.find((c) => c.type === 'BODY' || c.type === 'body')?.example
      ?.body_text?.[0] ?? [];
  return ordered.map((name, idx) => ({
    name,
    sample: samples[idx] ?? null,
  }));
}

/**
 * Cálculo de coste de llamadas a Anthropic.
 *
 * Tabla de precios (USD por millón de tokens) según el catálogo público de Anthropic
 * en oct-2025. Mantener sincronizado cuando Anthropic ajuste pricing.
 *
 * El cliente puede sobreescribir `priceTable` para tarifas personalizadas
 * (clientes empresariales o tests).
 */

export interface ModelPriceUsdPerMTokens {
  inputUncached: number;
  cacheRead: number;
  /** Cache write con TTL 5min (default histórico). */
  cacheWrite: number;
  /**
   * Cache write con TTL 1h = 2× `inputUncached`.
   *
   * OJO con la referencia: las dos tarifas de escritura se definen sobre el
   * input base (5min = 1,25×, 1h = 2×), NO una sobre la otra. Tomar el 1h como
   * `2 × cacheWrite` da 2,5× base e infla el coste un 25%. Ese era el error de
   * las filas de Haiku 4.5, Sonnet 4.5 y Opus 4.5 hasta 2026-08-09, y como el
   * motor escribe siempre con TTL 1h, el historico de `llm_calls` anterior a esa
   * fecha lleva las escrituras de cache infladas ese 25%.
   */
  cacheWrite1h?: number;
  output: number;
}

export const DEFAULT_PRICE_TABLE: Record<string, ModelPriceUsdPerMTokens> = {
  // Sonnet 5 — modelo del Generator desde 2026-08-09.
  //
  // Tarifa ESTÁNDAR ($3/$15). Anthropic aplica una tarifa de lanzamiento más
  // barata ($2/$10) hasta el 2026-08-31; se usa la estándar a propósito para
  // no subestimar el coste a partir de septiembre. Mientras dure el descuento
  // el registro va ligeramente por encima del cargo real, que es el lado
  // correcto por el que equivocarse.
  'claude-sonnet-5': {
    inputUncached: 3.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
    cacheWrite1h: 6.0,
    output: 15.0,
  },
  // Sonnet 4.5 (claude-sonnet-4-5-20250929 / claude-sonnet-4-5-latest)
  'claude-sonnet-4-5': {
    inputUncached: 3.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
    cacheWrite1h: 6.0,
    output: 15.0,
  },
  // Haiku 4.5
  'claude-haiku-4-5': {
    inputUncached: 1.0,
    cacheRead: 0.1,
    cacheWrite: 1.25,
    cacheWrite1h: 2.0,
    output: 5.0,
  },
  // Opus 4.5 (referencia, no se usa en pipeline actual)
  'claude-opus-4-5': {
    inputUncached: 15.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
    cacheWrite1h: 30.0,
    output: 75.0,
  },
};

/**
 * Resuelve el precio para un model id concreto. Acepta alias `claude-sonnet-4-5-latest`
 * o snapshots `claude-sonnet-4-5-20250929` y los mapea a la familia base.
 */
export function resolvePriceForModel(
  model: string,
  table: Record<string, ModelPriceUsdPerMTokens> = DEFAULT_PRICE_TABLE,
): ModelPriceUsdPerMTokens | null {
  const direct = table[model];
  if (direct) return direct;

  // Heurística por prefix.
  //
  // ⚠️ Si un modelo no casa aquí, `calculateCostUsd` devuelve 0 y el coste se
  // registra como CERO en `llm_calls` — sin error y sin aviso. Al añadir un
  // modelo nuevo al pipeline, añadirlo también a esta tabla.
  const lower = model.toLowerCase();
  // 'sonnet-5' va antes que 'sonnet-4-5' por legibilidad; no colisionan porque
  // la cadena 'claude-sonnet-4-5' no contiene 'sonnet-5'.
  if (lower.includes('sonnet-5')) {
    return table['claude-sonnet-5'] ?? null;
  }
  if (lower.includes('sonnet-4-5') || lower.includes('sonnet-4.5')) {
    return table['claude-sonnet-4-5'] ?? null;
  }
  if (lower.includes('haiku-4-5') || lower.includes('haiku-4.5')) {
    return table['claude-haiku-4-5'] ?? null;
  }
  if (lower.includes('opus-4-5') || lower.includes('opus-4.5')) {
    return table['claude-opus-4-5'] ?? null;
  }
  return null;
}

export interface CostInput {
  model: string;
  tokensInUncached: number;
  tokensInCacheRead: number;
  tokensInCacheWrite: number;
  tokensOut: number;
  /**
   * TTL del cache_control que se usó al ESCRIBIR el cache en esta llamada.
   * - `'5m'` (default): tarifa cacheWrite estándar.
   * - `'1h'`: tarifa cacheWrite1h (2× el input base, es decir 1,6× la de 5min).
   *   Si el modelo no define `cacheWrite1h`, se deriva como `2 × inputUncached`.
   *
   * Anthropic NO devuelve el TTL en el response.usage, así que el caller debe
   * pasarlo de acuerdo a lo que configuró en `cache_control.ttl` de la request.
   */
  cacheTtl?: '5m' | '1h';
  priceTable?: Record<string, ModelPriceUsdPerMTokens>;
}

/**
 * Devuelve el coste en USD de una llamada. Si el modelo no existe en la tabla,
 * devuelve 0 (mejor 0 que un número falso).
 */
export function calculateCostUsd(input: CostInput): number {
  const price = resolvePriceForModel(input.model, input.priceTable);
  if (!price) return 0;

  const ttl = input.cacheTtl ?? '5m';
  // La tarifa de escritura se define sobre el INPUT BASE, no sobre la de 5min:
  // 5min = 1,25× base, 1h = 2× base. Derivar el 1h como `cacheWrite × 2` da
  // 2,5× base e infla el coste un 25%.
  const cacheWriteRate =
    ttl === '1h' ? (price.cacheWrite1h ?? price.inputUncached * 2) : price.cacheWrite;

  const cost =
    (input.tokensInUncached * price.inputUncached +
      input.tokensInCacheRead * price.cacheRead +
      input.tokensInCacheWrite * cacheWriteRate +
      input.tokensOut * price.output) /
    1_000_000;

  return Number(cost.toFixed(6));
}

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
  cacheWrite: number;
  output: number;
}

export const DEFAULT_PRICE_TABLE: Record<string, ModelPriceUsdPerMTokens> = {
  // Sonnet 4.5 (claude-sonnet-4-5-20250929 / claude-sonnet-4-5-latest)
  'claude-sonnet-4-5': {
    inputUncached: 3.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
    output: 15.0,
  },
  // Haiku 4.5
  'claude-haiku-4-5': {
    inputUncached: 1.0,
    cacheRead: 0.1,
    cacheWrite: 1.25,
    output: 5.0,
  },
  // Opus 4.5 (referencia, no se usa en pipeline actual)
  'claude-opus-4-5': {
    inputUncached: 15.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
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

  // Heurística por prefix
  const lower = model.toLowerCase();
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
  priceTable?: Record<string, ModelPriceUsdPerMTokens>;
}

/**
 * Devuelve el coste en USD de una llamada. Si el modelo no existe en la tabla,
 * devuelve 0 (mejor 0 que un número falso).
 */
export function calculateCostUsd(input: CostInput): number {
  const price = resolvePriceForModel(input.model, input.priceTable);
  if (!price) return 0;

  const cost =
    (input.tokensInUncached * price.inputUncached +
      input.tokensInCacheRead * price.cacheRead +
      input.tokensInCacheWrite * price.cacheWrite +
      input.tokensOut * price.output) /
    1_000_000;

  return Number(cost.toFixed(6));
}

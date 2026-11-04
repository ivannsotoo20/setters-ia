/**
 * Re-export. La lógica (palabra suelta, respuesta de botón, auto-respuesta en
 * menos de 2 minutos) vive en `@fyzon/shared-validator`
 * (`packages/shared-validator/src/lib/inbound-opening.ts`) desde 2026-11-04,
 * porque el motor también la usa en el gate de intención en la apertura
 * (`apps/motor-agente/src/services/inbound-intent-gate.ts`). Los importadores
 * del panel (dashboard-loader, widget-catalog) siguen leyendo de aquí.
 */
export {
  AUTO_REPLY_WINDOW_MS,
  isBareKeywordOpening,
  isKeywordFlowOpening,
  normalizeOpening,
} from '@fyzon/shared-validator';

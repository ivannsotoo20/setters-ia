/**
 * Re-export. La lógica (palabra suelta, respuesta de botón, auto-respuesta en
 * menos de 2 minutos) vive en `@fyzon/shared-validator`
 * (`packages/shared-validator/src/lib/inbound-opening.ts`) desde 2026-11-04,
 * porque el motor también la usa en el gate de intención en la apertura
 * (`apps/motor-agente/src/services/inbound-intent-gate.ts`). Los importadores
 * del panel (dashboard-loader, widget-catalog) siguen leyendo de aquí.
 *
 * Se importa por la subruta `@fyzon/shared-validator/inbound-opening`, no por
 * la raíz del package: el `index.ts` del validador usa imports relativos con
 * extensión `.js` (ESM de Node) que Turbopack no resuelve a `.ts`, y el build
 * del panel en Vercel se caía con "Can't resolve './rules/index.js'"
 * (deploy dpl_GbHpJxZQDjch8c6Pz3QxFPVZ6Bu8, 2026-11-04). El fichero de la
 * subruta no tiene imports relativos. Cualquier otra pieza del validador que
 * necesite el panel entra por su propia subruta, nunca por la raíz.
 */
export {
  AUTO_REPLY_WINDOW_MS,
  isBareKeywordOpening,
  isKeywordFlowOpening,
  normalizeOpening,
} from '@fyzon/shared-validator/inbound-opening';

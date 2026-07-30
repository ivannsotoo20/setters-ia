# Tania v4 — setter IA sobre n8n + Anthropic (claude-sonnet-5)

Fuente de verdad del prompt, el contrato de salida, la regresión y la guía de despliegue del setter de **Tania Duarte de Matos** (dolor crónico de espalda). Corre en el n8n de Iván (fuera del SaaS Fyzon); este directorio es lo que se versiona y desde donde se despliega.

> Contexto y porqué de cada decisión: plan aprobado 2026-07-22 (auditoría de 1.748 sesiones: URLs de agenda rotas en el 62% de los envíos, doble ejecución del workflow, memoria lossy, output sobrecargado, descubrimiento sin salida, post-link sin juego). El diseño corrige arquitectura + prompt a la vez.

## Mapa

```
core/00…10-*.md      El prompt de Tania, en 11 secciones (identidad, voz ORO, memoria/slots,
                     dirección §19-29, cualificación, objeciones, recap+oferta, post-link,
                     derivación/cierres, etapas, output). BYTE-IDÉNTICO para las 4 fuentes.
variantes/*.md       Lo único que cambia por fuente: origen del lead, primeras jugadas y
                     enlaces (booking_url / whatsapp_fallback en el frontmatter).
seguimiento/         System del workflow de follow-ups (claude-haiku-4-5).
tools/               responder_lead.schema.json (contrato ÚNICO de salida) + etapas-foco.json
                     (línea de foco por etapa que el compose inyecta en <estado_conversacion>).
build/               build-tania-v4.mjs → compila core+variante → dist/.
dist/                GENERADO y versionado: lo que se pega en n8n. No editar a mano.
fixtures/            Regresión: sesiones reales del CSV como fixtures + runner + sims en vivo.
guia-n8n/            Workflows importables (principal, seguimiento, booking-webhook) + guía
                     paso a paso + SQL para la BD de Tania.
```

## Flujo de trabajo

1. **Editar** una sección de `core/` o una variante (nunca `dist/`).
2. **Compilar**: `node prompts/tania/build/build-tania-v4.mjs` (o `--check` para validar sin escribir). El build valida secciones completas, placeholders sin resolver y formato de URLs.
3. **Regresión**: `ANTHROPIC_API_KEY=… node prompts/tania/fixtures/run-regression.mjs` (fixtures reales; `--only <id>` para uno; `--dry` para inspeccionar requests).
4. **Revisar el diff** de `dist/` (git diff — no confiar a ojo).
5. **Desplegar**: pegar el `system` del `dist/tania-v4-<variante>.system.json` en el nodo HTTP del workflow correspondiente (ver `guia-n8n/cambios-n8n-v4.md`).

## Decisiones de diseño (no romper sin releer el plan)

- **El core NO lleva URLs**: los enlaces viven en el frontmatter de cada variante y el build los inyecta como `<enlaces_de_esta_fuente>` en `system[1]`. Así el core es byte-idéntico entre fuentes y comparte caché (breakpoint 1) entre TODOS los leads.
- **3 breakpoints de caché** (`ephemeral ttl 1h`): core, variante y último bloque del penúltimo turno del historial (este último lo añade el nodo compose de n8n, no el build).
- **El estado va en el turno, no en el system**: `<estado_conversacion>` (etapa + foco + slots confirmados + link/reserva) se inyecta como primer bloque del último turno user. Meterlo en system invalidaría la caché del historial en cada turno.
- **`thinking: {"type":"disabled"}` explícito** — en Sonnet 5, omitir el campo activa adaptive. Si algún día se quiere razonamiento: `adaptive` + `output_config.effort: low`, nunca omitir sin más.
- **El contrato de salida es el tool schema** (`tools/responder_lead.schema.json`), con `tool_choice` forzado. Cambiarlo = cambiar también el nodo parse de n8n y los fixtures. `strict: true` exige todos los campos (los no confirmados van a `null`); los topes de burbujas (1-3, ≤200 chars) se refuerzan en prompt + clamp en n8n (strict no soporta esas constraints).
- **Historial limpio**: `n8n_chat_histories` guarda solo texto (human = lead, ai = burbujas unidas con `\n\n`). El compose limpia los turnos v3 antiguos y descarta las notas "Le hemos hecho al usuario…".
- Tamaño actual del prefijo: core ~39,5k chars + variante ~1,7k (~10-11k tokens, todo cacheado; lectura de caché ≈ $0,002/turno con precio intro). Si se recorta, empezar por exemplars redundantes, nunca por la capa de dirección.

## Qué NO hacer

- No editar `dist/` a mano (lo pisa el build).
- No añadir URLs, teléfonos ni literales de negocio dentro de `core/` — van en la variante.
- No tocar `tools/responder_lead.schema.json` sin actualizar n8n (nodo parse) + fixtures a la vez.
- No aplicar `guia-n8n/sql/` con el MCP supabase-fyzon: es la BD de TANIA, no la del SaaS.
- No desplegar sin pasar la regresión y el diff de dist.

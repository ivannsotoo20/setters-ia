# SOP — Cargar un `coach_v5` desde su `.md` a producción

**Origen:** 2026-09-12. La v22 del coach de Tania se cargó bien, pero la regresión en el
simulador enseñó dos cosas que a ojo no se veían: el cierre de fuera de zona explicaba el
motivo ("por zona no puedo llevar tu caso") y un "sí" a secas a la validación del tiempo se
repreguntaba dos veces. Hicieron falta la v23 y la v24 el mismo día. Sin la batería, ambas
habrían salido a producción.

## Trigger

Cualquier cambio en `prompts/source/coach-v5/<slug>.md` que tenga que llegar al tenant
(ronda de feedback, corrección de un caso real, ajuste de voz). Vale también para un coach
nuevo ya cargado por seed que después se edita.

## Pasos

1. **Diagnóstico antes de editar.** Si el cambio nace de un caso real, tener la conversación
   localizada en la BD (ver `queja-produccion-setter.md`) y saber qué regla no prendió o no
   existía. El ejemplar ❌→✅ del bloque sale de ahí, con los literales reales.
2. **Editar el `.md`, no la BD.** Marcos y ejemplos, una regla en un sitio, y pasada adversarial
   antes de cargar: buscar en el bloque las listas de "qué NO descualifica jamás", "ante la
   duda…" y los "nunca" que puedan contradecir lo nuevo. El 12-09 la regla nueva del tiempo
   chocaba con el "no sé" de `coach_qualification_special` y el modelo obedeció a la lista.
3. **Nota fechada en el frontmatter** (`notes:`) con qué cambia y por qué. El frontmatter no
   viaja a la BD; el body sí, recortado con `trim()`.
4. **md5 del bloque actual en BD**, para no pisar una edición que no conoces:
   ```sql
   SELECT id, md5(content), length(content)
   FROM prompt_blocks WHERE tenant_id = <X> AND block_key = 'coach_v5' AND is_active;
   ```
   Y la última versión: `SELECT max(version_number) FROM prompt_block_versions WHERE prompt_block_id = <id>;`
5. **Cargar con el script**, que hace UPDATE + snapshot y verifica por md5:
   ```bash
   node scripts/load-coach-v5-version.mjs --tenant <X> --file prompts/source/coach-v5/<slug>.md --version <N+1> --expect-md5 <md5 del paso 4> --summary "<qué cambia>"
   ```
   Aborta si el md5 de la BD no es el esperado o si la última versión no es N. Nunca
   `UPDATE prompt_blocks` a mano: sin snapshot no hay rollback.
6. **Regresión en el simulador de producción** (`POST /internal/simulate`, gasta la clave del
   tenant, ~0,03 $ por turno). Batería en `.tmp/sim-tests/bateria-<vN>.mjs` (gitignored):
   copiar la anterior y añadir el escenario real que motivó el cambio con los mensajes
   literales de la persona. Primero `--solo <escenario>`, después la batería entera. Si un
   escenario falla: corregir el `.md`, cargar N+2 con este mismo SOP y repetir ese escenario;
   al final, una pasada completa sobre la versión definitiva.
   Qué se mira en cada transcripción: la decisión (fase, `disqualified`/`handoff`), que el
   literal salga tal cual cuando el bloque dice "tal cual", y que ninguna regla nueva haya
   despertado una vieja.
7. **Commit** del `.md` y de `docs/knowledge/` con la versión y el resultado de la batería en
   el mensaje. Push cuando Iván lo diga.
8. **Rollback** si hace falta:
   ```sql
   UPDATE prompt_blocks SET content = (SELECT content FROM prompt_block_versions
     WHERE prompt_block_id = <id> AND version_number = <N>) WHERE id = <id>;
   ```

## Output esperado

`md5(prompt_blocks.content)` igual al del body del `.md`, snapshot `v<N+1>` en
`prompt_block_versions`, batería en verde en la versión definitiva, commit con el número.

## Errores que evita

- Editar la BD sin snapshot (se pierde el rollback y el `pnpm core:build-seed` no aplica aquí,
  pero un `build-coach-v5-seed.mjs` posterior sí pisaría lo que no esté en el `.md`).
- Cargar sin regresión: los dos fallos de la v22 solo se vieron en el simulador.
- Pegar 40 KB de markdown en una query del MCP con las comillas a mano.
- Una pregunta de validación que lleva el "sí" dentro ("¿aunque fuera leve?"): el modelo copia
  lo que el bloque demuestra, así que el ejemplar ❌ tiene que estar escrito.

## Próxima revisión

Cuando `/admin/cerebro` cargue desde el `.md` o cuando la batería del simulador entre al repo.

## Relacionado

- `prompts/coach-engineering/README.md` (doctrina, checklist de auditoría, formato SaaS).
- `CLAUDE.md` → "Editar prompts — Cerebro v5 (consolidado, 4 capas)".
- Memorias: `feedback_coach_parada_se_comprueba_antes_de_enviar`,
  `feedback_coach_ronda_verificacion_adversarial`, `feedback_coach_regla_sin_corpus_no_prende`.

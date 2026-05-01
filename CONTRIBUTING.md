# Contributing — Fyzon Setters IA

> Convenciones operativas. Léelo antes de tocar código nuevo. Si no estás seguro de algo, pregunta a Ivan antes de crear ruido.

---

## 1. Reglas duras (no negociables)

1. **Core v3 NUNCA se edita directo en Supabase**. Workflow obligatorio en sección 4.
2. **`SUPABASE_SERVICE_ROLE_KEY` jamás en el panel ni en browser**. Solo `apps/motor-agente`. Romper esto rompe RLS de todos los tenants.
3. **Cualquier nuevo `package.json` workspace requiere autorización de Ivan**. No inventar packages.
4. **Si Fastify ya está, no añadir Express** (ni similar). Una sola librería por responsabilidad.
5. **No introducir Prisma al motor sin conversación previa**. Hoy `@supabase/supabase-js` con service_role.
6. **No commits sin que Ivan los pida**. Preparamos cambios, Ivan revisa, Ivan aprueba.
7. **Nunca skippear hooks** (`--no-verify`, `--no-gpg-sign`). Si un hook falla, arreglar la causa.
8. **Fixtures C1/C2/C3 son regresión obligatoria** una vez existan (G6 pendiente).

---

## 2. Convenciones de commits — Conventional Commits en inglés

Formato:

```
<type>(<scope opcional>): <descripción imperativa, minúscula, sin punto final>

[body opcional explicando el "por qué", no el "qué"]

[footer opcional con BREAKING CHANGE: o referencias issues]
```

**Types** que usamos:

| Type | Cuándo |
|---|---|
| `feat` | Funcionalidad nueva |
| `fix` | Bug fix |
| `refactor` | Cambio de código sin alterar comportamiento ni añadir features |
| `perf` | Mejora de performance |
| `test` | Solo añadir/cambiar tests |
| `docs` | Solo documentación (README, ONBOARDING, comentarios) |
| `chore` | Tareas de mantenimiento sin afectar src (deps, configs, scripts internos) |
| `build` | Cambios en build system, Docker, Turborepo |
| `ci` | Cambios en pipelines CI/CD |
| `style` | Solo formato (whitespace, comas), nada funcional |

**Scopes** habituales:

`motor`, `panel`, `composer`, `pipeline`, `validator`, `channel-adapters`, `db`, `core-v3`, `coach`, `schema`, `docker`, `ci`, `infra`.

**Ejemplos buenos**:

```
feat(panel): add magic link auth scaffold with @supabase/ssr

Implements middleware-based session refresh, /login + /signup pages with
useActionState, /auth/callback exchange, and a protected /dashboard
placeholder. Closes Hito 9.1 of phase 2.
```

```
fix(motor): pass origin_trigger to runGenerator from webhook

Previously, the inbound vs outbound distinction was lost between webhook
and pipeline. Generator now receives origin_trigger as part of the
context block, fixing the fast-track detection edge case (D25 follow-up).
```

```
refactor(composer): extract two-point cache strategy as separate function

No behavior change. Makes it easier to test alternate strategies
(single-point, none) in isolation.
```

**Ejemplos malos** (no hacer):

```
update                                     ← no dice nada
fixes                                      ← qué fix?
WIP                                        ← nunca commit WIPs a main
feat: cosas varias del panel               ← varios cambios en un commit
fix(motor): Arreglo el bug del webhook.    ← punto final + español + capital
```

---

## 3. Branch model

- **`main`** — siempre verde (typecheck + tests + lint pasan). Es la rama protegida.
- **`feat/<short-name>`** — feature branches creadas desde `main`, mergedadas vía PR.
- **`fix/<short-name>`** — hot fixes. Mismo flujo que `feat`.
- **`chore/<short-name>`** — tareas de mantenimiento.
- **`hito-<n>/<short-name>`** — para trabajos de un hito completo (e.g. `hito-9/panel-auth`).

Workflow:

```bash
git checkout main
git pull origin main
git checkout -b feat/onboarding-wizard
# ... trabajo ...
pnpm typecheck && pnpm test       # antes de commit
git add <archivos-específicos>     # nunca git add -A en este repo
git commit -m "feat(panel): wizard step 1 tenant form"
git push -u origin feat/onboarding-wizard
gh pr create                       # o desde GitHub UI
```

PR debe pasar:
- ✅ `pnpm typecheck` (todos los paquetes)
- ✅ `pnpm test` (todos los paquetes)
- ✅ Code review de Ivan u otro collaborador
- ✅ Si toca pipeline o coach → regresión C1/C2/C3 (cuando exista)

Squash merge por defecto (un PR = un commit en main, mensaje con el formato Conventional).

---

## 4. Workflow Core v3 — la regla más importante

El Core v3 es el activo intelectual más valioso del proyecto. Vive en Supabase pero **se edita siempre desde el `.md` fuente**. Razones:

1. Trazabilidad: cada cambio en git diff.
2. Reproducibilidad: cualquiera puede regenerar el seed.
3. Reversibilidad: revertir el `.md` y regenerar restaura la DB.
4. Code review: el diff se ve en el PR, no en una pestaña perdida del Supabase dashboard.

### Fuentes canónicas

| Archivo | Contiene |
|---|---|
| `prompts/source/core-v3/01-plantilla-base-v2.md` | Core base: `<module_hierarchy>`, `<role_and_objective>`, `<mental_model>`, `<identity_and_tone>`, `<core_principles>`, `<message_types>`, `<phase_architecture>`, `<critical_rules>` (11 reglas), `<pre_message_checks>` (9 checks), `<final_instruction>` |
| `prompts/source/core-v3/02-fases-setting.md` | Fases 1-6 + Bloque 9 Hand-off + Bloque 8 Pipeline GHL + protocolo cualificación |
| `prompts/source/core-v3/03-bloque-7-ram.md` | Bloque 7 RAM completo (Reconocer + Anotar + Mover, escalado precio, objeciones canónicas, creencias limitantes, FAQs técnicas) |

### Los 5 pasos (obligatorios, en orden)

1. **Editar el `.md` fuente correspondiente** en `prompts/source/core-v3/`.
   - Conserva la estructura de headers (`# Fase N`, `# Protocolo hand_off`, etc.) — el script los usa para dividir.
   - Markdown limpio, sin backslash escapes.

2. **Regenerar el SQL**:

   ```bash
   node scripts/build-core-v3-seed.mjs
   ```

   Output: `schema/v1/seeds/002-core-v3-blocks.sql` regenerado con tabla de tamaños por bloque en consola. Si un bloque cambia de tamaño inesperadamente, investiga antes de aplicar.

3. **Revisar el diff**:

   ```bash
   git diff schema/v1/seeds/002-core-v3-blocks.sql
   ```

   Confirma que solo cambió lo esperado.

4. **Aplicar en Supabase via MCP** (con Claude Code en local):

   ```
   "Lee el archivo schema/v1/seeds/002-core-v3-blocks.sql y aplícalo
   en el Supabase conectado vía MCP supabase-fyzon usando apply_migration.
   Devuelve el output de la verificación final."
   ```

   El seed es **idempotente**: hace `DELETE WHERE version=1` antes del INSERT, así que puedes ejecutarlo n veces sin duplicar.

5. **Validar** con el SELECT que devuelve el propio seed: 11 filas, `tenant_id IS NULL`, los `chars` deben coincidir con los que el script reporta en consola.

### Rollback si algo sale mal

```bash
git checkout HEAD~1 -- prompts/source/core-v3/01-plantilla-base-v2.md
node scripts/build-core-v3-seed.mjs
# aplicar de nuevo via MCP — idempotencia garantiza restauración
```

Si el motor en prod ya respondió a leads con un Core v3 roto, revisa `conversation_messages` de los últimos minutos para detectar daño.

### Coach v3 (por trainer) — mismo patrón

```bash
# Editar prompts/source/coach-v3/<trainer>.md
node scripts/build-coach-seed.mjs --trainer <trainer-slug> --tenant-slug <tenant-slug>
git diff schema/v1/seeds/<NNN>-coach-<trainer>.sql
# Aplicar via MCP
```

El coach es por tenant, no compartido. `block_key='coach_v3'`, `sort_order=5`, `version=1`. Idempotente por (`tenant_id`, `block_key`, `version`).

---

## 5. Estructura de PRs grandes

Para hitos enteros (e.g. "Hito 9.2 — wizard onboarding"):

1. Crea un `hito-<n>/<short-name>` branch.
2. Divide en commits semánticos pequeños (1 commit = 1 cambio coherente).
3. Cada commit debe dejar la rama en estado verde (typecheck + tests).
4. Al final, abre 1 PR con todos los commits. Squash NO en este caso — preserva la historia. Usa **rebase merge** o **merge commit**.
5. El PR description debe incluir:
   - Qué hito cubre + referencia a [ROADMAP.md](ROADMAP.md).
   - Lista de archivos nuevos/modificados con 1 línea de qué hace cada uno.
   - Tests añadidos.
   - Notas para el reviewer (decisiones tomadas, alternativas descartadas).
   - Si afecta a `migrations/` o `seeds/`, instrucciones de migración.

---

## 6. Tests

- **Unit**: vitest. Files al lado del código (`src/x.ts` + `test/x.test.ts` o `src/x.test.ts`).
- **Mocks**: usar `vi.fn()` y mocks fuertemente tipados. Para Anthropic, mock del SDK con respuestas tool_use realistas.
- **Redis**: usar `ioredis-mock` (ya está en `apps/motor-agente`).
- **Supabase**: para tests de unidad, mock del cliente. Para integración, conectar a un Supabase de test (no el de prod).
- **Anthropic real**: solo en CLIs `run-pipeline`, `run-generator`. Nunca en CI sin marcar como opt-in (coste).

Cobertura: no hay objetivo numérico arbitrario, pero cualquier feature nueva debe llevar tests de su lógica core.

Comandos:

```bash
pnpm test                                          # todos
pnpm --filter @fyzon/agent-pipeline test           # solo uno
pnpm --filter @fyzon/agent-pipeline test --watch   # watch mode
```

---

## 7. Manejo de migraciones

- Cada cambio de schema → archivo SQL nuevo en `schema/v1/migrations/NNN-descripcion.sql`. NUNCA modificar migrations existentes.
- Después de aplicar la migration → regenerar tipos:

  ```bash
  pnpm db:generate-types
  ```

- Commit incluye:
  1. La migration nueva.
  2. `packages/db/src/types.generated.ts` actualizado.
  3. Cualquier seed que se vea afectado.

---

## 8. Code review checklist

Cuando revisas un PR, verifica:

- [ ] Conventional commits bien escritos (en inglés, imperativo, sin punto final).
- [ ] Typecheck verde (`pnpm typecheck`).
- [ ] Tests verde (`pnpm test`).
- [ ] No hay `console.log` colgado.
- [ ] No hay `any` injustificado.
- [ ] No se filtran credenciales (revisa imports y constantes).
- [ ] Si toca prompt → ha pasado por el workflow Core v3 / coach (no edita Supabase directo).
- [ ] Si toca pipeline o coach → tests reales corridos contra Anthropic (anota coste en el PR).
- [ ] Si añade env var nueva → actualiza `.env.example` + `apps/motor-agente/src/config/env.ts`.
- [ ] Si añade dependencia → justifica en el PR description (por qué no algo del stack actual).

---

## 9. Cómo se documenta una decisión nueva (D30+)

Cuando tomes una decisión arquitectónica que afecte al proyecto a largo plazo:

1. Añade entrada en `ROADMAP.md` sección "Decisiones arquitectónicas (D1-D29)" con número siguiente disponible y formato:
   ```markdown
   | D30 | YYYY-MM-DD | Resumen de la decisión + rationale + impacto. |
   ```

2. Si Ivan está en sesión Claude Code, también se anota en la memoria del proyecto (`~/.claude/projects/...`).

3. Si la decisión cambia stack/arquitectura: PR aparte con título `chore(arch): D30 — <decisión>` actualizando `ROADMAP.md`.

---

## 10. Comunicación

- **Async**: GitHub PRs + issues. Las decisiones grandes en issues, los detalles en PR comments.
- **Sync**: pregunta a Ivan directamente si te bloqueas más de 30 min con algo. No des vueltas.
- **Idioma**: código + commits + PRs en inglés. Documentación interna y conversaciones con Ivan en español.

---

## 11. Cosas que prohibimos explícitamente

- `git add -A` o `git add .` — nombra los archivos. Evita añadir basura accidentalmente.
- Crear `.md` de "estado del proyecto" o "cómo va" sin que Ivan lo pida — está la memoria + el ROADMAP.
- Bypass de `--no-verify` en commits.
- Hacer push directo a `main` (siempre PR).
- Borrar tests existentes sin razonarlo en el PR.
- Usar n8n para algo nuevo (está en retirada total).
- Cambiar a Webpack desde Turbopack en panel sin razón.

---

## 12. Cuando estás atascado

1. Revisa [ONBOARDING.md](ONBOARDING.md) sección 11 (troubleshooting).
2. Revisa la memoria del proyecto si tienes acceso (`~/.claude/projects/C--Users-sotob-setters-ia/memory/`).
3. Pregunta a Ivan en Telegram/WhatsApp/email — depende del canal que use.

No improvises decisiones de arquitectura.

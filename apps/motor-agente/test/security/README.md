# Security E2E tests

Scripts node de validación empírica de la postura de seguridad. NO son unit
tests (esos viven en `apps/motor-agente/test/*.test.ts` con Vitest). Estos
scripts pegan contra Supabase REST real (anon key) y/o el motor desplegado
(`MOTOR_BASE_URL`) para comprobar que los controles funcionan end-to-end.

## Ejecutar

```bash
# Carga .env.local (NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY).
# Las variables del motor son opcionales si solo quieres probar RLS de Supabase.
node apps/motor-agente/test/security/test-rls-anon-leaks.mjs
node apps/motor-agente/test/security/test-bearer-timing.mjs   # requiere MOTOR_BASE_URL
```

Desde un worktree el script no encuentra `apps/panel/.env.local` (vive en el checkout
principal y está gitignored): exporta las dos variables públicas antes de ejecutarlo.

## Scripts disponibles

| Script | Qué prueba | Requiere |
|---|---|---|
| `test-rls-anon-leaks.mjs` | Tablas con RLS no devuelven datos a anon key; con un JWT de usuario, que la sesión NO puede escribir `tenant_configs` / `prompt_blocks` / `resources` (migration 086) ni las columnas de privilegio de `profiles` (migration 088) | NEXT_PUBLIC_SUPABASE_URL + ANON_KEY (+ `RLS_TEST_USER_JWT` opcional) |
| `test-bearer-timing.mjs` | Bearer timing-safe en `/internal/*` | MOTOR_BASE_URL + INTERNAL_STATS_TOKEN |
| `test-dev-login-blocked.mjs` | `/api/dev-login` 404 fuera de dev local | PANEL_BASE_URL |

## Output esperado

```
=== RLS Anon Leaks Test ===
  OK pipeline_runs: HTTP 401, rows=n/a
  OK automation_keywords: HTTP 401, rows=n/a
  ...
=== RPC Functions Denied to Anon ===
  OK rpc/provision_tenant: HTTP 404
=== Authenticated Write Probes (migration 086) ===
  - SKIP: sin RLS_TEST_USER_JWT ...        (o las sondas OK si se pasó un JWT)
Result: N pass, 0 fail
```

El `HTTP 401` de anon es correcto: `anon` tiene revocado el EXECUTE sobre
`tenant_id_for_user()`, así que PostgREST responde `42501 permission denied for
function` antes de evaluar la policy. Cualquier fila que devuelva DATOS desde anon es
un leak crítico.

## Sondas de escritura con sesión de usuario (migration 086)

Hasta la 086, `tenant_configs`, `prompt_blocks` y `resources` tenían una única policy
`FOR ALL USING (tenant_id = tenant_id_for_user())` sin `WITH CHECK`: cualquier miembro
autenticado del tenant (viewer incluido) podía hacer `PATCH` desde el navegador con la
anon key y su JWT. La 086 deja solo SELECT para la sesión; la escritura es de
`service_role` (server actions, motor, scripts).

El script ejecuta las sondas si recibe un JWT:

```bash
# Opción A: JWT ya obtenido (access_token de un usuario de PRUEBA, idealmente viewer)
RLS_TEST_USER_JWT=eyJ... node apps/motor-agente/test/security/test-rls-anon-leaks.mjs

# Opción B: el script hace el sign-in
RLS_TEST_USER_EMAIL=viewer@test.local RLS_TEST_USER_PASSWORD=... \
  node apps/motor-agente/test/security/test-rls-anon-leaks.mjs
```

**Por qué las sondas no escriben nunca.** Cada `UPDATE` pone a NULL una columna
`NOT NULL` (`tenant_configs.timezone`, `prompt_blocks.content`) y cada `INSERT` omite
columnas `NOT NULL`. PostgreSQL evalúa la policy `WITH CHECK` **antes** que las
constraints, de modo que la respuesta distingue los tres casos sin tocar datos:

| Respuesta de PostgREST | Significa | Veredicto |
|---|---|---|
| `code 42501` (new row violates row-level security) | la policy denegó | OK (cerrado) |
| `HTTP 204` o `[]` en un UPDATE | la policy ocultó la fila | OK (cerrado) |
| `code 23502` / `23514` / `23505` | la policy **dejó pasar** y solo la paró la constraint | **FAIL** (abierto, estado pre-086) |
| filas devueltas | se escribió de verdad | **FAIL** ruidoso (no debería ser posible) |

No hay sonda `DELETE`: un `DELETE` que la policy permita borra de verdad.

### A mano con curl

```bash
URL=https://ppujrqxiizgfqclbuxet.supabase.co
ANON=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# 1. Token de un usuario de prueba (viewer de un tenant)
JWT=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"viewer@test.local","password":"..."}' | jq -r .access_token)

# 2. Su tenant
curl -s "$URL/rest/v1/profiles?select=tenant_id,role,is_agency_admin" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT"

# 3. UPDATE tenant_configs (TID = su tenant_id). Pre-086: 400 code 23502. Post-086: 200 [] o 204.
curl -s -X PATCH "$URL/rest/v1/tenant_configs?tenant_id=eq.$TID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"timezone": null}'

# 4. UPDATE del coach propio. Pre-086: 23502. Post-086: [] / 204.
curl -s -X PATCH "$URL/rest/v1/prompt_blocks?tenant_id=eq.$TID&block_key=eq.coach_v5" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"content": null}'

# 5. UPDATE de un bloque compartido. Antes y después: [] / 204 (nunca 23502).
curl -s -X PATCH "$URL/rest/v1/prompt_blocks?tenant_id=is.null&block_key=eq.core_v5_base" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"content": null}'

# 6. INSERT. Pre-086: 400 code 23502 (o 23505 en tenant_configs). Post-086: 403 code 42501.
curl -s -X POST "$URL/rest/v1/tenant_configs" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -d "{\"tenant_id\": $TID, \"timezone\": null}"
curl -s -X POST "$URL/rest/v1/prompt_blocks" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -d "{\"tenant_id\": $TID, \"content\": null}"
curl -s -X POST "$URL/rest/v1/resources" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" -d "{\"tenant_id\": $TID, \"name\": null}"

# 7. La lectura propia tiene que seguir funcionando (no romper el panel)
curl -s "$URL/rest/v1/tenant_configs?select=tenant_id,ai_enabled&tenant_id=eq.$TID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JWT"
```

### profiles (migration 088)

Hasta la 088, `profiles` tenía la misma policy `FOR ALL` sin `WITH CHECK` y `authenticated`
podía hacer UPDATE de **todas** sus columnas: cualquier usuario podía ponerse
`is_agency_admin = true` o cambiar el `role` de un compañero. La 088 deja la lectura
tenant-wide (más agency admin), el UPDATE solo de la propia fila y solo sobre
`full_name`, `phone`, `bio`, `avatar_url` (GRANT por columna); el resto es service_role.

Las sondas del script sobre `profiles` siguen la misma lógica (nunca escriben):

| Sonda | Pre-088 | Post-088 |
|---|---|---|
| `PATCH profiles?id=eq.<yo> {"is_agency_admin": null}` | `23502` → **FAIL** (la policy dejó pasar) | `42501` permission denied for table profiles → OK |
| `PATCH profiles?id=eq.<yo> {"role": null}` | `23502` → **FAIL** | `42501` → OK |
| `PATCH profiles?id=eq.<compañero> {"is_agency_admin": null}` | `23502` → **FAIL** | `[]` / 204 (la policy oculta la fila) → OK |

```bash
# A mano (JWT y TID como en la sección anterior; SUB = uuid del usuario, sale en el JWT)
curl -s -X PATCH "$URL/rest/v1/profiles?id=eq.$SUB"   -H "apikey: $ANON" -H "Authorization: Bearer $JWT"   -H "Content-Type: application/json" -H "Prefer: return=representation"   -d '{"is_agency_admin": null}'
```

Que la edición legítima del perfil sigue viva se comprueba en el panel (`/settings/profile`:
nombre, bio, teléfono, avatar) o en SQL:

```sql
SELECT has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE')        AS can_edit_name,   -- true
       has_column_privilege('authenticated', 'public.profiles', 'is_agency_admin', 'UPDATE')  AS can_promote;     -- false
```

Y en SQL, el estado de las policies tras aplicar la 086 y la 088:

```sql
SELECT tablename, policyname, cmd, permissive, with_check IS NOT NULL AS has_with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('tenant_configs', 'prompt_blocks', 'resources', 'profiles')
ORDER BY tablename, policyname;
```

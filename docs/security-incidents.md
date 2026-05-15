# Security incidents playbook

> Última actualización: 2026-05-15.

Procedimiento para responder a incidentes de seguridad. Cada sección: cuándo aplica, pasos inmediatos, forense, comunicación.

## 1. Tenant token leak (URL webhook expuesta)

**Síntomas**: webhooks falsos llegan al motor con un tenant_token válido. Logs muestran routeGhlInbound / routeManyChatInbound creando leads no esperados. O un trainer reporta que recibió mensajes que no envió.

**Pasos inmediatos** (en orden):

1. **Bloquear token afectado**: `UPDATE tenant_tokens SET is_active = false, revoked_at = now() WHERE token = '<TOKEN>' RETURNING tenant_id, purpose;`
2. **Generar token nuevo**: panel /admin/tenants/[id] -> tab Tokens -> "Rotar token <purpose>".
3. **Reconfigurar webhooks externos**:
   - GHL Workflow: actualizar la URL del webhook step.
   - ManyChat: actualizar URL en la automation que llama al motor.
   - n8n / Tally / Lead form: actualizar URL en la integration.
4. **Smoke test**: enviar un webhook real -> verificar integration_accounts.last_webhook_at se actualiza.

**Forense**:

```sql
-- Webhooks recibidos con el token comprometido en últimas 72h
SELECT * FROM tenant_audit_log
WHERE tenant_id = <ID>
  AND occurred_at > now() - INTERVAL '72 hours'
ORDER BY occurred_at DESC;

-- Pipeline runs sospechosos (volumen anormal)
SELECT date_trunc('hour', started_at) AS bucket, count(*)
FROM pipeline_runs
WHERE tenant_id = <ID> AND started_at > now() - INTERVAL '72 hours'
GROUP BY 1 ORDER BY 1 DESC;

-- Leads creados en esa ventana (potencialmente falsos)
SELECT id, phone, source, first_message_at FROM leads
WHERE tenant_id = <ID> AND created_at > '<TIMESTAMP_INCIDENT>'
ORDER BY created_at DESC;
```

**Comunicación**: notificar al trainer afectado + Iván. Estimar impacto en costes LLM ($) y volumen de mensajes.

## 2. SUPABASE_SERVICE_ROLE_KEY leaked

**Síntomas**: el service_role key aparece en un commit público, en un screenshot, en logs externos, en bundle del panel browser.

**Pasos inmediatos**:

1. **Rotar service_role key**: Supabase Dashboard -> Project Settings -> API -> "Reset service_role secret". GENERA UN KEY NUEVO.
2. **Actualizar .env.local** en motor (Contabo) + panel (Vercel).
3. **Restart motor**: docker compose restart motor o pm2 restart motor.
4. **Redeploy panel**: vercel deploy --prod.

**Forense**: revisar pg_stat_statements para detectar queries inusuales con service_role en últimas 24-48h.

**Comunicación**: si la key estuvo expuesta >1h, asumir compromiso total. Considerar rotar tokens de webhook de todos los tenants también.

## 3. CREDENTIALS_ENCRYPTION_KEY perdida

**Síntomas**: el motor arranca con CryptoError: CREDENTIALS_ENCRYPTION_KEY is not set o las credenciales descifradas fallan con authentication failed.

**Pasos inmediatos**:

1. **NO rotar la key** hasta saber qué pasó. Si la key se perdió, **no hay forma de descifrar los blobs existentes**.
2. **Recuperar de backup**: password manager personal + cualquier .env.backup del VPS.
3. Si la key ES irrecuperable:
   a. Cada trainer debe **reintroducir su API key** (YCloud, ManyChat, GHL OAuth tokens) via panel /settings/integrations.
   b. Los blobs credentials_encrypted antiguos se sobrescriben con la nueva key.
4. Documentar el incidente y reforzar backup procedure.

## 4. RLS bypass detectado (data leak cross-tenant)

**Síntomas**: trainer del tenant A reporta ver datos del tenant B en su panel. O un SELECT con anon devuelve filas no autorizadas.

**Pasos inmediatos**:

1. **Deshabilitar acceso a la tabla**: `REVOKE ALL ON public.<tabla> FROM anon, authenticated;` (motor sigue funcionando con service_role).
2. **Reproducir**: ejecutar query del trainer con su user_id vía MCP execute_sql con `SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claims" = '{"sub":"<user-uuid>"}';`.
3. **Investigar policy**: `SELECT * FROM pg_policies WHERE tablename = '<tabla>';` -> identificar qué condición falla.
4. **Patch policy** y aplicar migration.
5. **Re-habilitar GRANTs** sobre la tabla.
6. **Run apps/motor-agente/test/security/test-rls-anon-leaks.mjs** -> debe pasar 100%.

**Comunicación**: notificar a TODOS los trainers afectados (legalmente obligatorio bajo RGPD si hubo PII expuesta).

## 5. Webhook attack masivo (DDoS-style)

**Síntomas**: motor recibe miles de webhooks/seg, pipeline_runs explota, costes LLM se disparan.

**Pasos inmediatos**:

1. **Cloudflare / proxy**: rate limit en el dominio del motor (setter.fyzon.es) -> 10 req/min por IP.
2. **Pasar *_VERIFY_MODE=enforce** en todos los webhooks (si estaban en warn): rechaza sin firma -> 401 rápido.
3. **Revocar tokens sospechosos** vía tenant_tokens query.
4. **Pause motor**: docker compose stop motor mientras se investiga.

**Forense**: `SELECT date_trunc('minute', started_at), count(*) FROM pipeline_runs WHERE started_at > now() - INTERVAL '1 hour' GROUP BY 1 ORDER BY 1 DESC;` -> identifica los buckets afectados.

**Mitigación a largo plazo**: rate limiting en el motor (@fastify/rate-limit), monitoring con alerta a >100 req/min cross-tenant.

## 6. Phishing del agency admin (Iván)

**Síntomas**: alguien con la sesión de sotobautistaivan@gmail.com accede al panel admin.

**Pasos inmediatos**:

1. **Force sign-out**: supabase.auth.admin.signOut(userId) invalida todas las sesiones del user.
2. **Reset password** via Supabase Dashboard.
3. **Revisar tenant_audit_log últimas 24h**: detectar acciones sospechosas (impersonations, deletes, integration changes, override creations).
4. **Habilitar 2FA** (pendiente — ver checklist).

## Contactos de emergencia

- **Supabase**: support@supabase.com (premium support si está activo)
- **Cloudflare** (proxy frontal): cuenta Fyzon
- **VPS Contabo**: dashboard + serial console access
- **Vercel** (panel hosting): cuenta Fyzon

## Comunicación con cliente afectado (template)

```
Hola [Nombre],

Te escribo para informarte de un incidente de seguridad que hemos detectado y
ya hemos contenido en tu cuenta Setters IA.

Qué pasó:
[descripción técnica clara, sin jerga]

Qué hemos hecho:
[acciones tomadas]

Qué necesitamos de ti:
[acciones del trainer si aplica — rotar password, revisar logs propios, etc.]

Impacto estimado:
[datos afectados, ventana temporal, coste potencial]

Próximos pasos:
[plan de auditoría + medidas preventivas]

Si tienes preguntas, respóndeme directamente.

Iván Soto · Fyzon
```

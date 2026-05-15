# Seguridad ManyChat webhooks — deuda asumida documentada

> Fecha: 2026-05-15 (Hardening audit security).
> Status: **deuda conocida** — ManyChat NO firma webhooks. Auth única vía token URL.

## Resumen

ManyChat es el proveedor histórico de IG/FB de Pablo (tenant 3). Lo usamos como BSP para recibir mensajes entrantes en `/webhook/manychat/<tenant_token>`. **No firma sus webhooks**: no envía HMAC headers, no incluye timestamp anti-replay.

La única protección actual: el **token aleatorio en URL** (`tenant_tokens.purpose='manychat_webhook'`), opaco y largo. Si el token leakea, el atacante puede:

- Mandar mensajes falsos al pipeline IA del tenant (coste $ + ruido en leads).
- Forzar webhooks que disparen `routeGhlInbound` con payloads inventados.
- NO puede leer datos del tenant (motor procesa el webhook, no lo refleja). Tampoco modifica BD fuera del tenant target.

## Limitaciones

- **No HMAC**: ManyChat no firma. Verificado oficialmente con su soporte 2026-04-21.
- **No anti-replay**: sin timestamp en header, solo dedup Redis por `subscriber_id:timestamp` con TTL 60s.
- **No rotación automática**: el token solo se rota manualmente vía `/admin/tenants/[id]` o reissue del trainer.

## Mitigaciones aplicadas

1. **Token URL largo y aleatorio**: generado con `gen_random_uuid()` PostgreSQL (128 bits entropy).
2. **HTTPS only**: el motor solo escucha por TLS — token no viaja en claro.
3. **Filter por `purpose`**: la query `resolveTenantByToken` exige `purpose='manychat_webhook'` (no permite reusar un token de otro canal aunque coincida).
4. **Dedup Redis**: mensajes repetidos en <60s se descartan.
5. **Banner UI**: `/settings/integrations` muestra warning cuando `provider='manychat'`.
6. **Audit log**: cada uso del token actualiza `integration_accounts.last_webhook_at`.

## Roadmap de cierre

La deuda se cierra cuando suceda **una** de estas migraciones (decisión por tenant):

- **Migración a YCloud**: Pablo deja IG/FB en ManyChat → mueve solo WhatsApp a YCloud. ManyChat sigue activo para IG/FB hasta:
- **GHL como pasarela**: Hito futuro (Fase 6 del plan maestro). GHL gestionará todos los canales y firmará los webhooks con su esquema RSA + HMAC.
- **Meta Cloud directo**: si Iván se convierte en BSP oficial, IG/FB pasan a Meta Cloud que SÍ firma.

Hasta entonces: **mantener el token confidencial** + rotarlo si hay sospecha de leak.

## Procedimiento de rotación de emergencia (si token leak)

1. Panel `/admin/tenants/[id]` → tab "Tokens" → "Rotar token ManyChat".
2. Actualizar la URL del webhook en la cuenta ManyChat del trainer.
3. Verificar primer mensaje real → llega a `integration_accounts.last_webhook_at`.
4. Revisar `pipeline_runs` 24h previas filtrando por `tenant_id` para detectar webhooks falsos.
5. Audit log: `tenant_audit_log` con `action='token.rotated.manychat'`.

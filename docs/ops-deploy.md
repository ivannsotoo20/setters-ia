# Ops: deploy y operación del motor en producción

Runbook de despliegue del `apps/motor-agente` en VPS Contabo con CI/CD por GitHub Actions, Cloudflare Tunnel y Healthchecks.io.

## Topología

```
                                                       ┌──────────────────────────────┐
GHL / YCloud / lead-form                               │   VPS Contabo S Ubuntu 22.04 │
clientes externos                                      │                              │
       │                                               │   ┌──────────────────────┐   │
       │ HTTPS                                         │   │ docker-compose       │   │
       ▼                                               │   │   ├─ redis:7-alpine  │   │
  setter.fyzon.es ◄─── Cloudflare Tunnel ◄────────────►│   │   ├─ motor (Fastify) │   │
       │                                               │   │   └─ cloudflared     │   │
       │                                               │   └──────────────────────┘   │
       │                                               │                              │
   ┌───┴────────┐   bearer auth                        └──────────────────────────────┘
   │ Vercel     │   POST /internal/welcome                              ▲
   │ (panel)    ├──────────────────────────────────────────────────────►│
   └────────────┘                                                       │
                                                                        │
                                       Healthchecks.io ──── pings ──────┘
                                       (uptime + alertas email)
```

- **VPS**: Contabo VPS S (4 vCPU / 8 GB / 200 GB SSD, ~6€/mes). Ubuntu 22.04 LTS.
- **Container registry**: `ghcr.io/ivannsotoo20/setters-ia/motor-agente` (private). Tags: `latest` + `sha-<short>`.
- **CI/CD**: `.github/workflows/deploy-motor.yml` en push a `main`. Build → push GHCR → SSH al VPS → `docker compose pull && up -d` → smoke check.
- **Tunnel**: Cloudflare Zero Trust → tunnel `setter-prod` → public hostname `setter.fyzon.es` → service `http://motor:3001` (DNS interno del compose).
- **Monitoreo**: Healthchecks.io free tier, 2 checks (`/health` cada 5min, `/internal/stats?hours=1` cada 1h con bearer).

## Setup inicial VPS (una sola vez)

### 1. Provisionar VPS Contabo

- Web: https://contabo.com → VPS S SSD → Ubuntu 22.04 → región Frankfurt o Madrid (lo más cercano a usuarios).
- SSH habilitado solo con key (no password). Genera key dedicada para deploy:
  ```bash
  ssh-keygen -t ed25519 -C "fyzon-setter-vps-deploy" -f ~/.ssh/fyzon_vps_deploy
  ```
- Cuando llegue el email con IP + root password, primer login y endurecer:

```bash
ssh root@<vps-ip>

# Cambiar password root inicial
passwd

# Crear user deploy
adduser deploy
usermod -aG sudo deploy

# Copiar pubkey
mkdir -p /home/deploy/.ssh
# Pegar contenido de ~/.ssh/fyzon_vps_deploy.pub
nano /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

# Deshabilitar password auth + root login
nano /etc/ssh/sshd_config
# PasswordAuthentication no
# PermitRootLogin no
systemctl restart sshd

# Firewall (solo SSH desde fuera)
ufw allow 22/tcp
ufw enable

# Auto-updates de seguridad
apt update && apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# Docker + plugin compose
apt install -y docker.io docker-compose-plugin
usermod -aG docker deploy

# Verificar
exit
ssh deploy@<vps-ip>
docker --version
docker compose version
```

### 2. Cloudflare Tunnel

1. **Cloudflare Zero Trust** dashboard → Networks → Tunnels → **Create a tunnel** → connector type "Cloudflared".
2. Nombre: `setter-prod`. Save.
3. Copiar el `TUNNEL_TOKEN` (en la pantalla "Install and run a connector"). Guardar en 1Password.
4. **Public Hostname** → Add:
   - Subdomain: `setter`
   - Domain: `fyzon.es`
   - Service type: `HTTP`
   - URL: `motor:3001`
5. Save. Cloudflare crea automáticamente el record DNS `setter.fyzon.es → tunnel-id.cfargotunnel.com`.
6. (Mantener `setter-dev.fyzon.es` como tunnel separado en el PC de Iván — no se toca).

### 3. Clonar repo en VPS

```bash
ssh deploy@<vps-ip>

sudo mkdir -p /opt/fyzon
sudo chown deploy:deploy /opt/fyzon
git clone https://github.com/ivannsotoo20/setters-ia.git /opt/fyzon
cd /opt/fyzon
```

### 4. Crear `.env.local` desde 1Password

Backup completo del `.env.local` que Iván ya tiene en su PC, MÁS las vars nuevas de prod:

```bash
nano /opt/fyzon/.env.local
```

Variables obligatorias (copiar valores de 1Password):

```
# Identidad / Supabase / Anthropic / Redis
SUPABASE_URL=https://ppujrqxiizgfqclbuxet.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-api03-...
REDIS_URL=redis://redis:6379

# Motor runtime
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# Hardening (32 bytes hex)
CREDENTIALS_ENCRYPTION_KEY=<openssl rand -hex 32>
INTERNAL_STATS_TOKEN=<openssl rand -hex 32>

# Webhook verification (warn al inicio, enforce tras 48h soak — ver sección Hardening)
YCLOUD_WEBHOOK_VERIFY_MODE=warn
LEAD_FORM_VERIFY_MODE=warn
GHL_WEBHOOK_VERIFY_MODE=warn

# YCloud + ManyChat (defaults OK)
YCLOUD_API_BASE=https://api.ycloud.com
MANYCHAT_API_BASE=https://api.manychat.com

# GHL OAuth Marketplace (cuando GHL apruebe la app)
GHL_OAUTH_CLIENT_ID=
GHL_OAUTH_CLIENT_SECRET=
GHL_OAUTH_SHARED_SECRET=
GHL_OAUTH_REDIRECT_URI=https://setter.fyzon.es/integrations/oauth/callback
GHL_OAUTH_SCOPES=contacts.write contacts.readonly conversations.readonly conversations.write conversations/message.readonly conversations/message.write locations.readonly
GHL_API_BASE=https://services.leadconnectorhq.com
GHL_MARKETPLACE_BASE=https://marketplace.gohighlevel.com
GHL_OAUTH_VERSION_ID=
GHL_WEBHOOK_PUBLIC_KEY_PEM=

# Multimodal (Groq)
GROQ_API_KEY=
GROQ_API_BASE=https://api.groq.com/openai/v1
GROQ_AUDIO_MODEL=whisper-large-v3-turbo

# Notificaciones email
RESEND_API_KEY=
RESEND_FROM_EMAIL=alertas@fyzon.es
RESEND_FROM_NAME=Fyzon Setters

# Panel público
PANEL_PUBLIC_URL=https://panel.fyzon.es

# Deploy
IMAGE_TAG=latest
CLOUDFLARED_TUNNEL_TOKEN=eyJ...   # ← copiar de Cloudflare dashboard
```

Permisos restrictivos:

```bash
chmod 600 /opt/fyzon/.env.local
```

**IMPORTANTE**: hacer backup de `.env.local` en 1Password vault personal de Iván INMEDIATAMENTE después de configurarlo. Si pierdes `CREDENTIALS_ENCRYPTION_KEY`, todas las credenciales encriptadas en `integration_accounts` quedan irrecuperables — los trainers tienen que re-OAuth.

### 5. Login a GHCR + primer deploy

```bash
# Crear PAT en GitHub: settings → Developer settings → Personal access tokens → classic
# Scopes: read:packages
docker login ghcr.io -u ivannsotoo20

# Primer pull manual
docker compose pull motor
docker compose up -d

# Verificar containers
docker compose ps
# Esperado: redis healthy, motor up, cloudflared up

# Ver logs
docker compose logs motor --tail=50
docker compose logs cloudflared --tail=20
```

### 6. Verificar accesibilidad

Desde tu laptop (no desde el VPS):

```bash
curl https://setter.fyzon.es/health
# Esperado: {"ok":true,"uptimeSeconds":...,"supabaseReachable":true}

curl -H "Authorization: Bearer $INTERNAL_STATS_TOKEN" \
     'https://setter.fyzon.es/internal/stats?hours=24'
# Esperado: 200 con stats agregadas
```

### 7. Configurar GitHub Secrets para CI/CD

Repo settings → Secrets and variables → Actions → New repository secret:

- `VPS_HOST`: IP pública del VPS Contabo.
- `VPS_USER`: `deploy`.
- `VPS_SSH_KEY`: contenido completo de `~/.ssh/fyzon_vps_deploy` (private key, incluyendo `-----BEGIN OPENSSH PRIVATE KEY-----` y `-----END OPENSSH PRIVATE KEY-----`).

`GITHUB_TOKEN` lo provee el runner automáticamente, no hace falta crear secret.

Próximo push a `main` con cambios en `apps/motor-agente/**`, `packages/**` o `docker-compose.yml` dispara deploy automático.

### 8. Configurar Healthchecks.io

1. https://healthchecks.io/ → Sign up con Google.
2. Add Check:
   - Name: `Setter motor /health`
   - Schedule: `every 5 minutes`. Grace time: `2 minutes`.
   - Notification: email a `sotobautistaivan@gmail.com`.
3. Copiar la "Ping URL".
4. **Cron in-VPS**:
   ```bash
   # crontab -e (como user deploy)
   */5 * * * * curl -fsS --max-time 10 https://setter.fyzon.es/health > /dev/null && curl -fsS https://hc-ping.com/<UUID> > /dev/null
   ```
5. (Opcional) Add Check 2 — ping a `/internal/stats?hours=1` con bearer cada hora desde GitHub Actions scheduled (no desde VPS para no auto-monitorearse a sí mismo).

### 9. Configurar Vercel project panel

Settings → Environment Variables → Production + Preview:

- `MOTOR_INTERNAL_URL=https://setter.fyzon.es`
- `INTERNAL_STATS_TOKEN=<mismo valor que .env.local en VPS>`

Save → redeploy panel desde Vercel UI o `vercel --prod`.

Probar desde panel: ficha contacto WhatsApp → botón "Enviar bienvenida". Debe llegar template real al lead.

## Operación día-a-día

### Deploy normal

`git push origin main` con cambios en motor → GitHub Actions automáticamente:
1. Build Docker multi-stage.
2. Push a GHCR.
3. SSH al VPS → `docker compose pull && up -d motor`.
4. Smoke check `https://setter.fyzon.es/health`.

Tiempo total: ~3-5 min. Si falla cualquier paso, GitHub Action queda en estado red — revisar logs en Actions tab.

### Deploy manual (si falla automático)

```bash
ssh deploy@setter.fyzon.es
cd /opt/fyzon
git pull origin main
IMAGE_TAG=latest docker compose pull motor
IMAGE_TAG=latest docker compose up -d motor
docker compose logs motor --tail=50
```

### Rollback a versión anterior

```bash
ssh deploy@setter.fyzon.es
cd /opt/fyzon
./scripts/rollback.sh sha-1234567
```

Lista de tags disponibles: https://github.com/ivannsotoo20/setters-ia/pkgs/container/setters-ia%2Fmotor-agente

Para encontrar el SHA correcto:
```bash
git log --oneline apps/motor-agente packages/ | head -10
# Tomar el SHA de la versión que quieres restaurar
# (los primeros 7 caracteres) → sha-<short>
```

### Restore VPS desde snapshot Contabo

Contabo crea snapshots semanales (~1€/mes). Restore:
1. Contabo dashboard → tu VPS → Snapshots.
2. Click "Restore" en el snapshot deseado. Confirma.
3. VPS reboot ~5 min. Volverá con todos los containers + .env.local intactos.

Si has perdido el .env.local local en tu laptop pero tienes backup en 1Password:
```bash
ssh deploy@setter.fyzon.es
nano /opt/fyzon/.env.local
# Pegar desde 1Password
chmod 600 /opt/fyzon/.env.local
docker compose up -d
```

### Rotación de tokens

**Quarterly**: rotar `INTERNAL_STATS_TOKEN`:
1. Generar nuevo: `openssl rand -hex 32`.
2. Actualizar en VPS `.env.local` + Vercel env var (mismo valor).
3. `docker compose up -d motor` en VPS (recoge nueva env var).
4. Redeploy panel en Vercel.
5. Actualizar 1Password vault.
6. **Window de incompatibilidad**: ~30s entre el restart motor y el redeploy panel. Aceptable.

**Solo si compromiso**: rotar `CREDENTIALS_ENCRYPTION_KEY`:
1. Generar nueva key: `openssl rand -hex 32`.
2. Mantener key vieja temporalmente como `CREDENTIALS_ENCRYPTION_KEY_OLD` (extender lib/crypto.ts para fallback durante rotación — TODO si pasa).
3. Re-encriptar todos los `integration_accounts.credentials_encrypted` con script `node scripts/encrypt-credentials.mjs --rotate-from <old-key>`.
4. Una vez todos rotados, eliminar `_OLD` y desplegar.

## Hardening: paso `warn` → `enforce`

Soak inicial: 48h en `warn` con grep continuo de logs:

```bash
ssh deploy@setter.fyzon.es
docker compose logs motor --since 48h | grep -E "signature_mismatch|missing_signature"
```

Si **0 warnings legítimos** en 48h consecutivas para un canal:

### YCloud
1. Pre-requisito: sincronizar el `whsec_...` real de panel YCloud al `integration_accounts.webhook_secret` tenant 3 vía MCP `supabase-fyzon.execute_sql` UPDATE.
2. Verificar con SQL que `webhook_secret` empieza por `whsec_` (no es placeholder).
3. Editar `.env.local`: `YCLOUD_WEBHOOK_VERIFY_MODE=enforce`.
4. `docker compose up -d motor`. Downtime ~10s.
5. Watch logs 1h: si llegan 401s legítimos → revertir a `warn`.

### Lead-form
1. Documentar el `X-Form-Secret` en `docs/lead-form-webhook.md` para que Iván lo configure en n8n / GHL Workflow del trainer.
2. Editar `.env.local`: `LEAD_FORM_VERIFY_MODE=enforce`.
3. `docker compose up -d motor`.

### GHL Marketplace
1. Pre-requisito: GHL aprueba la app draft. Iván recibe `Client ID + Secret + Shared Secret + Webhook public key PEM` real.
2. Pegar todo en `.env.local` (`GHL_OAUTH_*`, `GHL_WEBHOOK_PUBLIC_KEY_PEM`).
3. Editar `.env.local`: `GHL_WEBHOOK_VERIFY_MODE=enforce`.
4. `docker compose up -d motor`.
5. Migrar tenants legacy de PIT a OAuth: cada trainer reinstala la app desde Marketplace listing → re-OAuth flow.

## Troubleshooting

### `curl https://setter.fyzon.es/health` falla pero el container está up

1. `ssh deploy@setter.fyzon.es && docker compose ps` → todos healthy?
2. `docker compose logs cloudflared --tail=50` → tunnel conectado?
3. Cloudflare Zero Trust dashboard → Tunnels → estado de `setter-prod`.

### Motor crashea al arrancar

```bash
docker compose logs motor --tail=100
```

Errores típicos:
- `Invalid environment variables` → falta una var obligatoria. Revisar `.env.local` contra `apps/motor-agente/src/config/env.ts`.
- `Cannot connect to Supabase` → `SUPABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY` mal.
- `Redis ECONNREFUSED` → `redis` container no levantó. `docker compose logs redis`.

### Memoria llena en VPS

```bash
docker system df
docker image prune -a
docker volume prune  # ⚠️ elimina volúmenes no usados — verifica antes
```

### Logs muy verbosos

Editar `.env.local`: `LOG_LEVEL=warn` (en vez de `info`). `docker compose up -d motor`.

## Anti-patrones (NO hacer)

- ❌ NO configurar Vercel para hacer pull a este repo (panel en Vercel, motor en VPS).
- ❌ NO cambiar `git pull origin main` por `git reset --hard origin/main` en CI/CD — destructivo si hay pin local.
- ❌ NO desplegar `latest` directamente — siempre vincular `IMAGE_TAG=sha-<X>` para poder rollback.
- ❌ NO commitear `.env.local`. Ya está en `.gitignore`. Verificarlo si modificas el patrón.
- ❌ NO exponer `3001:3001` en `docker-compose.yml` de prod. Solo `expose: 3001` (acceso interno via Docker network). Cloudflared termina TLS y proxea al container.

## Pendientes externos (no bloquean producción IG)

- [ ] GHL Marketplace approval (Iván envía credenciales cuando aprueben).
- [ ] Sincronizar `whsec_...` real YCloud al `integration_accounts.webhook_secret` tenant 3.
- [ ] Configurar las 4 automations en sub-cuenta GHL real de Pablo (ver `docs/ghl-trainer-setup.md`).
- [ ] Aprobar plantilla WA "bienvenida-pablo-v1" en Meta Business Manager via YCloud (operativa Pablo).

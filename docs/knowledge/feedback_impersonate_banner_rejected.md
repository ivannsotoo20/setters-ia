---
name: Banner impersonate sticky descartado
description: Iván ya rechazó el banner sticky de impersonate en Hito 11.1 — no añadirlo de nuevo
type: feedback
---

En Hito 11.1 Iván eliminó explícitamente el banner sticky de "Estás impersonando X" del layout `apps/panel/app/(app)/layout.tsx`. Comentario en código (líneas 105-115) lo documenta.

**Why:** Las dos señales existentes ya cumplen la función: (a) Badge "Vista cliente" del `ScopeSwitcher` en el header, (b) subtítulo "Viendo: <tenant>" del sidebar. El banner añadía ruido visual sin información extra.

**How to apply:** En audits o reviews donde se sugiera añadir banner impersonate, NO proponerlo. Si se detecta un riesgo UX real de confusión (ej. un caso edge donde ambas señales se ocultan), proponer mejorar las señales existentes en lugar de añadir banner.

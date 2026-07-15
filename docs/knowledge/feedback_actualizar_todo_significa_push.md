---
name: "'Actualizar todo' = commit + push"
description: Cuando Iván dice 'actualizar todo' (u otra variante similar) en el contexto de cambios locales ya hechos, espera commit Y push automático sin preguntar.
type: feedback
originSessionId: 7a395ae0-5cf5-4583-810c-c992016d120d
---
Cuando Iván dice "actualizar todo", "actualízalo todo", "súbelo todo" o similar tras una sesión donde hemos hecho cambios locales (commits pendientes o trabajo sin committear), su intención es: **commit + push a origin** en una sola acción.

**Why:** confirmado explícitamente por Iván tras una iteración en la que yo hice solo commit y le pregunté si quería push también. Su respuesta: "cada vez que te menciono actualizar todo en el contexto de que ya hemos hecho actualizaciones en local, eso significa que tienes que hacer el git push también luego, sí". Quería evitar el ida y vuelta de preguntar después del commit.

**How to apply:**
- En este repo (`setters_ia`) cuando Iván cierre una sesión de trabajo con "actualizar todo" / "actualízalo" / "súbelo" → encadena `git add` + `git commit` + `git push origin <branch>` en la misma respuesta.
- Sigue verificando antes de commit: typecheck + tests + revisar que no se cuelan archivos sensibles (.env, credenciales).
- NUNCA force push, NUNCA push a otra rama que no sea la actual sin confirmar.
- Si el push falla (rejected, conflicto remoto), parar y avisar — no resolverlo con fuerza bruta.
- Si la rama es main/master y ha habido cambios muy invasivos (refactor grande, migración, etc.), confirmar una vez más antes de push aunque haya dicho "actualizar todo" — esa es la excepción.

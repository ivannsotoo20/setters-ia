# Training Notes — Mentoría Iván ↔ Claude

## Propósito

Iván Soto (founder Fyzon, setter pro con experiencia real cerrando para entrenadores online) destila aquí su conocimiento de setting en sesiones conversacionales con Claude. Cada sesión cubre un tema (marco mental, lectura del lead, ladder de objeciones, etc.) y produce un archivo `.md` estructurado con principios, reglas accionables y ejemplos.

**Output final del programa**:
1. **Core v3 v2** — versión comprimida y afilada del Core actual (31k chars → ~15k chars), reescrita desde los principios destilados, no por reducción mecánica.
2. **Coach Generator Agent** — script TS que dado un brief de trainer (formulario + transcripción + ejemplos) genera su `coach_v3.md` aplicando los principios universales destilados aquí + las particularidades del trainer.
3. **Evaluation harness** — script que corre escenarios contra el prompt viejo y el nuevo, mide tokens/coste/calidad (judge), publica diff.

**No es** una transcripción literal. Cada nota está editada para tener señal alta y ser citable cuando se construya el Core v3 v2.

## Metodología por sesión

1. Iván abre el tema. Claude hace de **aprendiz**: pregunta como entrevistador clínico, profundiza, pide ejemplos concretos, repite con sus palabras para validar comprensión.
2. Claude escribe la nota en este directorio durante o tras la sesión: principios + reglas + ejemplos + frases reales + preguntas abiertas que quedan para la siguiente.
3. Iván revisa y corrige la nota. Solo se promueve a `status: clean` cuando Iván firma.
4. Tras 5–7 sesiones (o cuando Iván lo decida), Claude hace una **destilación cruzada** de todas las notas → propuesta de Core v3 v2 + plantilla del Coach Generator Agent.

**Cadencia sugerida**: 1 sesión = 60–90 min. Sin prisa. Mejor pocas y profundas que muchas y superficiales.

## Plan tentativo de sesiones

| # | Tema | Estado | Output esperado |
|---|---|---|---|
| S1 | Marco mental — qué es setear (vs vender, vs cerrar, vs cualificar) | pending | Diferenciación con frases textuales de Iván + 5 reglas raíz |
| S2 | Lectura del lead en los primeros 3 mensajes | pending | Señales de cualificación temprana + red flags + green flags accionables |
| S3 | Ladder de objeciones (precio, tiempo, "déjame pensarlo", miedo, "ya lo intenté antes") | pending | Mapa por objeción: detectar, validar, reframear, redirigir. Frases reales. |
| S4 | Cuándo presionar y cuándo soltar | pending | Heurísticas de decisión + ejemplos de cada lado |
| S5 | Persuasión ética — principios que aplicas sin pensar | pending | Lista de principios + patrones de aplicación + qué NO hacer |
| S6 | Cualificación real — red flags / green flags por fase | pending | Criterios D1–D9 reescritos desde la práctica + casos límite |
| S7 | Anatomía del cierre que funciona | pending | Estructura, timing, frases, qué evitar, manejo de "lo pienso" final |
| S8+ | (a definir según vayan saliendo gaps) | — | — |

Las S1–S7 son punto de partida, no contrato cerrado. Si una sesión abre un tema mejor que el siguiente planeado, se reordena.

## Convenciones

- **Numeración**: `NN-slug-corto.md` (ej: `01-marco-mental-setting.md`).
- **Frontmatter** YAML con metadatos. Ver `_template-session.md`.
- **Citas literales de Iván** entre comillas con atribución: `> "..." — Iván`.
- **Reglas accionables**: numeradas, en imperativo, sin ambigüedad. Ej: ❌ "ser empático" → ✅ "antes de rebatir, espejear con `Cuando dices X, ¿qué pasa en ese punto?`".
- **Ejemplos**: incluyen contexto (qué dijo el lead) + respuesta de Iván + por qué funcionó.

## Qué NO va aquí

- Configuración del producto Fyzon (eso es el coach del trainer, no setting universal).
- Detalles de la infraestructura (eso es CLAUDE.md y plan maestro).
- Marketing / captación / qué pasa antes de que llegue el lead al setter.
- Filosofía abstracta sin reglas accionables — solo señal alta.

## Relación con otros artefactos

- **Plan maestro**: `~/.claude/plans/lo-que-te-voy-shimmering-toucan.md` (estrategia macro del SaaS).
- **Plan vigente**: `~/.claude/plans/planifica-como-podemos-seguir-quiet-wigderson.md` (Bloque 0 smoke YCloud → commit → Training Sessions → Hardening).
- **Memoria del proyecto**: `~/.claude/projects/C--Users-sotob-setters-ia/memory/project_saas_setters_ia.md`.
- **Core v3 actual**: `prompts/source/core-v3/{01-plantilla-base-v2.md, 02-fases-setting.md, 03-bloque-7-ram.md}`.
- **Coaches actuales**: `prompts/source/coach-v3/{pablo-montenegro.md, ivan-dev.md}`.
- **Decisión D29**: G6 (fixtures C1/C2/C3) sigue siendo deseable como **test set** del Core v3 v2, NO como input de entrenamiento. Si Iván los pasa, entran al harness de evaluación.

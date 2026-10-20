# SOPs del proyecto Setters IA

Procedimientos operativos específicos de este repo. Nacen de errores reales; cada uno dice
qué error evita. Los SOPs transversales de Fyzon viven en `second_brain/sops/`, no aquí.

| SOP | Cuándo | Error que evita |
|---|---|---|
| [Queja de producción sobre el setter](queja-produccion-setter.md) | Un trainer reporta que el setter hizo algo mal o una métrica no cuadra | Arreglar el prompt cuando el dato ya lo tenía el motor; creer una etiqueta o un KPI sin mirar su definición |
| [Cargar un coach_v5 desde su .md](cargar-coach-v5-desde-md.md) | Cualquier cambio de un `prompts/source/coach-v5/<slug>.md` que tiene que llegar a producción | Editar la BD sin snapshot; dar por bueno un bloque sin pasar la regresión en el simulador |
| [Volcar las citas GHL de un tenant](volcar-citas-ghl-tenant.md) | Alta con calendario vinculado, cuenta PIT, o "las citas no llegan" | Contar enlaces enviados como citas; un tenant PIT sin ninguna cita registrada durante semanas |
| [La IA deja de contestar o Tally avisa de timeouts](ia-muda-o-timeouts-tally.md) | Llega el email de IA muda, un trainer dice que la IA no contesta, Tally manda "timeout of 10000ms exceeded" o aparecen mensajes repetidos | Buscar el fallo en los canales cuando es Redis; dobles respuestas al restaurar; contar la ventana de 24 h desde una copia; tomar la cola de avisos tras restaurar por una caída nueva; reenviar desde Tally lo ya procesado |

Formato de cada SOP: trigger, pasos, output esperado, errores que evita, próxima revisión,
skills y memorias relacionadas.

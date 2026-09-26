# Tania (tenant 7) — ronda del 2026-09-26: zona en lista blanca (Perú y el resto de Latinoamérica fuera)

Queja de Iván: siguen entrando por el formulario de Tally personas de países que Tania no
quiere, por ejemplo Perú, y el setter les abre la conversación y las lleva a llamada. "Ya de
base, tienes que tener muy claro los países que no quería ella."

## El caso y la causa

**Conv 12145** (21-sep): Fernando, +51, abogado, "¿Donde vives actualmente? Peru", hernia
L4-L5 de más de tres años. El formulario lo aprobó ("Zona D, ocupación cualificada") y el
setter le mandó el enlace esa misma madrugada. No llegó a reservar.

No fue un fallo de ejecución: **Perú no estaba vetado en ninguno de los cuatro sitios donde
vivía la zona**, y cada pieza hizo lo que tenía escrito:

1. `ai_criteria` del evaluador del formulario: Perú en una "Zona D — resto de Latinoamérica"
   con filtro económico (un abogado lo pasa).
2. `no_contact_countries` (chat, por prefijo): los 9 de siempre (VE, CU, DO, CO, BO, EC, GT,
   SV, AR). Con +51 el motor le decía al setter *"a efectos de zona cualifica"*.
3. `country_reject_terms` (formulario y menciones del chat): sin Perú.
4. El bloque del coach: enumeraba los 9 y añadía "con el resto se sigue con normalidad".

El documento de criterios que Tania escribió ("CRITERIOS DE NO CUALIFICACIÓN - Forms FB")
tampoco nombra Perú: la "Zona D" la inventamos nosotros al portar su n8n.

**Decisión de Iván (26-sep): LISTA BLANCA.** Se contacta siempre Europa (España incluida),
EEUU, Canadá, Australia y Nueva Zelanda; México y Chile con filtro de trabajo; todo lo demás
no, el resto de Latinoamérica incluido. Puerto Rico, vetado. Una lista negra nunca cubre el
país que nadie pensó en escribir (Haití, Trinidad, Marruecos…).

Mismo patrón, otros casos: conv 11432 (+505 Nicaragua, formulario, "emprendedora", enlace y
reserva). La conv 11800 no es otra fuga: es la misma persona duplicada entre el canal YCloud
y el de GHL, y el calendar-sync le asignó la cita por `ghl_contact_id`.

## Lo que destapó la auditoría (8 agentes, verificación adversarial)

- **La regla de país del formulario nunca ha funcionado.** `country_label_regex`
  ("vives|pais|país") casa antes con la pregunta del WhatsApp ("…incluye prefijo de tu
  **país**…"), que en Tally llega antes que "¿Donde vives actualmente?". 126 formularios, 0
  decididos por país: todo lo decidía la IA. OJO al re-jugar desde la BD: `answers` es JSONB y
  Postgres ordena las claves por longitud, así que ahí "¿Donde vives?" sale primero y la
  réplica engaña (nos pasó en esta misma ronda).
- **El Tier A aprobaba por substring:** "Pandi cundinamarca" → Dinamarca, "Usaquén" → USA,
  "Cañada de Gómez, Argentina" → Canadá (la ñ se normaliza a n). Dormido por el fallo
  anterior; se habría despertado al arreglarlo.
- **reject_by_prefix era un consejo.** Conv 12203 (Instagram, teléfono +57, 23-sep, ya con
  V20): el razonamiento del modelo dice *"Colombia está en lista de exclusión… se aplicará
  como cierre cuando corresponda; de momento sigo el flujo"*. 24 mensajes sin cerrar, porque
  la focal de fase (último bloque, prioridad máxima) le mandaba seguir cualificando. V20
  impidió el enlace, no la conversación.
- **La directiva del formulario prohibía usarlo para cualificar**: "Se usan de UNA forma: si
  ibas a preguntar algo que ya está aquí, cambias de pregunta". En el simulador, con "Peru"
  en el formulario, el setter escribe "abogado en Perú" en su resumen y sigue.
- Fail-open del evaluador sin mirar el prefijo; reenvío del formulario tras un rechazo
  (+52 rechazado el 03-09 como jubilado, aprobado el 05-09 como "Trading", conv 11098 en F6);
  el mapa de prefijos daba +1876 Jamaica como EEUU y +48/+46/+45 como desconocidos.

## Fase 1 — config y bloque (26-sep, sin deploy)

- `tenant_configs.lead_qualification` → `criteria_version` 5: `ai_criteria` en lista blanca
  (texto en `.tmp/zona-2026-09-26/ai_criteria_v5.md`), `no_contact_countries` +PE PY UY HN NI
  CR PA BR PR (18), `country_reject_terms` 59 → 118 (Perú, Nicaragua, Uruguay… sin
  homónimos de España como Trujillo o San José). Copia de la v4 para rollback en
  `.tmp/zona-2026-09-26/lead_qualification_tenant7_backup_2026-09-26.json`.
- `zone_allowlist` cargada (52 ISO siempre, MX y CL con filtro): inerte hasta el deploy de la
  fase 2a.
- coach_v5 v25 → v27 (snapshots en `prompt_block_versions`): filtro 3 en lista blanca, el
  formulario como fuente de residencia declarada, "vivo en / acá en / te escribo desde" fuera
  de zona ya es residencia. **Lección v25→v27:** el ejemplo «vivo en Madrid» que se añadió a
  la excepción del teléfono salió en el simulador como mensaje del setter ("Vivo en Madrid.",
  a una lead de Managua), y la enumeración de países vetados hizo que un cierre empezara por
  "Perú queda fuera de la zona…". Un ejemplo en el bloque es un literal; una lista de nombres
  en el bloque acaba dicha.
- Batería del simulador (`.tmp/sim-tests/bateria-v25.mjs`, ~1,5 $ de la clave de Tania): con
  solo el bloque, México, Chile, "colombiana que vive en Madrid" siguen; Colombia y Venezuela
  cierran tal cual; Lima y Montevideo piden residencia; **Managua sigue**. El modelo no sabe
  de memoria qué ciudad es de qué país ni aplica la zona por sí solo: la decisión tiene que ser
  del código. El simulador no evaluaba la zona por prefijo (no recibía teléfono).

## Fase 2a — código del motor (26-sep, pendiente de deploy)

Implementado por tres agentes en paralelo (formulario / zona del chat / cierre
obligatorio) + revisión adversarial, y ajustado a mano tras la batería local.

- **Una fuente de zona:** `apps/motor-agente/src/lib/zone-config.ts` (lista blanca
  `zone_allowlist`, nombres de país → ISO por palabra completa). La leen el cualificador
  y `zone-policy.ts`. Mapa de prefijos completo (`phone-country.ts`): toda Europa, el
  Caribe del +1 como países propios (+1876 Jamaica ya no es EEUU), resto de LatAm y lo
  más habitual del mundo; un prefijo desconocido con ≥8 dígitos es "fuera".
- **Formulario (`lead-qualifier.ts`, `automation-lead-form.ts`):** lee la residencia y
  no el WhatsApp; aprueba en seco solo con el país escrito tal cual y prefijo de zona;
  rechaza en seco solo si la residencia es entera de fuera y el prefijo también (así
  "Barcelona, soy peruana" +51 va a la IA, que es D1); la IA razona antes de decidir y
  devuelve `pais_iso` obligatorio; **red posterior que solo veta** (país fuera → rechazado);
  si la IA falla, decide el prefijo; reenvío tras un rechazo con los criterios vigentes
  (desde `criteria_updated_at`) → rechazado 30 días; se cualifica cualquier payload con
  respuestas, sea o no Tally.
- **Chat:** veredictos nuevos `prefix_out_residence_in` (D1 determinista: +502 con "En
  Canadá" en el formulario → handoff B) y `reject_by_declaration` ("vivo en / acá en / te
  escribo desde" + término de la lista, sin teléfono → cierra). La directiva del
  formulario deja de decir "se usan de UNA forma": lo declarado cuenta como dicho.
- **Cierre obligatorio (V21, `pipeline.ts`):** focal de cierre (o de paso a la
  entrenadora) en vez de la de fase; con `lead_qualification.zone_close_message` sale el
  literal 8 TAL CUAL (sin Judge ni Splitter) salvo handoff B, y no se repite si ya se
  envió; sin literal, un reintento y si no cierra, IA pausada + aviso a la entrenadora (no
  se reencola cada 30 s, que era un bucle que ya pasaba con V20).
- **Simulador** (`/internal/simulate`): acepta `phone` y evalúa la zona como producción.
  El del panel (`apps/panel/lib/actions/simulate.ts`) todavía no lo envía.
- `pipeline-runs.ts`: los errores del validador se clasificaban como `pipeline_error`
  porque buscaban el literal "V0-V16" (el pipeline lanza "V0-V20" desde el 12-09).

Config cargada en el tenant 7 (inerte hasta el deploy): `zone_allowlist` (52 ISO siempre;
MX, CL con filtro) y `zone_close_message` (el literal 8, idéntico al del bloque: si se
cambia uno, cambiar el otro).

**Batería local con el código sin desplegar** (`.tmp/sim-tests/bateria-fase2a-local.mts`,
se ejecuta copiándolo a `apps/motor-agente/scripts/` por la resolución de módulos; 0,87 $):
Fernando +51 formulario → literal 8 al primer turno; Instagram +57 → literal 8 al primer
turno (antes 24 mensajes); +502 "En Canadá" → handoff B; "vivo en Managua" y "te escribo
desde Lima" → literal 8; +34 Madrid y México contadora siguen. **Falla México "estoy sin
trabajo"**: sigue (fase 2b).

## Pendiente

- **Deploy** (push a `main` → CI del motor): lo decide Iván.
- **Fase 2b, tener el contexto sin preguntar** (Iván, 26-sep: "tienes que hacer de alguna
  manera para tener ese contexto ya para la conversación"; y si falta, "viendo el
  formulario he visto que falta esto"). Datos medidos: Instagram 940 conversaciones, 2 con
  teléfono, 0 con formulario, las 24 que llegaron al enlace sin teléfono; WhatsApp 55, 34
  con formulario. Propuesta a validar: extractor barato (Haiku) que anota país y ocupación
  de lo que ella va contando y lo declara al setter como hecho; cruce del teléfono con
  formularios anteriores; y, si al llegar a la propuesta falta residencia (o trabajo en
  MX/CL), una pregunta anclada a lo que ya se sabe. Estructura nueva: necesita su OK.
- D1 en el chat si ella vuelve a escribir tras el handoff B: se abre conversación nueva en
  F1 sin el formulario y el prefijo la cierra (`lead-ingest.ts:getOrCreateConversation`).
- Tras un cierre por zona (`disqualified` → `stopped`) la IA sigue contestando con
  despedidas; valorar pausar.
- Conv 12145 (Fernando) tiene el enlace: si reserva, lo verá Tania en su agenda.
- Menciones sin contexto que obligan a preguntar residencia en Instagram (Manta, Rosario,
  Lima, Callao…): 0 casos reales en 4.110 mensajes; vigilar.

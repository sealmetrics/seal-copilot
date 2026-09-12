# Auditoría de Seal Copilot 1.11.0 — qué hace, qué no hace, y qué haría falta para ser el mejor del mercado

**Fecha:** 12 septiembre 2026 · **Alcance:** solo lectura del código del plugin (`seal-copilot/`), los evals, los scripts, la documentación y el estado real en `~/.seal-copilot`. No se ha cambiado nada.
**Audiencia de referencia:** un *marketing manager* (decide presupuesto, lee informes, quiere saber qué hacer el lunes) y un *data analyst* (quiere números fiables, reproducibles y exportables).

---

## 1. Veredicto en cinco líneas

1. **El núcleo analítico es de calidad consultora y está por encima de lo que ofrece cualquier asistente de analítica web integrado.** Metodología con umbrales, jerarquía de causas, triangulación, disciplina estadística, tres estados del bot check, y un libro de recomendaciones que se verifica a sí mismo dos semanas después. Nadie más en el mercado verifica sus propias recomendaciones.
2. **La ingeniería alrededor es sólida:** 24 evals contra un mock determinista certificados 3/3, linter de llamadas contra el esquema real del MCP, detector de deriva del esquema, hooks de sesión y presupuesto, export a cinco superficies desde una única fuente. `scripts/check.sh` pasa en verde hoy.
3. **Pero el pilar más repetido del plugin, "valida bots antes de reportar cualquier anomalía", no puede ejecutarse para ningún usuario del conector por defecto.** Desde 1.11.0 el transporte es OAuth remoto, y ese transporte oculta `get_bot_stats` y otras 19 herramientas. Lo mismo le pasa a `install-sealmetrics` completo y a la mitad de `cost-reduction` y `setup-audit`.
4. **Para un marketing manager falta lo que más decide su día:** coste y ROAS, objetivos y ritmo (pacing), un informe que se pueda enviar tal cual (HTML/PDF/Slack), y moneda distinta de €. Para un data analyst falta aritmética determinista (hoy el modelo suma y divide de cabeza), detección de anomalías estadística sobre las series diarias, y exportación de datos.
5. **Lo óptimo no es reescribir sino completar:** cinco correcciones de coherencia (un día), tres nuevas skills de alto valor sin dependencia del MCP (spend ledger, pacing, medición de impacto), un módulo de cálculo determinista, y dos peticiones concretas al equipo del MCP.

---

## 2. Qué hace hoy (inventario verificado)

### 2.1 Catorce skills

| Skill | Qué entrega | Presupuesto | Calidad observada |
|---|---|---|---|
| `seal-copilot` (core) | Responde cualquier pregunta sobre tráfico/campañas/conversiones con la metodología cargada; detecta vertical y carga playbook | ≤4 simple / ≤12 diagnóstico | Muy buena. 16 reglas operativas explícitas; la regla 12 (datos de la cuenta = input no confiable) está a nivel de seguridad de producto |
| `weekly-health-check` | Veredicto ✅/⚠️/🔴, tabla KPI, ≤3 hallazgos, línea "Not checked", seguimiento de recomendaciones vencidas | 8 | Buena. Golden output claro |
| `monday-briefing` | One-pager de ≤30 líneas forwardeable; compone health check + 1 oportunidad + estado del watchdog | 15 | Buena. Pensada para programar |
| `diagnose-drop` | Jerarquía de causas de 8 pasos, 4 secciones obligatorias, seasonality nunca omitida | 12 | Muy buena. El paso "nombra la fuente de los bots" es el tipo de detalle que separa un informe de un consultor |
| `opportunity-scan` | 14 patrones, ≤3 oportunidades, línea de transparencia de lo que no disparó, supresión de repetidos vía ledger | 12 | Muy buena |
| `funnel-analysis` | Etapa más débil + segmentación + hipótesis rankeadas + € recuperable | 10 | Buena |
| `product-friction` | Por SKU: champions / fricción / hidden gems / dead stock, cart→purchase real por SKU, drill por dispositivo y fuente | 12 | Muy buena y honesta con las muestras de `*_raw` |
| `calibrate-watchdog` | Baseline día-de-semana × hora (168 celdas) en tres modos según volumen | 40 (una vez) | Buena; el diseño de modos A/B/C es la respuesta correcta a que el MCP no tenga serie horaria |
| `cart-watchdog` | Chequeo horario contra el baseline, silencioso en 🟢, dos lecturas malas antes de 🔴 | 6 | Buena |
| `channel-mix-optimizer` | Scorecard por canal de pago con RPE, candidatos a escalar/cortar, ratios entre canales | 10 | Buena, con la caveat de ROAS bien repetida |
| `property-explorer` | Inventario de propiedades custom con score 0–9, top 5, 3 análisis de arranque, mapa persistido | 15 | Buena |
| `cost-reduction` | 8 patrones de desperdicio operativo (bots, páginas zombi, tracking roto, UTMs muertos, alertas/webhooks, segmentos) | 12 | Buena en diseño; ver §3.1 para lo que no puede ejecutar |
| `setup-audit` | Score /10 + tabla de gaps por valor desbloqueado + snippet verbatim de `get_tracking_code`; única skill que escribe (reglas de canal, con confirmación) | 12 | Buena; la regla "snippet fetched o no snippet" nace de un fallo real y está bien resuelta |
| `install-sealmetrics` | Provisiona, coloca el pixel, verifica, instrumenta el funnel por vertical | 15 | Bien diseñada; ver §3.1: no funciona con el conector por defecto |

### 2.2 Metodología y referencias (lo que hace que las 14 se parezcan a un consultor)

- **`methodology.md`** (3.300 palabras): atribución *last non-direct click* y cuándo decirlo; país derivado de timezone; reglas de llamada del MCP (qué acepta `compare`, nombres de parámetro trampa, formas reales de respuesta capturadas del servidor el 08/09); umbrales por defecto; los tres resultados del bot check; jerarquía de causas; triangulación; cuantificación de impacto; RPE como proxy; matemática del baseline intradía; modos de fallo.
- **`opportunity-patterns.md`**: 14 patrones con detección exacta (tool + parámetros) y plantilla de recomendación.
- **Tres playbooks verticales**: ecommerce (8 análisis firma), hoteles (7, con yoy obligatorio y directo vs OTA), SaaS/lead-gen (6, con impacto en leads cuando no hay revenue).
- **`state-schema.md`**: perfil del site, mapa de propiedades, baseline, libro de recomendaciones con `metric/baseline/target/verify_on/status`, log de ejecuciones. Es el contrato que convierte informes en consultoría.

### 2.3 Infraestructura del plugin

| Pieza | Estado |
|---|---|
| Hooks | `SessionStart` anuncia el state dir y los perfiles cacheados; `PreToolUse` cuenta llamadas por turno y avisa (nunca bloquea); `UserPromptSubmit` resetea el contador |
| Agente `sealmetrics-analyst` | Existe, con `disallowedTools` y `maxTurns: 30`. **Ninguna skill lo usa** (decisión documentada en `state-schema.md`: un fork no ve el state dir ni el perfil). Es código muerto salvo que el modelo lo invoque por su cuenta |
| Evals | 24 casos, 15 fixtures, mock MCP, runner con `--resume` para probar follow-ups, retry de transitorios, aserciones sobre estado persistido. Regla de oro documentada: "prohíbe una posición, no una frase" |
| Gates offline | Linter de llamadas (0 errores en 36 md), coherencia aritmética de fixtures, self-test del harness, contradicciones aserción vs golden output, validación del manifest, export y drift del árbol Codex |
| Distribución | Claude Code (marketplace propio), Codex (marketplace en el root), Cowork (bundle), Claude.ai (14 ZIPs), ChatGPT (vía el catálogo compartido con Codex) |
| Uso real | Un site en `~/.seal-copilot` con 4 runs (2 health checks, 2 setup audits) del 08/09 |

### 2.4 Cobertura del MCP

De las 62 herramientas del esquema, las skills referencian 61. Solo `get_operating_systems` no aparece en ningún sitio (`get_devices` ya devuelve `by_os`, así que es correcto).

---

## 3. Lo que no hace, o no puede hacer, hoy

### 3.1 Defectos y contradicciones encontrados en el código (ordenados por gravedad)

**D1 · El conector por defecto no puede ejecutar el bot check ni 19 herramientas más.**
`1.11.0` cambió `.mcp.json` al transporte remoto OAuth, que por decisión del 02/07 oculta las herramientas que exigen scope `read`: `get_bot_stats`, `get_suspicious_sessions`, `get_channels`, `list_channel_rules`, `test_channel_rules`, las 4 de escritura de reglas, `list_segments`, `get_segment`, `list_alerts`, `get_alert_history`, `get_alert_stats`, `list_webhooks`, `list_webhook_deliveries`, `get_webhook_stats`, `verify_setup`, `get_instrumentation_guide`, `verify_event_instrumented`. Consecuencias directas para el usuario tipo (marketer con login en el navegador):

- La regla 4 del core ("bot check antes de cualquier anomalía") produce siempre "unvalidated for bots". Es el argumento nº 1 del plugin y está apagado por defecto.
- `cost-reduction`: patrones 1, 6 y 7 (bots, alertas/webhooks, segmentos) no ejecutan. Quedan 5 de 8.
- `setup-audit`: pasos 6 y 8 y toda la vía de reglas de canal no ejecutan. Es la única skill con escritura, y la escritura no está disponible.
- `channel-mix-optimizer` paso 1.2 y `property-explorer` (segmentos) degradan con aviso.
- `install-sealmetrics` **no funciona en absoluto**: su descripción sigue disparando con "install Sealmetrics" y el usuario llega a un callejón sin salida. El README lo dice en un párrafo; la skill no lo dice en su primera línea.

El plugin maneja esto con elegancia (línea "Not checked", `agent_analytics_enabled: "refused"`, nunca reintenta). Pero manejar bien una carencia no la elimina. Es el hallazgo principal de esta auditoría y la petición nº 1 al equipo del MCP (§5.4).

**D2 · Referencias activas a `get_channels` a pesar de "Never call `get_channels`".**
`methodology.md` lo prohíbe en la línea 183 y lo usa en la jerarquía de causas (línea 318). También lo usan `opportunity-patterns.md` patrón 8, `hotels-playbook.md` análisis 1, y la tabla de `channel-mix-optimizer` ("Entrances: from get_channels"). El linter no lo detecta porque la herramienta existe en el esquema. Un modelo que lea el patrón 8 antes que la prohibición hará la llamada y recibirá "Access denied".

**D3 · Texto obsoleto de la era API key.**
`seal-copilot/SKILL.md` línea 61 y la tabla de modos de fallo de `methodology.md` siguen diciendo "si falta `SEALMETRICS_API_KEY`… genera un token en Settings → API Tokens". El hook de sesión ya no comprueba la variable. El README del plugin (troubleshooting, filas 1 y 2) da el mismo consejo. El eval `no-api-key-gives-instructions` sigue exigiendo que la respuesta mencione la API key, es decir, certifica un comportamiento que ya no es el deseado (lo deseado es "abre `/mcp` y autoriza").

**D4 · El perfil real escrito en `~/.seal-copilot` no cumple el contrato de `state-schema.md`.**
El `profile.json` real tiene `name`, `domain`, `event_names.{conversions,microconversions}`, `property_keys`, `lens_tier`, `product_identifier_table` y `created_at`. El esquema dice `site_name`, `events.{view,add_to_cart,…}`, `product_identifier.{key,table}` y `first_data_date`. Y `runs.jsonl` contiene dos líneas con formato antiguo (`run_at`, `calls_used`). Nada valida el estado al escribirlo: el contrato existe solo en prosa. Toda la promesa de "las skills posteriores leen el perfil en lugar de redescubrir" depende de que los nombres coincidan.

**D5 · La moneda está fijada en € en el texto de seis skills** (`impact_eur_month`, "€/month", "€X"). `profile.json` tiene `currency` pero ninguna skill la lee. Un cliente en USD o GBP recibe informes en euros.

**D6 · Los umbrales no son configurables por cliente.** `methodology.md` dice "ajusta si el cliente indica los suyos", pero no hay dónde guardarlos: el perfil no tiene bloque `thresholds`. La siguiente sesión los olvida.

**D7 · Deuda menor.** README del plugin dice "21 cases" (son 24). La descripción del core menciona `mcp__sealmetrics__*` (el PRD E1 pedía quitarlo; instalado como plugin el prefijo es otro). El agente `sealmetrics-analyst` no lo usa nadie. `methodology.md` pesa 3.300 palabras y se carga en cada análisis; las "reglas de llamada del MCP" podrían vivir en una referencia aparte que solo se lea al componer llamadas nuevas.

### 3.2 Lo que no cubre y a un marketing manager le importa

| Necesidad | Estado hoy | Por qué importa |
|---|---|---|
| **Coste, ROAS, CAC** | Ausente. RPE como proxy con caveat en cada informe | Es la decisión semanal del responsable de paid. Sin coste, "escala X, corta Y" es siempre condicional |
| **Objetivos y ritmo (pacing)** | Ausente | "¿Llego al objetivo del mes?" es la pregunta más frecuente de un CMO. Las series diarias de `get_overview` lo permiten sin tocar el MCP |
| **Informe entregable** | Texto plano/Markdown. El briefing del lunes es un bloque de código para copiar | Un marketing manager reenvía a dirección. Un HTML con tabla y sparkline, o un PDF, se abre; un bloque de texto se reformatea |
| **Entrega a Slack/email** | Depende del host (`/schedule`); el plugin no publica en ningún sitio | El informe proactivo que hay que ir a buscar no es proactivo |
| **Medir el efecto de un cambio** | Parcial: el ledger verifica métrica vs target a las 2–4 semanas | Falta pre/post con control (yoy o canal no tocado) para "¿funcionó el rediseño del checkout?" |
| **Verticales hoteles y SaaS** | Playbooks de referencia, sin skills propias. Ecommerce tiene 3 skills dedicadas | Un revenue manager de hotel no pide "opportunity scan", pide "directo vs OTA" y "mercados emisores". Un growth de SaaS pide "fricción de formulario" |
| **Orgánico / contenido** | Solo el patrón 14 (content-group mismatch) | Content marketers y SEO no tienen entrada. `get_landing_pages_by_content_group`, `get_terms` orgánicos y `get_top_referrers` dan para una skill de "content decay" y "páginas que traen tráfico y no convierten" |
| **Comparativa entre sites (agencias)** | Prohibido explícitamente ("never fan out over all sites") | Correcto como default, pero una agencia con 12 clientes quiere un briefing de cartera con opt-in explícito |
| **Nuevos vs recurrentes, cohortes, LTV** | No hay | Limitación de plataforma (consentless, sin identificador). Hay que decirlo como ventaja y no ofrecerlo |
| **Atribución multi-touch** | No hay; last non-direct click con caveat | Limitación de plataforma. La caveat está bien puesta |

### 3.3 Lo que no cubre y a un data analyst le importa

| Necesidad | Estado hoy | Riesgo |
|---|---|---|
| **Aritmética determinista** | El modelo calcula CR, deltas, RPE, medianas de 168 celdas, joins de pivots por SKU… en su cabeza | Es la mayor amenaza a "cada número es real". Un error de suma en un pivot de 100 SKUs no lo detecta ningún eval actual |
| **Detección de anomalías estadística** | Umbral fijo ±25% vs periodo comparable | Sin ajuste por día de semana ni varianza, un −25% en un site con σ del 30% es ruido, y un −15% en uno estable es señal. GA4 lleva años con modelos bayesianos aquí |
| **Fidelidad numérica en evals** | `assess.mjs` comprueba regex, llamadas y estado. **No comprueba que los números de la respuesta existan en el fixture** (el PRD E7.4 lo pedía) | La regla más importante del plugin no tiene test |
| **Exportar datos** | No hay. Las tablas viven en el chat | Un analista quiere el CSV del scorecard de canales para su propio Sheets |
| **Intervalos de confianza / significancia** | "≥30 conversiones por celda" como floor | Bien como regla de dedo; un analista espera un test de proporciones para "CR móvil < 50% desktop" |
| **Reproducibilidad** | `runs.jsonl` guarda `calls` y `verdict`, no las llamadas ni sus parámetros | No se puede reproducir un informe de hace tres semanas |
| **Datos crudos por ventana grande** | `*_raw` limitados a 31 días y 100 filas/página | Limitación del MCP; la skill lo dice bien. Un `get_microconversions_timeseries` (PRD E3.1) sigue sin existir |

### 3.4 Superficies: dónde se pierde qué

| Superficie | Se pierde |
|---|---|
| Codex / ChatGPT | Hooks (aviso de auth, presupuesto) y agente. Documentado |
| Claude.ai (web/desktop) | **Todo el estado**: sin filesystem no hay perfil, ni ledger, ni baseline, ni seguimiento. Es la superficie que más usa un marketer y en la que el plugin deja de ser consultor y vuelve a ser informe. Nadie lo ha resuelto aún; el bloque `SEAL-STATE` que se menciona en el CHANGELOG para Codex es la única vía y es manual |

---

## 4. Cómo se compara con "lo mejor del mercado"

Referencias con las que un comprador compara (estado a mi conocimiento, junio 2026): la capa de IA de GA4 (anomalías bayesianas, preguntas en lenguaje natural, sin recomendaciones accionables), Ask Amplitude y Max de PostHog (producto, cohortes, sin marketing ni coste), Moby de Triple Whale (ecommerce; tiene coste, ROAS y creativos, pero depende de píxeles con consentimiento), y los MCP genéricos de Supermetrics/Amplitude (datos, sin metodología).

Dónde Seal Copilot ya gana: metodología explícita y auditable, verificación de sus propias recomendaciones, 100% del tráfico, seguridad frente a UTMs hostiles, honestidad estadística, y evals públicos. Ningún competidor publica "24 casos, 3/3, cero reintentos".

Dónde pierde: coste/ROAS (Moby), anomalías estadísticas (GA4), entregables visuales (todos), y que su pilar de calidad de tráfico está apagado en el transporte por defecto (D1).

---

## 5. Qué habría que construir para que sea puntera

Ordenado por valor / esfuerzo. Cada punto dice qué código es y de qué depende.

### 5.1 Fase 0 · Coherencia (un día, sin dependencias)

1. **Quitar las cuatro referencias activas a `get_channels`** (methodology línea 318, patrón 8, hotels análisis 1, tabla de channel-mix) y añadir al linter una lista `FORBIDDEN_TOOLS` que falle si aparecen fuera de una frase de prohibición. Hoy el linter solo valida existencia.
2. **Actualizar el texto de autenticación** en `SKILL.md` línea 61, la tabla de modos de fallo, el README, y reescribir el eval `no-api-key-gives-instructions` para exigir "abre `/mcp` y autoriza el servidor" en lugar de "API key".
3. **`install-sealmetrics`: decirlo en la primera línea.** "Esta skill necesita el servidor local con `SEALMETRICS_API_KEY`; con el conector por defecto solo puedo darte el snippet y la guía." Mejor aún: moverla a un plugin hermano `seal-install` con su propio `.mcp.json` stdio, para que el plugin principal no prometa lo que no puede hacer.
4. **Validar el estado al escribirlo.** Un `state.schema.json` por archivo (perfil, ledger, runs, baseline) y un hook `PostToolUse` sobre `Write` que valide cualquier ruta bajo `<state-dir>` y devuelva el error al modelo. El perfil real ya divergió (D4); esto lo habría impedido.
5. **`currency` y `thresholds` en el perfil**, leídos por todas las skills. Un bloque `thresholds` con los 15 valores de la tabla de `methodology.md` y una regla: "si el cliente da un umbral, persístelo aquí". Sustituir "€" por `<currency>` en las seis skills.

### 5.2 Fase 1 · Lo que decide el día de un marketing manager (2–3 semanas)

6. **`import-spend` + spend ledger.** Skill manual: el usuario pega o adjunta un CSV de coste por campaña/canal/periodo (export de Google Ads, Meta, o a mano). Se guarda en `<state-dir>/<site>/spend.jsonl` con `period, utm_source, utm_medium, utm_campaign, cost, currency`. `channel-mix-optimizer`, `opportunity-scan` (patrones 1, 2, 5, 12) y `monday-briefing` pasan de RPE a **ROAS y CAC reales** cuando hay coste para el periodo, y lo dicen ("coste importado el 3/9, cubre 30d"). Sin coste, siguen como hoy. Es la mejora de más valor con cero dependencia del MCP, y el paso previo natural a conectores de Google/Meta Ads (fase 4 de la spec original).
7. **`pacing`** (o bloque en el briefing). Objetivo mensual de revenue/conversiones/leads en `profile.targets`. Proyección de fin de mes desde `revenue_series` con pesos por día de semana (el baseline del watchdog ya conoce el ritmo semanal) y estado "on pace / −X% / +X%". Una llamada. Es la línea que un CMO lee primero.
8. **`measure-change`.** "¿Funcionó el cambio del día D?" Pre/post de N semanas con dos controles: yoy del mismo segmento y un canal/landing no tocado (diferencia en diferencias simple). Emite efecto estimado, intervalo, y escribe la verificación en el ledger. Cierra el bucle que hoy solo cierra el follow-up automático.
9. **Informe entregable.** En Claude Code y Cowork, `monday-briefing` y `weekly-health-check` publican además un Artifact HTML (tabla KPI, sparkline de 7/30 días desde `*_series`, hallazgos, follow-up) y opcionalmente un PDF. En Claude.ai, HTML inline. El texto de 30 líneas se mantiene como cuerpo del mensaje/Slack.
10. **Skills verticales de hoteles y SaaS.** Hoteles: `direct-vs-ota` (referrers OTA, share directo, comisión ahorrada como presupuesto disponible) y `source-markets` (países yoy × campañas × corroboración por idioma). SaaS: `form-friction` (submit rate por dispositivo y por landing, coste de un formulario roto en leads). Son los análisis firma que ya están en los playbooks; convertirlos en skills les da trigger propio, golden output y eval.
11. **`content-performance`.** Para el content marketer: content groups que traen entradas y no convierten, landings orgánicas en declive 3+ semanas (content decay), términos orgánicos vs pagados con la misma intención (canibalización), referrers nuevos. Reutiliza el patrón 14 y `get_top_referrers`, que hoy solo se usa para nombrar bots.

### 5.3 Fase 2 · Lo que espera un data analyst (2–3 semanas, en paralelo)

12. **Módulo de cálculo determinista `tools/calc.mjs`.** Un script Node sin dependencias, invocado por las skills vía Bash con el JSON de la respuesta del MCP en stdin: `calc delta`, `calc rpe`, `calc sku-join`, `calc baseline-168`, `calc pace`. Las skills dejan de sumar pivots de cabeza; el modelo interpreta, el script calcula. Esto es lo que hacen los plugins de primer nivel y lo que hace verificable la regla "cada número es real". Codex y Claude.ai no tienen Bash: allí las skills siguen como hoy y lo dicen.
13. **Anomalías estadísticas sobre las series diarias.** En `calc`: mediana y MAD por día de semana sobre 8–12 semanas, z-score robusto del periodo actual, y "el día en que se rompió" por cambio de nivel. `diagnose-drop` paso 0 y `weekly-health-check` paso 1 lo usan para decidir si un ±25% es señal para *este* site. Sustituye el umbral fijo por uno relativo a la varianza propia, que es exactamente la "estadística honesta" que la metodología promete.
14. **Test de fidelidad numérica en los evals.** En `assess.mjs`: extraer todos los números de la respuesta, y exigir que cada uno (a) esté en el fixture, o (b) sea derivable de dos números del fixture por suma, resta, ratio o porcentaje con tolerancia de redondeo. Lo que no cumpla ninguna es número inventado y falla el caso. Es el test que falta para la regla más importante del plugin.
15. **`export-data`.** Cualquier tabla de un informe a CSV/XLSX en el directorio de trabajo (o como Artifact descargable). Una skill pequeña que reutiliza la última respuesta del MCP guardada en `<state-dir>/<site>/last-response.json`.
16. **Reproducibilidad.** `runs.jsonl` guarda además `calls_detail: [{tool, params}]`. Con eso `usage-report.mjs` puede rehacer un informe, y un analista puede auditar de dónde salió cada cifra.
17. **Estado en Claude.ai.** Ofrecer al usuario, al final de cada informe en esa superficie, un bloque `SEAL-STATE` compacto (perfil + ledger abierto, ≤20 líneas) para pegar al inicio de la siguiente conversación, y que las skills lo reconozcan. Es rudimentario y es lo único que hay hasta que la plataforma ofrezca memoria a los skills.

### 5.4 Peticiones al equipo del MCP (desbloquean lo anterior)

| Petición | Qué desbloquea | Nota |
|---|---|---|
| **Exponer `get_bot_stats` y `get_suspicious_sessions` bajo `stats:read`** (o una `get_traffic_quality` agregada, solo lectura) | D1 entero: el bot check vuelve a funcionar para OAuth y API key | Son datos agregados de calidad de tráfico, no configuración; el scope `read` parece heredado del router, no de la sensibilidad del dato |
| `get_microconversions_timeseries(conversion_type, granularity=hour\|day)` | Baseline del watchdog en 1 llamada en vez de 40; anomalías estadísticas sobre microconversiones | Ya pedido en el PRD E3.1, sigue abierto |
| Filtros `device_type`, `utm_source`, `country` en `get_property_breakdown` | Drill por SKU sobre 30 días en 2 llamadas, sin muestras de 100 filas | PRD E4.4 |
| Ingesta de coste (`import_cost` o conector Ads) | ROAS nativo en lugar del spend ledger local | La spec original lo situaba en fase 4; el spend ledger del punto 6 es el puente |
| Aplicar en el transporte local el mismo gate que el remoto | Que ningún cliente vea 20 herramientas que siempre fallan | Ya redactado en `docs/mcp-server-local-gate.md` |
| Retirar o alinear `get_marketing_playbook` | Una sola metodología | Abierto desde el PRD E2.1; hoy el core tiene que decir "no la llames" |

---

## 6. Resumen para decidir

- **Hoy:** un analista de marketing con metodología de consultor, memoria entre sesiones y evals reales, en cinco superficies. Es raro y es vendible.
- **El agujero:** el conector por defecto apaga el bot check y tres skills, y el texto del plugin aún no lo asume del todo (D1–D3). Un día de trabajo en el plugin y una decisión de scopes en el MCP.
- **El salto a "top":** coste/ROAS mediante spend ledger, pacing contra objetivo, medición de impacto, informe entregable, verticales con skill propia, y aritmética determinista con evals de fidelidad numérica. Ninguno de estos seis depende del MCP; los seis son código en este repo.

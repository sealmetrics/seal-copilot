# PRD — Seal Copilot v1.0 ("nivel top")

**Versión:** 1.0 · **Fecha:** 7 septiembre 2026 · **Autor:** Rafa (Sealmetrics) con Claude
**Estado:** Borrador para revisión · **Base:** auditoría del plugin v0.3.0 contra el MCP `@sealmetrics/mcp` (61 herramientas, esquemas verificados el 07/09/2026)

---

## 1. Resumen ejecutivo

Seal Copilot v0.3.0 tiene un núcleo analítico sólido: metodología, umbrales, jerarquía de causas y formato de recomendación son de calidad consultora. Pero hoy **cuatro de sus doce skills no se pueden ejecutar tal como están escritas**, porque invocan parámetros y herramientas que el MCP no expone, y el plugin carece de la infraestructura que hace fiable a un plugin en producción: estado persistente, evals, agente aislado, hooks y manejo de errores.

Este PRD define v1.0: el conjunto de cambios que convierte el plugin de "prompt bien escrito" a "producto verificable". Se organiza en 12 epics priorizados en tres fases. La fase 1 (compatibilidad con el MCP real) es bloqueante para cualquier demo o lanzamiento en marketplace.

**Principio rector:** cada skill debe poder ejecutarse de principio a fin contra el MCP real, con un presupuesto de llamadas real, y su salida debe poder verificarse con fixtures. Lo que no se puede evaluar no se lanza.

---

## 2. Objetivos y no-objetivos

### Objetivos

1. **Cero llamadas inválidas.** Toda invocación de herramienta en cualquier skill usa nombres y parámetros que existen en el esquema del MCP.
2. **Cada skill ejecutable de extremo a extremo** con el presupuesto de llamadas declarado, sin depender de que el modelo "recuerde" pasos previos.
3. **Salida verificable.** Suite de evals con fixtures reales que fija el comportamiento esperado de cada skill.
4. **Una sola metodología.** El plugin y el MCP no se contradicen sobre umbrales, atribución o formato.
5. **Memoria entre ejecuciones.** Perfil del site, mapa de propiedades, baseline del watchdog y libro de recomendaciones persisten y se reutilizan.
6. **Onboarding sin fricción.** Un usuario nuevo con API key llega a su primer informe en una conversación, y sin API key recibe instrucciones exactas, no un error.

### No-objetivos (v1.0)

- Asistente embebido en el dashboard (fase 2 de la spec original). Este PRD es solo el plugin.
- Ingesta de coste publicitario / ROAS real (fase 4 de la spec).
- Verticales más allá de ecommerce, hoteles y SaaS/lead-gen.
- Acciones de escritura en plataformas de ads.
- Multi-idioma completo de las skills: las skills siguen en inglés, la salida en el idioma del usuario.

---

## 3. Estado actual (auditoría v0.3.0)

### 3.1 Inventario

| Componente | Estado |
|---|---|
| `plugin.json`, `.mcp.json`, README | Correctos. Bundle `.plugin` sincronizado con el árbol. |
| 12 skills (1 core + 11 especialistas) | Frontmatter válido. Contenido analítico bueno. |
| 4 referencias (methodology, patterns, ecommerce, hotels) | Buenas. Contienen 3 llamadas inválidas. |
| `commands/`, `agents/`, `hooks/`, `evals/`, CHANGELOG, LICENSE | No existen. |
| Estado persistente | No existe. Dos skills lo asumen. |
| `seal-copilot-SKILL.md` (raíz) | v1 obsoleta, contradice al core actual. |

### 3.2 Llamadas inválidas (verificadas contra esquemas)

| Uso en la skill | Realidad del MCP | Afecta a |
|---|---|---|
| `get_channels(compare=previous)` | `get_channels` y `get_top_channels` no aceptan `compare`. Pasarlo devuelve datos de un solo periodo en silencio. | diagnose-drop, weekly-health-check, channel-mix-optimizer, methodology, patrón 8 |
| `get_microconversions(type=, granularity=hour, period=last_28_days)` | No existe granularidad horaria en ningún tool agregado. El parámetro es `conversion_type`. `last_28_days` no es un preset válido. | cart-watchdog (entera), monday-briefing bloque C, patrón 13 |
| `get_property_breakdown(microconversion_type=, limit=, sort_by=)` | Parámetros reales: `property_key`, `table`, `conversion_type`, `period`. Sin `limit` ni `sort_by`. | product-friction paso 2, patrón 11 |
| `get_property_values(value=<sku>, group_by=device_type)` | No filtra por valor. `group_by` solo admite `utm_source`, `utm_medium`, `utm_campaign`, `all`. | product-friction paso 4, property-explorer paso 2 |
| `get_microconversion_details(group_by=...)` | No tiene `group_by`; solo filtros (`device_type`, `utm_source`, `country`…). | cart-watchdog paso 5 |
| `get_campaigns(country=XX)` | `get_campaigns` no filtra por país. `get_top_campaigns` sí. | hotels-playbook, patrón 6 |
| `get_bot_stats(period=…)` | El parámetro es `days` (1–90). | cost-reduction, cart-watchdog, monday-briefing |
| `get_suspicious_sessions(period=…)` | No tiene periodo. Solo `limit`, `min_score`. | cost-reduction, cart-watchdog |
| `get_conversions(group_by=channel)` | No existe `group_by`. | channel-mix-optimizer |
| `get_top_countries`, `get_event_health` | No existen. | monday-briefing, cost-reduction |

### 3.3 Contradicciones de dominio con el MCP

| Tema | Skill dice | MCP dice | Riesgo |
|---|---|---|---|
| Atribución | "last-click" | "last non-direct click, consentless, server-side" | Explicaciones incorrectas cuando el cliente compara con GA4 |
| País | Se usa para recomendar campañas geo | Derivado de la **timezone del navegador**, no de IP. "Directional, not precise." | Patrón 6 y mercados emisores de hoteles recomiendan inversión sobre un dato aproximado sin avisar |
| `get_bot_stats` vacío | Se interpreta como 0% bots | `total_hits: 0` = agent analytics no habilitado. Nunca presentar como 0% real | El "bot check mandatory" confirma anomalías falsas en sites sin agent analytics |
| `get_property_breakdown` | Se asume CR por valor | Devuelve counts y revenue por valor, **no** CR | product-friction calcula ratios correctamente (count/count), pero property-explorer promete "channel variance" con un tool que no cruza por dispositivo |
| Tools `*_raw` | No se usan | Cap 31 días, 100 filas/página. "Best tool for per-product analytics" es `get_conversion_items_raw` | Todo el análisis por SKU ignora la herramienta diseñada para ello |

### 3.4 Dos metodologías compitiendo

El MCP expone `get_marketing_playbook`, cuya descripción instruye "Call this FIRST whenever the user asks for a marketing report". Es un playbook de 11 secciones con umbrales distintos a los del plugin:

| Concepto | Plugin | `get_marketing_playbook` |
|---|---|---|
| Muestra mínima | 30 conversiones por celda | 200 sesiones por landing/campaña |
| Cambio significativo | ±20% (mención), ±25% (anomalía) | ≥10% y >1 desviación estándar |
| Formato de salida | Máx. 3 hallazgos, veredicto primero | Informe de 11 secciones, TL;DR + plan de 3–7 acciones |
| Comparación de canales | `get_channels(compare=previous)` (inválido) | Dos llamadas con presets calendario (`this_month` vs `last_month`) |

Un cliente con el plugin instalado recibe ambas en la misma sesión. Hay que elegir una fuente de verdad.

### 3.5 Herramientas del MCP sin usar (25 de 61)

Relevantes para el producto: `get_conversion_items_raw`, `get_microconversions_raw`, `get_conversions_raw`, `get_content_groups`, `get_landing_pages_by_content_group`, `get_browsers`, `get_operating_systems`, `verify_event_instrumented`, `get_instrumentation_guide`, `get_troubleshooting_guide`, `test_channel_rules`, `create_channel_rule`, `update_channel_rule`, `search_docs`, `get_doc`, `get_alert_stats`, `list_webhook_deliveries`, `get_segment`.

Nota: la spec original afirma que el MCP es solo lectura. Ya no lo es: existen `create_channel_rule`, `update_channel_rule`, `delete_channel_rule`, `import_channel_rules` y `provision_site`.

---

## 4. Usuarios y casos de uso

| Persona | Contexto | Caso de uso principal | Skill |
|---|---|---|---|
| **Founder / CMO de ecommerce** | Revisa Claude el lunes, no abre dashboards | "¿Cómo fue la semana y qué hago hoy?" | monday-briefing, weekly-health-check |
| **Responsable de paid** | Decide presupuesto semanal | "¿Qué escalo y qué corto?" | channel-mix-optimizer, opportunity-scan |
| **Ecommerce manager** | Gestiona catálogo y PDPs | "¿Qué productos se ven y no se compran?" | product-friction |
| **Revenue manager de hotel** | Estacional, compite con OTAs | "¿Qué mercados y qué canal directo?" | hotels-playbook vía core, funnel-analysis |
| **Growth / SaaS** | Lead-gen, demos, signups | "¿Por qué bajaron las demos?" | diagnose-drop + **SaaS playbook (nuevo)** |
| **Implementador / agencia** | Instala Sealmetrics para clientes | "¿Está bien medido? ¿Qué falta?" | setup-audit, property-explorer |
| **Operaciones / on-call** | Necesita saber si el carrito funciona | Alerta horaria silenciosa si todo va bien | cart-watchdog |

---

## 5. Requisitos por epic

Prioridad: **P0** bloqueante para lanzar · **P1** necesario para "nivel top" · **P2** deseable.

### E1 · Compatibilidad con el MCP real — P0

Corregir cada llamada inválida de la tabla 3.2. Sustituciones concretas:

| Uso actual | Sustitución |
|---|---|
| `get_channels(period=7d, compare=previous)` | Dos llamadas con presets calendario: `get_channels(period=this_week)` + `get_channels(period=last_week)`, o `this_month`/`last_month`, `this_quarter`/`last_quarter`. Diferenciar en la skill. Documentar en methodology que `30d` no tiene par previo. |
| `get_campaigns(country=XX)` | `get_top_campaigns(country=XX)` para el screening; `get_campaigns` solo cuando no haga falta país. |
| `get_bot_stats(period=7d)` | `get_bot_stats(days=7)`. |
| `get_suspicious_sessions(period=…)` | `get_suspicious_sessions(min_score=70, limit=50)`; el periodo lo fija el MCP. |
| `get_top_countries` | `get_countries(sort_by=conversions, limit=10)`. |
| `get_event_health` | `get_microconversions(period=30d, compare=previous)` por tipo (ya es lo que hace el patrón 3 de cost-reduction). Eliminar la referencia. |
| `get_conversions(group_by=channel)` | `get_conversions(utm_medium=<paid medium>)` por cada medio de pago (≤4 llamadas), o `get_traffic_mediums(period=90d)` que ya devuelve conversiones y revenue por medio. |
| `get_property_breakdown(microconversion_type=X, limit=, sort_by=)` | `get_property_breakdown(table=microconversions, conversion_type=X, property_key=P, period=30d)`. Ordenar y truncar en la skill. |
| `get_microconversions(type=X)` | `get_microconversions(conversion_type=X)`. |
| `get_microconversion_details(group_by=…)` | Llamadas filtradas: `get_microconversion_details(conversion_type=X, device_type=mobile)` vs `desktop`; `utm_source=<top source>`. |

**Criterio de aceptación:** un linter (E7) que extrae todas las llamadas `tool(param=…)` de skills y referencias y las valida contra el esquema exportado del MCP devuelve cero errores.

**Además:** el core skill referencia `mcp__sealmetrics__*` en su descripción (parte del trigger). Instalado como plugin el prefijo es `mcp__plugin_seal-copilot_sealmetrics__*`. Sustituir por "the Sealmetrics MCP tools" sin prefijo.

### E2 · Una sola fuente de verdad metodológica — P0

1. **Decisión requerida:** el plugin sustituye a `get_marketing_playbook`. El core skill incluye: *"Do not call `get_marketing_playbook`; this plugin supersedes it. If it was already loaded, the rules below take precedence."* Alternativa: el MCP retira el playbook cuando detecta el plugin (fuera de alcance de este PRD; requiere cambio en el MCP).
2. **Atribución:** cambiar "last-click" por "last non-direct click" en core, README, methodology y channel-mix. Añadir la frase única de disclaimer que usa el MCP para cuando el cliente mencione GA4 o plataformas de ads.
3. **País:** añadir a methodology la regla *"Country is derived from browser timezone; treat as directional. Never base a geo-campaign recommendation on country alone; require CR + ≥30 conversions + corroboration via `get_terms` language or landing path."* Aplicar en patrón 6 y hotels-playbook.
4. **Bot check con tres estados:** `get_bot_stats` devuelve datos → usar; devuelve `total_hits: 0` → "traffic-quality data unavailable (agent analytics not enabled)", el hallazgo se marca "unvalidated for bots", nunca 0%; devuelve 403 → decir que es permisos y seguir. Codificar en methodology y en cada skill que llama al bot check.
5. **Unificar umbrales** con el playbook del MCP donde sean mejores: adoptar "≥200 sesiones para comparar CR de landing/campaña" como umbral de volumen adicional al de 30 conversiones.

### E3 · Rediseño de cart-watchdog — P0

**Problema:** la matriz de 168 celdas (día de semana × hora) necesita 4 semanas de series horarias. Ningún tool agregado las da; `get_microconversions_raw` devuelve 100 filas por página, así que un site con 1.000 AtC/día requeriría ~280 páginas para construir el baseline.

**Diseño v1.0:**

1. **Dependencia MCP (recomendada, P0 para el MCP):** nuevo tool `get_microconversions_timeseries(conversion_type, period | start_date/end_date, granularity: hour|day)` que devuelva `[{ts, count}]`. Con él, el baseline son 1 llamada (28 días × 24 h = 672 puntos) y la comprobación horaria 1 llamada (`period=today`).
2. **Modo interino sin ese tool:** separar en dos comandos.
   - `/seal-copilot:calibrate-watchdog` (manual, una vez por site y tras cambios de tracking): construye el baseline paginando `get_microconversions_raw(conversion_type=[atc], start_date, end_date, limit=100)` en ventanas de 7 días, con tope de 40 páginas por ventana (4.000 eventos). Si el site supera el tope, reduce a un baseline por **hora del día** (24 celdas) muestreando. Guarda el resultado en el estado (E5).
   - `/seal-copilot:watchdog` (programado, horario): lee el baseline del estado; llama `get_microconversions(conversion_type=atc, period=today)` para el total del día y `get_microconversions_raw(conversion_type=[atc], period=today, limit=100, page=1..N)` solo si el total supera el umbral de sospecha, para localizar la última hora. Presupuesto ≤6 llamadas.
3. **Baseline en calentamiento:** con <4 semanas o <5 eventos/celda de mediana, el watchdog degrada a modo diario ("hoy lleva X vs mediana diaria Y para este día de semana") y lo dice.
4. **Anomalías**: mantener las definiciones 🟢/⚠️/🔴 actuales. Añadir el tercer estado del bot check (E2.4).
5. **Salida silenciosa:** si 🟢 en ejecución programada, la respuesta es una sola línea. Ya está así; mantener.

### E4 · Rediseño de product-friction sobre las herramientas correctas — P0

1. **Descubrimiento del identificador:** `list_property_keys(table=conversion_items)` primero (es donde el MCP dice que viven `sku`, `product_id`, `price`, `quantity`), luego `table=microconversions`. Verificar que el mismo identificador aparece en view_item y add_to_cart; si no, parar y remitir a setup-audit.
2. **Vistas y carritos por SKU:** `get_property_breakdown(table=microconversions, conversion_type=<view>, property_key=P, period=30d)` y lo mismo para `<atc>`. Join y clasificación en la skill. Sin `limit`: el MCP devuelve el pivot completo; la skill trabaja con el top 100 por vistas y lo dice.
3. **Compras por SKU:** `get_conversion_items_raw(conversion_type=[purchase], period=30d, limit=100, page=1..N)`, tope 10 páginas (1.000 líneas). Con eso se calcula AtC→compra real por SKU en lugar de usar el ratio global del site.
4. **Drill por dispositivo y fuente (top 3 SKUs de fricción):** `get_microconversions_raw(conversion_type=[atc], device_type=[mobile], include_properties=true, period=7d, limit=100)` y comparar la frecuencia del SKU con la de vistas. Es caro; limitar a 7 días y 2 llamadas por SKU. **Dependencia MCP recomendada (P1):** añadir filtros `device_type`, `utm_source`, `country` a `get_property_breakdown`, lo que reduce el paso 4 a 2 llamadas por SKU sobre 30 días.
5. Reescribir el patrón 11 de opportunity-patterns con las mismas llamadas.

### E5 · Estado persistente por site — P1

**Ubicación:** `~/.seal-copilot/<site_id>/` (fuera del directorio del plugin, que es de solo lectura tras instalar). Todas las skills leen al empezar y escriben al terminar. Formatos legibles (JSON y Markdown) para que el usuario pueda inspeccionar y corregir.

| Archivo | Contenido | Lo escribe | Lo lee |
|---|---|---|---|
| `profile.json` | site_id, nombre, timezone, moneda, vertical detectado, nombre real del evento AtC/view/checkout, identificador de producto elegido, `agent_analytics_enabled`, fecha del primer dato | property-explorer, setup-audit, core (primera sesión) | Todas |
| `property-map.md` | Inventario de propiedades con cardinalidad, Pareto, varianza por canal y el score 0–9 | property-explorer | product-friction, opportunity-scan, channel-mix, core |
| `watchdog-baseline.json` | Matriz 168 (o 24) celdas con mediana y gap, fecha de calibración, semanas usadas | calibrate-watchdog | watchdog, monday-briefing, diagnose-drop |
| `recommendations.jsonl` | Libro de recomendaciones: fecha, skill, patrón, evidencia, acción, impacto estimado, métrica y fecha de verificación, estado (open/verified/discarded) | Toda skill que emite una recomendación | weekly-health-check, monday-briefing, opportunity-scan |
| `runs.jsonl` | Log de ejecuciones: skill, fecha, llamadas usadas, veredicto | Todas | Evals, cost-reduction |

**Comportamientos que habilita:**

- **Seguimiento de recomendaciones.** Cada recomendación dice "verifica en 2–4 semanas". weekly-health-check y monday-briefing abren con un bloque "Seguimiento" que comprueba las recomendaciones cuya fecha de verificación ha llegado: re-ejecuta la métrica y la marca verified/failed. Esto es lo que convierte al plugin de "informe" en "consultor".
- **No repetir hallazgos.** opportunity-scan no vuelve a proponer un patrón ya abierto en el libro salvo que el impacto haya crecido ≥50%.
- **Ahorro de llamadas.** El descubrimiento (`list_sites`, `get_site`, `list_property_keys`, `list_microconversion_types`) se hace una vez y se cachea con TTL de 7 días.
- **Expiración.** property-map y baseline caducan a 30 días; la skill avisa y propone recalibrar.

### E6 · Estructura de plugin: invocación explícita, agente, hooks — P1

**6.1 Frontmatter completo en cada skill.** Añadir según corresponda:

- `argument-hint` en diagnose-drop (`<metric> [period]`), product-friction (`[limit]`), channel-mix (`[period]`).
- `disable-model-invocation: true` en monday-briefing, cart-watchdog y calibrate-watchdog: son programados o manuales, no deben dispararse por una pregunta casual.
- `allowed-tools` restringido a las herramientas del MCP de Sealmetrics más `Read`/`Write` sobre `~/.seal-copilot/**` en todas las skills.
- `context: fork` con `agent: sealmetrics-analyst` en property-explorer, opportunity-scan, cost-reduction y product-friction (las de mayor volumen de JSON), para que los resultados brutos no contaminen la conversación principal.

**6.2 Agente `agents/sealmetrics-analyst.md`.** Subagente con las reglas operativas del core, acceso solo al MCP y al estado, y la instrucción de devolver únicamente el informe final en el formato de la skill. Presupuesto de llamadas aplicado como instrucción dura con recuento explícito.

**6.3 Hooks `hooks/hooks.json`.**

- `SessionStart`: script que comprueba `SEALMETRICS_API_KEY`; si falta, inyecta en contexto las instrucciones exactas de obtención (Settings → API Tokens) y marca el plugin como no operativo. Si existe, lee `profile.json` del site por defecto (o lista los sites disponibles) y lo inyecta como contexto, evitando la llamada de descubrimiento.
- `PreToolUse` sobre `mcp__plugin_seal-copilot_sealmetrics__*`: contador de llamadas por turno para hacer cumplir el presupuesto (aviso a partir del 80%, bloqueo al 100% salvo que el usuario haya pedido "análisis largo").

**6.4 Programación.** Sustituir las referencias a "Claude Cowork" por instrucciones concretas para los dos entornos: en Claude Code, `/schedule` con el comando `/seal-copilot:monday-briefing` (lunes 08:00 zona del site) y `/seal-copilot:watchdog` (cada hora 08–24); en Cowork, la tarea programada equivalente. La skill ofrece la programación una vez y guarda en `profile.json` que ya se ofreció.

### E7 · Evals y linter — P1

**7.1 Linter de llamadas.** Script `evals/lint-tool-calls.mjs`: extrae `tool_name(param=value, …)` de todos los `.md` del plugin, valida nombre y parámetros contra `evals/mcp-schema.json` (exportado del servidor con `tools/list`). Falla en CI si hay un nombre o parámetro inexistente. Es el test que habría detectado todo el apartado 3.2.

**7.2 Fixtures.** `evals/fixtures/<escenario>/` con respuestas JSON reales anonimizadas de cada tool para escenarios canónicos:

| Escenario | Qué prueba |
|---|---|
| `ecommerce-healthy` | Veredicto ✅, cero hallazgos, no rellena |
| `ecommerce-paid-search-drop` | diagnose-drop aísla la campaña correcta en ≤12 llamadas |
| `ecommerce-bot-spike` | El pico se atribuye a bots, no se celebra |
| `ecommerce-no-agent-analytics` | `get_bot_stats` vacío → "unvalidated", nunca 0% |
| `ecommerce-sku-friction` | product-friction clasifica champions/friction/gems correctamente |
| `hotel-seasonal-october` | Caída vs previous, plana yoy → "seasonal", no recomienda nada |
| `saas-demo-drop` | SaaS playbook: form_view estable, submissions caen → fricción de formulario |
| `no-api-key` | Hook de sesión da instrucciones, ninguna skill llama al MCP |
| `multi-site` | Pregunta qué site antes de cualquier análisis |

**7.3 Mock MCP.** `evals/mock-server/` : servidor MCP mínimo que sirve las fixtures por escenario (`SEAL_FIXTURE=ecommerce-bot-spike`). Permite ejecutar cualquier skill sin cuenta real y de forma determinista.

**7.4 Suite.** Usar `claude plugin eval` si está disponible en el plan; si no, un runner propio que lance `claude -p "<prompt>"` con el mock y compruebe aserciones sobre la salida (veredicto, nombre de campaña, número de llamadas, ausencia de cifras inventadas comparando contra las fixtures). Objetivo: ≥90% de casos verdes antes de cada release.

### E8 · Golden outputs — P1

Un ejemplo completo de salida por skill, con números reales anonimizados, en `skills/<skill>/examples/output.md`. La skill lo referencia: *"Match the density and tone of `examples/output.md`."* Fija longitud, tono y estructura mejor que cualquier regla. Especial cuidado en monday-briefing (debe caber en 30 líneas) y cart-watchdog (una línea en 🟢).

### E9 · Errores y onboarding — P1

Añadir a methodology una sección "Failure modes" y aplicarla en todas las skills:

| Situación | Comportamiento |
|---|---|
| Sin `SEALMETRICS_API_KEY` | Hook de sesión (E6.3). Ninguna skill intenta llamar al MCP. |
| 401/403 | "Permission problem, not a data problem." No reintentar. Indicar dónde regenerar el token. |
| Varios sites y sin `SEALMETRICS_SITE_ID` | Listar por nombre y URL, preguntar, guardar la elección en `profile.json`. |
| <14 días de datos | Sin yoy, avisar de ruido, veredicto siempre "directional". |
| <30 conversiones en el periodo | weekly-health-check y monday-briefing cambian a modo "volumen bajo": solo KPIs, sin hallazgos. |
| Tool devuelve vacío | Decirlo. Nunca rellenar. Si es `list_microconversion_types` vacío, ofrecer setup-audit. |
| Timeout / error 5xx | Reintentar una vez, después mostrar "—" en esa sección y continuar (ya lo hace monday-briefing; generalizar). |

README: añadir "Primer uso en 5 minutos" con la secuencia exacta (instalar → token → `/seal-copilot:property-explorer` → `/seal-copilot:weekly-health-check`) y una sección "Solución de problemas" con los tres errores más comunes.

### E10 · Playbook SaaS / lead-gen — P1

`references/saas-playbook.md`, mismo formato que los otros dos:

- **Señales de detección:** conversiones `signup`, `demo_request`, `trial_start`, `lead`; microconversiones `pricing_view`, `cta_click`, `form_view`; propiedades `plan`, `company_size`, `industry`.
- **Funnel canónico:** entrance → pricing_view → form_view → submit → (qualified). Mapear nombres reales.
- **Análisis firma:** (1) CR por canal a lead y **valor por plan** si la propiedad existe; (2) ratio form_view→submit por dispositivo (fricción de formulario); (3) brand vs non-brand en `get_terms` para SEM; (4) blog vs producto con `get_landing_pages_by_content_group` (el patrón "60% del tráfico entra por el blog y convierte al 0,5%"); (5) propiedad ganadora: plan o industry con revenue desproporcionado por canal.
- **Impacto:** en leads × valor medio por lead (el usuario aporta el valor si no hay revenue en la conversión).
- Añadir la detección de vertical SaaS al core skill y la fila correspondiente en la tabla de "Vertical detection".

### E11 · Cobertura de herramientas del MCP — P2

| Herramienta | Dónde usarla |
|---|---|
| `get_content_groups`, `get_landing_pages_by_content_group` | Nuevo patrón 14 "Content-group mismatch" en opportunity-patterns; paso opcional en funnel-analysis |
| `get_browsers`, `get_operating_systems` | Paso 5b en diagnose-drop: caída concentrada en Safari/iOS → ITP o bug de render |
| `verify_event_instrumented`, `get_instrumentation_guide`, `get_troubleshooting_guide` | setup-audit: verificar cada evento canónico y dar el snippet real del guide en lugar de improvisar |
| `test_channel_rules`, `create_channel_rule`, `update_channel_rule` | setup-audit: cuando detecte tráfico cpc en "Referral", proponer la regla, probarla con `test_channel_rules` y **aplicarla solo con confirmación explícita** del usuario. Primera acción de escritura del plugin; documentar en "What you do NOT do" que nunca se aplica sin confirmar. |
| `search_docs`, `get_doc` | Core skill: para preguntas de "cómo configuro X en Sealmetrics", buscar en docs antes de responder de memoria |
| `get_alert_stats`, `list_webhook_deliveries` | cost-reduction patrón 6, sustituyendo la lógica aproximada actual |
| `get_segment` | property-explorer: incluir segmentos guardados en el inventario |

### E12 · Higiene de repo, versionado y release — P2

- Eliminar `seal-copilot-SKILL.md` de la raíz (o moverlo a `docs/archive/`). Eliminar `.DS_Store` y añadir `.gitignore`.
- Añadir `LICENSE` (MIT, coherente con `plugin.json`), `CHANGELOG.md` (empezar en 0.3.0 con lo auditado), `docs/` con la spec y este PRD.
- Versionado semántico: 0.4.0 = fase 1 de este PRD; 1.0.0 = fases 1–3 completas.
- Script `scripts/build-plugin.sh` que regenera el `.plugin` desde el árbol y ejecuta el linter (E7.1) antes de empaquetar. Hoy el zip se hace a mano.
- `.claude-plugin/marketplace.json` si se va a distribuir vía marketplace propio.
- Inicializar git en el repo (hoy no lo es) y proteger `main` con el linter en CI.

---

## 6. Estructura objetivo del plugin

```
seal-copilot/
├── .claude-plugin/
│   ├── plugin.json                  # 1.0.0
│   └── marketplace.json             # opcional
├── .mcp.json
├── README.md · CHANGELOG.md · LICENSE
├── agents/
│   └── sealmetrics-analyst.md       # E6.2
├── hooks/
│   ├── hooks.json                   # E6.3
│   └── scripts/session-start.sh · call-budget.sh
├── skills/
│   ├── seal-copilot/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   ├── methodology.md       # + failure modes, bot 3 estados, país, channels sin compare
│   │   │   ├── opportunity-patterns.md   # 14 patrones, llamadas válidas
│   │   │   ├── ecommerce-playbook.md
│   │   │   ├── hotels-playbook.md
│   │   │   ├── saas-playbook.md     # E10
│   │   │   └── state-schema.md      # E5
│   │   └── examples/output.md
│   ├── <11 skills existentes>/SKILL.md + examples/output.md
│   └── calibrate-watchdog/SKILL.md  # E3
├── evals/
│   ├── mcp-schema.json
│   ├── lint-tool-calls.mjs
│   ├── fixtures/<escenario>/*.json
│   ├── mock-server/
│   └── cases/*.yaml
├── scripts/build-plugin.sh
└── docs/
    ├── especificacion-asistente-ia-sealmetrics.md
    └── PRD-seal-copilot-v1.md
```

---

## 7. Métricas de éxito

| Métrica | Objetivo v1.0 | Cómo se mide |
|---|---|---|
| Llamadas inválidas en skills | 0 | Linter E7.1 en CI |
| Casos de eval en verde | ≥90% | Suite E7.4 por release |
| Skills ejecutables extremo a extremo contra el MCP real | 12/12 (+ calibrate) | Ejecución manual documentada en CHANGELOG por release |
| Cumplimiento del presupuesto de llamadas | ≥95% de ejecuciones | `runs.jsonl` + hook de conteo |
| Recomendaciones con seguimiento cerrado | ≥60% verificadas a las 4 semanas | `recommendations.jsonl` |
| Tiempo a primer informe (usuario nuevo con token) | <5 min, 1 conversación | Test de onboarding con fixture `no-api-key` → `ecommerce-healthy` |
| Instalaciones activas (uso ≥1 skill/semana) | ≥20 clientes en 6 semanas tras 1.0 | Logs del MCP por API key |

---

## 8. Fases y estimación

| Fase | Epics | Versión | Esfuerzo | Salida |
|---|---|---|---|---|
| **1 · Compatibilidad** | E1, E2, E3 (modo interino), E4 | 0.4.0 | 3–4 días | Todas las skills ejecutables contra el MCP real. Linter manual. |
| **2 · Infraestructura** | E5, E6, E7, E9 | 0.5.0 | 1–2 semanas | Estado, agente, hooks, evals con mock, onboarding robusto. |
| **3 · Profundidad** | E8, E10, E11, E12 | 1.0.0 | 1 semana | Golden outputs, SaaS, cobertura completa del MCP, release limpia. |
| **Paralelo · MCP** | Timeseries horario (E3.1), filtros en `get_property_breakdown` (E4.4), retirada o coexistencia de `get_marketing_playbook` (E2.1) | `@sealmetrics/mcp` | A estimar por el equipo del MCP | Desbloquea el watchdog completo y el drill por SKU barato. |

---

## 9. Riesgos y dependencias

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El MCP no añade el tool de series horarias | cart-watchdog queda en modo interino (calibración manual, baseline de 24 celdas en sites grandes) | Diseñado el modo interino en E3.2; documentar la limitación en README |
| `claude plugin eval` no disponible en el plan | Sin suite oficial | Runner propio sobre `claude -p` + mock server (E7.4) |
| Frontmatter avanzado (`context: fork`, `agent`, `allowed-tools`, hooks de plugin) cambia entre versiones de Claude Code | Skills que no cargan o cargan sin restricciones | Verificar contra la doc de skills al implementar E6; fallback: instrucciones en prosa dentro del skill |
| El estado en `~/.seal-copilot/` no existe en entornos sandbox (Cowork web) | Skills degradan a modo sin memoria | Toda lectura de estado es opcional: si no hay archivo, se ejecuta el descubrimiento y se avisa de que no se pudo guardar |
| `get_marketing_playbook` sigue disparándose por su descripción "Call this FIRST" | Metodologías contradictorias | Instrucción explícita en core (E2.1) + petición al equipo MCP de suavizar la descripción |
| Escritura de channel rules (E11) aplicada sin querer | Cambia la clasificación de canales del cliente | Confirmación explícita obligatoria, `test_channel_rules` antes, y registro en `runs.jsonl` |

---

## 10. Preguntas abiertas

1. ¿El equipo del MCP puede comprometer `get_microconversions_timeseries` para la ventana de la fase 2? Sin él, el watchdog se lanza en modo interino.
2. ¿Se retira `get_marketing_playbook` del MCP, se mantiene para usuarios sin plugin, o se convierte en un tool que devuelve el mismo contenido que el core skill del plugin (una sola fuente, dos entregas)?
3. Ubicación del estado: `~/.seal-copilot/` (propuesto) frente a un directorio de datos del plugin gestionado por Claude Code. Depende de qué garantiza la plataforma en Cowork.
4. ¿Distribución vía marketplace oficial de Anthropic, marketplace propio de Sealmetrics, o ambas? Afecta a E12.
5. ¿Se anonimizan fixtures de clientes reales (con permiso) o se generan sintéticas? Las reales dan evals mucho más fieles.

---

## Anexo A · Matriz skill × herramienta (v1.0 objetivo)

| Skill | Herramientas principales | Presupuesto |
|---|---|---|
| seal-copilot (core) | list_sites, get_site, get_overview, list_property_keys, list_microconversion_types, search_docs | 4 (descubrimiento cacheado) |
| weekly-health-check | get_overview, get_channels ×2 (presets calendario), get_campaigns, get_bot_stats(days), + seguimiento de recomendaciones | 8 |
| monday-briefing | get_overview, get_top_channels, get_top_campaigns, get_campaigns, get_device_types, get_countries, get_microconversions, get_bot_stats | 15 |
| diagnose-drop | get_overview, get_bot_stats, get_channels ×2, get_campaigns, get_landing_pages, get_terms, get_devices, get_countries, get_browsers, get_property_breakdown, get_overview(yoy) | 12 |
| opportunity-scan | get_overview, get_channels, get_conversions, get_campaigns, get_landing_pages, get_device_types, list_property_keys, get_property_breakdown, get_landing_pages_by_content_group, get_bot_stats | 12 |
| funnel-analysis | get_funnel, list_microconversion_types, get_microconversions, get_microconversion_details (filtros), get_property_breakdown | 10 |
| product-friction | list_property_keys, get_property_breakdown ×2, get_conversion_items_raw, get_microconversions_raw | 12 |
| calibrate-watchdog (nuevo) | list_microconversion_types, get_microconversions_raw (paginado) o get_microconversions_timeseries | ≤40 (manual) |
| cart-watchdog | get_microconversions, get_microconversions_raw, get_bot_stats, get_microconversion_details | 6 |
| channel-mix-optimizer | get_channels ×2, list_channel_rules, get_traffic_mediums, get_conversions (por medio), get_campaigns | 10 |
| property-explorer | list_property_keys ×3, get_property_breakdown, get_property_values, list_segments | 15 |
| cost-reduction | get_bot_stats, get_suspicious_sessions, get_pages, get_microconversions, get_campaigns, get_terms, get_countries, list_alerts, get_alert_stats, list_webhooks, get_webhook_stats, list_segments | 12 |
| setup-audit | get_site, get_overview, list_microconversion_types, list_property_keys, get_conversions, list_channel_rules, get_traffic_sources, get_top_campaigns, list_alerts, get_bot_stats, verify_event_instrumented, get_instrumentation_guide, test_channel_rules | 12 |

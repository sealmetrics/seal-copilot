# PRD — Seal Copilot v1.0 ("nivel top")

**Versión:** 1.0 · **Fecha:** 7 septiembre 2026 · **Autor:** Rafa (Sealmetrics) con Claude
**Estado:** Borrador para revisión · **Base:** auditoría del plugin v0.3.0 contra el MCP `@sealmetrics/mcp` (61 herramientas, esquemas verificados el 07/09/2026)
**Addendum 1.1 (12 septiembre 2026):** E13 alertas en lenguaje natural y E14 remediación de D1/D2, al final del documento. Base: [auditoría 1.11.0](auditoria-seal-copilot-2026-09-12.md).

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

> **Superado en parte por 1.6.0 y por el addendum 1.1 (E14, D2).** La fila de
> `get_channels` de la tabla siguiente propone sustituirlo por dos llamadas a
> `get_channels` con presets calendario. Eso ya no vale: la herramienta
> devuelve 403 con cualquier clave moderna y el conector remoto no la anuncia.
> La sustitución correcta es `get_top_channels`, y el linter lo impone.

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

> Corregido por el addendum 1.1 (E14, D2): donde decía `get_channels` dice
> `get_top_channels`. `get_channels` devuelve 403 con cualquier clave moderna y
> el conector remoto ni siquiera lo anuncia. Las filas que citan herramientas
> de alertas, segmentos, reglas de canal o verificación de eventos solo aplican
> al conector local; ver E14, D1.

| Skill | Herramientas principales | Presupuesto |
|---|---|---|
| seal-copilot (core) | list_sites, get_site, get_overview, list_property_keys, list_microconversion_types, search_docs | 4 (descubrimiento cacheado) |
| weekly-health-check | get_overview, get_top_channels ×2 (presets calendario), get_campaigns, get_bot_stats(days), + seguimiento de recomendaciones | 8 |
| monday-briefing | get_overview, get_top_channels, get_top_campaigns, get_campaigns, get_device_types, get_countries, get_microconversions, get_bot_stats | 15 |
| diagnose-drop | get_overview, get_bot_stats, get_top_channels ×2, get_campaigns, get_landing_pages, get_terms, get_devices, get_countries, get_browsers, get_property_breakdown, get_overview(yoy) | 12 |
| opportunity-scan | get_overview, get_top_channels, get_conversions, get_campaigns, get_landing_pages, get_device_types, list_property_keys, get_property_breakdown, get_landing_pages_by_content_group, get_bot_stats | 12 |
| funnel-analysis | get_funnel, list_microconversion_types, get_microconversions, get_microconversion_details (filtros), get_property_breakdown | 10 |
| product-friction | list_property_keys, get_property_breakdown ×2, get_conversion_items_raw, get_microconversions_raw | 12 |
| calibrate-watchdog (nuevo) | list_microconversion_types, get_microconversions_raw (paginado) o get_microconversions_timeseries | ≤40 (manual) |
| cart-watchdog | get_microconversions, get_microconversions_raw, get_bot_stats, get_microconversion_details | 6 |
| channel-mix-optimizer | get_top_channels ×2, list_channel_rules, get_traffic_mediums, get_conversions (por medio), get_campaigns | 10 |
| property-explorer | list_property_keys ×3, get_property_breakdown, get_property_values, list_segments | 15 |
| cost-reduction | get_bot_stats, get_suspicious_sessions, get_pages, get_microconversions, get_campaigns, get_terms, get_countries, list_alerts, get_alert_stats, list_webhooks, get_webhook_stats, list_segments | 12 |
| setup-audit | get_site, get_overview, list_microconversion_types, list_property_keys, get_conversions, list_channel_rules, get_traffic_sources, get_top_campaigns, list_alerts, get_bot_stats, verify_event_instrumented, get_instrumentation_guide, test_channel_rules | 12 |

---

# Addendum 1.1 — 12 septiembre 2026

Dos epics nuevos sobre el árbol 1.11.0, a partir de la [auditoría del 12/09](auditoria-seal-copilot-2026-09-12.md). Restricciones fijadas por producto: no se hace trabajo alguno sobre bots ni sobre `get_bot_stats`; coste y ROAS entrarán por conectores de Google Ads / Meta Ads o por CSV (epic aparte, fuera de este addendum).

## E13 · Alertas en lenguaje natural — P0

### Objetivo

Que un cliente escriba *"avísame si durante 4 horas seguidas no tengo conversiones"* y a partir de ese momento exista una comprobación programada que calla mientras todo va bien y avisa con evidencia cuando no. Generaliza `cart-watchdog`, que ya es exactamente esa alerta con una única regla fija.

### Dos vías, una interfaz

| Vía | Dónde se evalúa la regla | Entrega | Depende de |
|---|---|---|---|
| **A · Plugin** (este epic) | Tarea programada del host que ejecuta `check-alerts` | Notificación de la app; Slack o correo si el cliente tiene ese conector en la sesión | Nada fuera del repo |
| **B · Producto** (futuro) | Motor de alertas del backend, siempre encendido | Email y webhook nativos, ya existentes | `create_alert` / `update_alert` / `delete_alert` en el MCP, más un scope de escritura que hoy ni API key ni OAuth pueden llevar |

`create-alert` se diseña para la vía A y usa la vía B cuando el MCP anuncie `create_alert`: misma gramática de reglas, distinto destino. El cliente no nota el cambio.

> **Actualizado el 14/09 ([Addendum 1.2](#addendum-12--14-septiembre-2026), E15):** la vía B pasa a ser la principal. El email y los webhooks "ya existentes" existen como API, pero ninguna regla se evalúa hoy, y la vía A choca con los límites de las rutinas.
>
> **Actualizado el 17/09 ([PRD Seal Watch](PRD-seal-watch-v1.md)):** la vía A está hecha, pero no con una tarea del host. Un servicio propio evalúa la misma gramática cada cinco minutos leyendo `/stats/`, que `stats:read` cubre, así que no necesitó ningún cambio en `sealmetrics2`. La vía B sigue siendo el destino: cuando llegue, las reglas se traducen porque la gramática es la de su diseño. Antes de implementar E15, leer ese PRD y el §11 de incidencias: el motor nativo hereda tres huecos que el vigilante ya resolvió (el veredicto ante una lectura fallida, las horas vigiladas, y los incidentes frente a las evaluaciones).

### Gramática de reglas

Una regla es un objeto que cualquier skill puede leer y que cabe en un prompt:

```json
{
  "id": "no-conversions-4h",
  "site_id": "demo-store",
  "family": "silence",
  "metric": { "kind": "conversion", "type": "purchase" },
  "filter": { "utm_source": null, "utm_medium": null, "utm_campaign": null, "device_type": null, "country": null },
  "condition": { "hours": 4 },
  "active_hours": { "from": 8, "to": 24, "days": ["mon","tue","wed","thu","fri","sat","sun"] },
  "cadence_minutes": 60,
  "timezone": "Europe/Madrid",
  "expected": null,
  "deliver": ["app"],
  "created_at": "2026-09-12",
  "expires_at": "2027-03-12",
  "status": "active"
}
```

Campos:

- `metric.kind` — `conversion`, `microconversion`, `revenue`, `entrances`. `type` es el nombre real del evento en el site, resuelto contra `list_microconversion_types` o `get_conversions`, nunca el nombre canónico.
- `filter` — los filtros que las herramientas del MCP aceptan de verdad para esa métrica. Un filtro que la herramienta no soporte se rechaza en la creación, no se ignora en silencio.
- `family` y `condition` — ver tabla siguiente.
- `active_hours` — obligatorio en `silence` y `drop`. Cero conversiones a las 4 de la mañana es normal en la mayoría de sites; sin este campo la alerta es ruido y se apaga a la semana.
- `cadence_minutes` — frecuencia de la comprobación. Regla: nunca mayor que la mitad de la ventana (`condition.hours × 30`), con mínimo 30 minutos.
- `expected` — solo en `drop` y `spike`: la expectativa se **embebe en la regla al crearla** (del baseline del watchdog si existe, si no del mismo día de la semana anterior), para que la evaluación no necesite ningún archivo.
- `expires_at` — seis meses. Una alerta que nadie revisa caduca; el briefing del lunes avisa el mes anterior.

### Familias soportadas en v1

| Familia | Ejemplo del cliente | Evaluación (sin estado) | Llamadas |
|---|---|---|---|
| **silence** | "4 h seguidas sin conversiones", "2 h sin add_to_cart en móvil" | Total del día con `get_conversions(period=today, …filtros)` o `get_microconversions(conversion_type=T, period=today)`. Si es 0, el silencio dura desde el inicio de las horas activas de hoy; si el inicio fue hace menos de N horas, se amplía la ventana a ayer con `start_date`/`end_date`. Si es >0, una llamada `*_raw` a la **última página** (`page = ceil(total/100)`) da `timestamp_local` del último evento. Dispara cuando `ahora − último evento ≥ N horas` dentro de horas activas | 1–2 |
| **drop** | "si a media tarde llevo menos de la mitad de lo normal", "si el revenue de hoy va un 40% por debajo del martes pasado" | Total del día hasta ahora frente a `expected[dow][hour]` embebido. Con baseline del watchdog, la expectativa es la acumulada por celda; sin él, la del mismo día de la semana pasada repartida linealmente por horas activas, y el aviso dice que la comparación es gruesa. Dispara bajo el ratio pedido, con mínimo de 5 eventos esperados para juzgar | 1 |
| **spike** | "si el tráfico de una campaña se triplica en una hora" | Espejo de `drop`. Sin validación de bots (fuera de alcance): el aviso dice que el pico no está validado y sugiere mirar el referrer | 1–2 |
| **threshold** | "si el revenue de hoy no llega a 2.000 €", "si `brand-es` baja de 10 conversiones al día" | `get_overview(period=today)` o `get_campaigns(period=today, utm_campaign=…)`. Se evalúa solo en la última comprobación de las horas activas, o en cada una si el cliente pide "en cuanto pase" | 1 |

Fuera de v1, y dicho al cliente cuando lo pida: reglas sobre bots, sobre segmentos guardados, sobre métricas que exijan más de dos llamadas, y comparaciones multi-site.

### Skill `create-alert`

`disable-model-invocation: true` no procede: el cliente la invoca en lenguaje natural. Triggers: "avísame si", "crea una alerta", "quiero saber cuando", "alert me when", "notify me if", "mis alertas", "borra la alerta".

Procedimiento, presupuesto ≤3 llamadas:

1. **Parsear** la frase a la gramática. Lo que no esté dicho se pregunta, no se supone: la métrica exacta si hay ambigüedad, las horas activas, y el destino de la entrega. Una pregunta, con todas las dudas juntas.
2. **Verificar que la métrica existe** en el site (una llamada: `list_microconversion_types` o `get_conversions(period=30d)`), y que tiene volumen suficiente para la familia elegida: una regla `silence` de 4 h sobre un evento que ocurre 3 veces al día dispararía cada tarde. Regla: la mediana de eventos por ventana activa debe ser ≥5; si no, proponer una ventana mayor o la familia `threshold` diaria.
3. **Calcular `expected`** para `drop`/`spike`: del `watchdog-baseline.json` si existe y no ha caducado; si no, una llamada al mismo día de la semana pasada.
4. **Compilar** la regla en un prompt autocontenido: la regla en JSON, el nombre de la skill que la evalúa (`check-alerts`) y la instrucción de que la salida es la respuesta entera. Ese prompt no depende de ningún archivo.
5. **Registrar** la comprobación en el programador del host. En Claude Code, la rutina programada con la cadencia y la zona horaria del site; en Cowork, la tarea programada equivalente; en Codex y Claude.ai, entregar el prompt y las instrucciones para programarlo, porque el plugin no puede hacerlo por el cliente allí.
6. **Persistir** la regla en `<state-dir>/<site_id>/alerts.json` cuando hay sistema de archivos, para que "mis alertas" y "borra la alerta X" funcionen. Sin sistema de archivos, la lista vive en el programador del host y la skill lo dice.
7. **Responder** en ≤8 líneas: la regla en una frase, la cadencia, el destino, la primera comprobación, y cómo borrarla.

Gestión: "mis alertas" lista `alerts.json` y las rutinas registradas; "borra la alerta X" cancela la rutina y marca `status: deleted`. Nunca se borra una rutina sin nombrarla y sin confirmación.

### Skill `check-alerts`

`disable-model-invocation: true`. Se ejecuta solo desde una tarea programada, con la regla dentro del prompt. Presupuesto ≤3 llamadas por regla.

1. **Fuera de horas activas** → una línea y fin. Ninguna llamada.
2. **Evaluar** según la familia (tabla anterior).
3. **Si no dispara** → la respuesta entera es una línea: `🟢 <regla>: <valor actual> · último evento hace <t>`. En ejecución programada, ni saludo ni contexto.
4. **Si dispara** → formato fijo, ≤12 líneas: `🔴 <regla>` · evidencia con números y ventana · **hora en que empezó el silencio o la caída** (es lo que el cliente cruza con su log de despliegues) · una acción concreta ("abre una ficha de producto en móvil y prueba a comprar ahora") · qué no se ha comprobado (bots, siempre).
5. **Entrega**: si la regla pide Slack o correo y la sesión tiene ese conector, publicar el bloque tal cual; si no lo tiene, decirlo una vez y dejar el aviso en la app.
6. **Cooldown**: con sistema de archivos, `last_fired` en `alerts.json` y no repetir hasta que la condición se resuelva y vuelva; sin él, la cadencia acota la repetición y el aviso lleva "sigue activa desde <hora>" calculada de la evidencia, no de un estado.
7. Registrar en `runs.jsonl` con los campos exactos del esquema; `budget` es `3` por regla.

### Interacción con el resto del plugin

- `cart-watchdog` y `calibrate-watchdog` no cambian: el watchdog es una regla `drop` premium con baseline de 168 celdas. `create-alert` lo reutiliza como `expected` cuando existe y lo recomienda cuando el cliente pide una regla `drop` sin baseline.
- `monday-briefing` gana un bloque `🔔 ALERTAS` de una línea: cuántas activas, cuántas dispararon la semana pasada, cuáles caducan el mes que viene.
- `setup-audit` paso 8 ("¿alguien vigila?") deja de mirar `list_alerts` (oculto en el conector por defecto, ver E14) y mira `alerts.json`: un site sin ninguna alerta es un gap S con la acción "crea una con `create-alert`".

### Evals (fixtures nuevas: `alerts-silence-fires`, `alerts-silence-quiet-hours`, `alerts-drop-with-baseline`)

| Caso | Prueba |
|---|---|
| `create-alert-writes-a-valid-rule` | La frase "avísame si 4 h sin conversiones" produce una regla válida contra un JSON Schema de la gramática, con `active_hours` preguntadas o inferidas del baseline, y `stateMustContain` la regla |
| `create-alert-refuses-noisy-rule` | Evento con 3 eventos/día y ventana de 2 h → no crea la regla, propone ventana o familia alternativa |
| `check-alerts-fires-with-start-time` | Fixture con último evento hace 5 h dentro de horas activas → 🔴, nombra la hora del último evento, ≤3 llamadas |
| `check-alerts-silent-when-healthy` | Último evento hace 20 min → la respuesta es una sola línea |
| `check-alerts-respects-active-hours` | Ejecución a las 03:00 → una línea, cero llamadas |
| `check-alerts-drop-uses-embedded-expected` | Sin sistema de archivos, la regla lleva `expected` y el veredicto sale de él |
| `check-alerts-never-claims-bots` | Ningún caso de alerta contiene una cifra de bots en tabla; el aviso dice "no validado" |

Test de fidelidad numérica (auditoría §5.3.14) aplicado a todos.

### Qué hay que verificar antes de escribir una línea

1. **Dónde corre la tarea programada en cada superficie y si ve el conector OAuth del cliente.** Si la rutina de Claude Code corre en la nube sin el conector, la vía A solo vale en Cowork y en sesiones locales, y el README lo tiene que decir. Es la incógnita que decide el alcance.
2. **Orden de las filas de `*_raw`.** La evaluación de `silence` asume que la última página contiene el evento más reciente. Capturar contra el servidor real, como se hizo con las formas de respuesta el 08/09.
3. **Zona horaria de `period=today`.** La metodología dice que es la del site; confirmarlo para un site en América con cuenta en Europa.

### Métricas de éxito

| Métrica | Objetivo |
|---|---|
| Reglas creadas que siguen activas a los 30 días | ≥70% (una regla que se borra es una regla que hizo ruido) |
| Avisos por regla y semana | ≤2 de media; por encima, la creación fue demasiado sensible |
| Avisos con hora de inicio nombrada | 100% |
| Llamadas por comprobación | ≤3, medido en `runs.jsonl` |

## E14 · Remediación de D1 y D2 — P0

Ambos conocidos antes de la auditoría; aquí queda la solución acordada, sin trabajo sobre bots.

### D1 · El conector por defecto no anuncia 20 herramientas

**Principio:** el plugin no promete nada que el conector con el que se instala no pueda cumplir, y no gasta una llamada en descubrirlo.

1. **La metodología pasa a ser consciente del transporte.** Nueva regla en `methodology.md`, sección "A successful call can still be a failure": *una herramienta que no aparece en tu lista de herramientas está ocultada por el conector; no la intentes, no la menciones más de una vez, y anota `connector: "remote"` en `profile.json`*. El perfil gana el campo `connector` (`remote` | `local`), escrito por la primera skill que corra, deducido de si `get_channels` está o no en la lista anunciada. Con eso cada skill sabe de antemano qué pasos saltar. El intento único de `get_bot_stats` queda solo para `connector: local`; en remoto la línea "Not checked" se emite sin llamada, una vez, y se deja de recomendar activar agent analytics.
2. **`install-sealmetrics` sale del plugin.** Pasa a un plugin hermano `seal-install` en el mismo marketplace, con su propio `.mcp.json` sobre stdio y `SEALMETRICS_API_KEY`, y con la skill tal como está. El plugin principal deja de disparar con "instala Sealmetrics": el core responde con una línea que nombra `seal-install` y por qué necesita el servidor local. El eval `install-reuses-existing-site` se muda con la skill.
3. **`cost-reduction`** pierde los patrones 1, 6 y 7 en remoto. La lista de patrones se declara con una columna `requires: local`, y la línea "Remaining patterns" del informe dice "no disponible con este conector" en lugar de "clean". Quedan 5 patrones que sí ejecutan.
4. **`setup-audit`** reescribe tres pasos: el 6 (reglas de canal) detecta cpc bajo "Referral" cruzando `get_traffic_mediums` con `get_top_channels`, que sí están, y propone el texto de la regla para que el cliente lo pegue en el dashboard, sin `test_channel_rules` ni escritura; el 8 mira `alerts.json` de E13; la verificación de eventos con `verify_event_instrumented` pasa a ser "cuenta ≥10 eventos/día" desde `get_microconversions`, que es lo que ya hace el paso 9. La sección "Channel rules — the one place this plugin can write" se marca `local only`.
5. **`property-explorer`** elimina el paso de segmentos en remoto; **`channel-mix-optimizer`** hace del fallback por medios la vía principal.
6. **Linter.** `evals/gated-tools.json` con las 20 herramientas. Regla nueva: una referencia a una herramienta ocultada solo pasa si la misma frase contiene el marcador `(local only)` o está en un archivo de `seal-install`. Hoy el linter solo comprueba existencia; esto habría detectado los pasos afectados de tres skills.
7. **Evals en los dos transportes.** El mock gana `SEAL_TRANSPORT=remote|local`: en remoto anuncia 42 herramientas y rechaza el resto como "unknown tool". Los casos de informe (`healthy-says-so`, `drop-isolates-campaign`, `opportunity-scan-finds-the-leak`, `monday-briefing-is-one-page`, `refused-calls-are-named-not-hidden`) corren en ambos y deben pasar en ambos. Un caso nuevo, `remote-never-attempts-hidden-tools`, exige cero llamadas rechazadas y una única línea "Not checked".
8. **Lado MCP, sin cambios de scope:** aplicar en el transporte local el mismo gate que en el remoto, tal como está redactado en `docs/mcp-server-local-gate.md`. Con eso `connector` pasa a tener un único valor y los puntos 1 y 6 se simplifican en la siguiente versión.

### D2 · Referencias activas a `get_channels`

1. **Cuatro sustituciones.** `methodology.md` jerarquía de causas paso 2, `opportunity-patterns.md` patrón 8, `hotels-playbook.md` análisis 1, y la fila "Entrances: from get_channels" de `channel-mix-optimizer`: todas a `get_top_channels` sobre un par de calendario. Añadir `get_marketing_playbook` a la misma revisión: solo puede aparecer en la frase que lo prohíbe.
2. **Linter.** `FORBIDDEN_TOOLS = ['get_channels', 'get_marketing_playbook']`. Una referencia pasa solo si la frase que la contiene incluye una negación (`never`, `not`, `do not`, `403`, `refuse`, `hidden`). Verificar el linter reintroduciendo el patrón 8 tal como está hoy: debe fallar.
3. **Evals.** `assess.mjs` gana `globalMustNotCall`, aplicado a todos los casos, con esas dos herramientas. Ningún caso puede pasar habiéndolas llamado, tenga o no `mustNotCall` propio.
4. **Anexo A** de este PRD: las filas de weekly-health-check, diagnose-drop, opportunity-scan y channel-mix-optimizer siguen listando `get_channels`; corregirlas a `get_top_channels` en la misma revisión.

### Esfuerzo y orden

| Bloque | Esfuerzo | Va antes de |
|---|---|---|
| D2 completo | Medio día | Todo lo demás: es la corrección más barata y la que hoy produce "Access denied" en informes |
| D1 puntos 1, 3, 4, 5, 6 | Un día | E13, porque `setup-audit` paso 8 y la regla de transporte son prerrequisito |
| D1 punto 2 (`seal-install`) | Un día | Publicación en marketplace |
| D1 punto 7 (mock en dos transportes) | Un día | Certificación de la versión |
| E13 `create-alert` + `check-alerts` + 7 evals | Una semana, tras verificar las tres incógnitas | Versión 1.12.0 |

---

# Addendum 1.2 — 14 septiembre 2026

Sustituye la vía A de E13 (rutinas programadas del host) por la vía B (motor de alertas de Sealmetrics) como camino principal. La gramática de reglas, las cuatro familias y la regla de ruido de E13 se mantienen; cambia dónde se evalúan.

## E15 · Alertas nativas de Sealmetrics — P0

### Por qué se cambia de vía

La vía A no ha funcionado nunca de principio a fin. La prueba real del 14/09 y la documentación de rutinas de Claude Code lo explican:

| Límite de las rutinas | Consecuencia para una alerta |
|---|---|
| Tope diario de ejecuciones por cuenta | Una regla horaria son hasta 24 ejecuciones al día; dos o tres reglas agotan el tope |
| Intervalo mínimo de 1 hora | "4 h sin compras" se detecta con hasta una hora de retraso, y la cadencia de 30 min de E13 se rechaza |
| El plugin solo llega si un repositorio lo declara en `.claude/settings.json` o si se activa como plugin sincronizado | Un marketing manager no va a crear un repositorio para tener una alerta |
| Cada ejecución es una sesión de modelo con consumo de suscripción | Contar clics cada hora con un LLM es caro y no determinista |
| Al crear la rutina se incluyen todos los conectores de la cuenta | Las rutinas creadas en pruebas llevaban Gmail, Stripe y Drive para leer un contador |
| Solo existe en Claude Code y Cowork | Codex y Claude.ai no tienen alertas |

Un evaluador en el backend no tiene ninguno de estos límites: está siempre encendido, es barato, es determinista, entrega por email, Slack o webhook y no depende del cliente de IA que use el cliente.

### Estado real del backend (verificado en `sealmetrics2`, main 57b2f55c, 10/09)

El producto tiene la **superficie** de alertas y webhooks, pero **ninguna regla se evalúa**. La documentación pública (`docs.sealmetrics.com/api/alerts`, `/api/webhooks`) describe un sistema que no existe.

| Pieza | Estado | Evidencia |
|---|---|---|
| CRUD de reglas, historial, stats, test | Existe | `api/src/sealmetrics_api/routers/alerts.py`, tablas en `postgres/migrations/20251229000007_anomaly_alerts.sql` |
| Evaluación de reglas | **No se ejecuta nunca**: `check_and_trigger()` no tiene llamadas fuera de los tests; ni cron, ni consumer, ni servicio | `services/alerts.py:228`; `config/crons.yaml` no lo nombra |
| Fuente de datos del evaluador | **Rota**: lee `sealmetrics.events`, que es `ENGINE = Null()`, y columnas `is_entrance`/`is_bounce` que no existen | `services/alerts.py:392,425,445`; `clickhouse/init/production/001_schema_cluster.sql:51` |
| Condiciones | Solo `percentage_change` y `absolute_threshold`; `std_deviation` y `rate_of_change` nunca disparan; un baseline de 0 no dispara nunca, así que **"cero conversiones" es imposible de expresar** | `services/alerts.py:258,268-282` |
| Métricas y filtros | Sin `revenue`, sin microconversiones, sin `conversion_type`, sin campaña, canal, país ni dispositivo | `models/alerts.py:23-33`; `services/alerts.py:389-402` |
| Zona horaria, horas activas, severidad | No existen; se evalúa en UTC | — |
| Email / Slack / webhook por regla | Existe, envío en línea, sin reintentos ni firma | `services/alerts.py:469-588` |
| Subsistema de webhooks firmado | Existe y está desplegado (RabbitMQ + `consumer-webhook`, HMAC, reintentos 60 s/300 s/1800 s, dead letter), pero solo lo usa `/test`: de los cinco tipos de evento, solo `alert.triggered` tiene llamada, y está en el camino que nunca corre | `services/webhook_dispatcher.py`; `models/webhooks.py:12-19` |
| Permisos | Leer y escribir alertas exige los scopes `read`/`write`, que **solo tiene una sesión del dashboard**. Ni API key ni OAuth pueden ni siquiera listar | `models/api_tokens.py:35`; `auth/models.py:14-19` |
| MCP | 6 herramientas, todas de lectura, que con API key siempre dan 403 y que el conector remoto oculta | `mcp-server/src/tools/alerts.ts`, `webhooks.ts`; `remote/gate.ts:18-36` (RF-RMT25) |
| Dashboard | Hay un hook `use-alerts.ts` que ningún componente usa | `dashboard/src/hooks/index.ts:80-89` |
| LENS | Sistema aparte de anomalías automáticas, documentado como "built but not active" | `docs/docs/lens/anomaly-detection/index.mdx:17-19` |

Dos hallazgos más que afectan al diseño:

- **Las vistas "horarias" de conversiones no son horarias.** `conversions_hourly_mv` y `microconversions_hourly_mv` calculan `toStartOfHour(toDateTime(date))` sobre una columna `Date`: todas las filas caen a las 00:00. El evaluador no puede usarlas; debe leer las tablas crudas por `timestamp_utc` (columna presente desde la migración 026, 03/05/2026).
- **La documentación de webhooks contradice al código**: dice que el `secret` se devuelve al crear (no se devuelve; solo `rotate-secret` lo da), 5 intentos (son 4), que se rechaza HTTP (se acepta), y muestra un payload plano con `severity` y `expected_value` que no es el real. Sus ejemplos usan `X-API-Key`, que recibe 403.

### Reparto de responsabilidades

| Capa | Hace | No hace |
|---|---|---|
| **Backend** | Guarda la regla, la evalúa cada pocos minutos, abre y cierra incidentes, entrega el aviso con evidencia | Interpretar lenguaje natural |
| **MCP** | Expone crear, previsualizar, listar, pausar, borrar y reconocer reglas, en local y en remoto | Evaluar nada |
| **Plugin** | Convierte la frase en regla, verifica que el evento existe, enseña cuántas veces habría saltado, pide confirmación, crea, y explica un aviso cuando llega | Programar tareas del host ni evaluar reglas |

### Modelo de regla v2 (backend)

Se extiende `alert_rules` en lugar de crear una tabla nueva; los campos v1 siguen aceptándose y se traducen.

```json
{
  "name": "Sin compras 4 h",
  "source_text": "avísame si paso 4 horas seguidas sin ventas",
  "family": "silence",
  "metric": "conversions",
  "filters": { "conversion_type": "purchase", "utm_campaign": null, "utm_source": null, "utm_medium": null, "country": null, "device_type": null },
  "condition": { "window_minutes": 240 },
  "timezone": "Europe/Madrid",
  "active_hours": { "from": 8, "to": 24, "days": ["mon","tue","wed","thu","fri","sat","sun"] },
  "channels": { "email_user_ids": [12], "webhook_endpoint_ids": [], "slack_integration_id": null },
  "expires_at": "2027-03-14",
  "created_via": "mcp"
}
```

| Campo | Regla |
|---|---|
| `family` | `silence`, `drop`, `spike`, `threshold`: las cuatro de E13 |
| `metric` | `entrances`, `conversions`, `microconversions`, `revenue`. Añade las dos últimas al enum |
| `filters.conversion_type` | Obligatorio para `conversions` y `microconversions` cuando el site tiene más de un tipo: "sin ventas" no es "sin conversiones" |
| `condition` | `silence`: `window_minutes` (60–10080, libre, no el enum 15m/1h/6h/24h). `drop`/`spike`: `ratio` frente a lo esperado. `threshold`: `below`/`above` y `evaluate_at` (`end_of_active_day` o `immediately`) |
| `timezone` | Por defecto, la zona de la cuenta (`accounts.timezone` ya existe) |
| `active_hours` | Obligatorio en `silence` y `drop`, igual que en E13. Una ventana `silence` solo cuenta horas activas |
| `channels` | **Referencias, no direcciones.** Emails solo a usuarios de la cuenta; webhooks y Slack solo a endpoints ya registrados desde el dashboard. Ver *Seguridad* |
| `expires_at` | Seis meses; se avisa por email 14 días antes |
| `created_via`, `source_text` | Auditoría: quién la creó y con qué frase |

Lo esperado en `drop`/`spike` lo calcula el servidor: acumulado por hora del mismo día de la semana en las últimas 4 semanas, en la zona de la regla. No se embebe en la regla, porque el servidor tiene los datos.

### Evaluador

- **Servicio `alerts-evaluator`**, bucle cada 5 minutos (entrada nueva en `config/crons.yaml` o consumer dedicado). Cada regla guarda `next_evaluation_at`; `silence` se evalúa cada 5 min, `drop`/`spike` cada 15, `threshold` según `evaluate_at`.
- **Fuente**: tablas crudas `conversions` y `microconversions` filtradas por `account_id`, `date` (prefijo de la clave de ordenación) y `timestamp_utc`; `entrances` desde el agregado que ya usan los informes. Nunca `sealmetrics.events`.
- **`silence`**: `max(timestamp_utc)` del evento con sus filtros; dispara cuando las horas activas transcurridas desde ese instante alcanzan `window_minutes`.
- **Retraso de ingesta**: se evalúa hasta `now − lag`, con `lag` medido, no supuesto (pregunta abierta 1). Sin esto, cada evaluación ve un silencio falso de unos minutos.
- **Guarda de plataforma**: antes de disparar ningún `silence`, comprobar que la ingesta global está al día. Si el pipeline de Sealmetrics se retrasa, cada cliente con una regla de silencio recibiría un aviso a la vez. En ese caso se suprime y se alerta internamente.
- **Evidencia en el aviso**: valor actual, esperado, **hora a la que empezó el silencio o la caída**, y entradas en la misma ventana. Esto último separa los dos diagnósticos que el cliente necesita: "no entra tráfico" (el tracker o la web están caídos) de "entra tráfico y no convierte" (el checkout está roto).
- **Incidentes**: una fila de historial por incidente, no por evaluación. El incidente se cierra cuando la condición se recupera y emite `alert.resolved`. El cooldown pasa a significar "no reabrir antes de X minutos tras cerrar".
- **Ruido en vivo**: si una regla abre más de 2 incidentes por semana durante 3 semanas, se avisa al creador con la cifra y una propuesta de ventana mayor (métrica de éxito de E13).

### Previsualización: el endpoint que más importa

`POST /alerts/rules/preview`: recibe una regla sin guardarla y devuelve:

```json
{
  "valid": true,
  "current": { "state": "ok", "last_event_at": "2026-09-14T11:02:00+02:00", "value": 6 },
  "backtest_30d": { "would_have_fired": 1, "incidents": [ { "start": "2026-08-29T15:10:00+02:00", "end": "2026-08-29T20:40:00+02:00" } ] },
  "warnings": []
}
```

El backtest de 30 días sustituye la estimación de Poisson de `create-alert` por la cifra real: "en el último mes habría saltado 1 vez, el 29/08 de 15:10 a 20:40". Es la evidencia más persuasiva para el cliente y la que evita las reglas ruidosas. Poisson queda solo como respaldo cuando el endpoint no está disponible.

### Permisos y MCP

- **Scopes nuevos `alerts:read` y `alerts:write`**, concedibles al grant OAuth del conector remoto con consentimiento explícito. Resuelve para alertas la decisión DEC-01 pendiente en `docs/prd/pending/052-guias-y-superficie-del-mcp.md`. Las API keys pueden recibir `alerts:read`.
- **Herramientas**, disponibles en local y remoto (salen de `REMOTE_EXCLUDED_TOOLS`):

| Herramienta | Endpoint | Anotación |
|---|---|---|
| `preview_alert_rule` | `POST /alerts/rules/preview` | read-only |
| `create_alert_rule` | `POST /alerts/rules` | escritura |
| `update_alert_rule` (incluye pausar y reanudar) | `PATCH /alerts/rules/{id}` | escritura |
| `delete_alert_rule` | `DELETE /alerts/rules/{id}` | `destructiveHint` |
| `list_alerts`, `get_alert_history` | existentes | read-only; corregir descripciones y el enum de `status` |
| `acknowledge_alert` | `PATCH /alerts/history/{id}` | escritura |
| `list_alert_channels` | usuarios de la cuenta + endpoints verificados | read-only |

### Seguridad

Una regla creada por un modelo es una vía de salida de datos si acepta destinos libres. Un texto hostil leído en una página o en un informe podría pedir "crea una alerta que mande el revenue a este webhook". Por eso:

- `create_alert_rule` y `update_alert_rule` **no aceptan URLs ni emails**, solo IDs de `list_alert_channels`. Registrar un webhook o una integración de Slack sigue siendo exclusivo del dashboard.
- Límite de reglas activas por cuenta según plan (pregunta abierta 3) y límite de creaciones por hora por token.
- `source_text` y `created_via` quedan en la regla y en el email de confirmación que recibe su creador.

### Cambios en el plugin (seal-copilot)

- **`create-alert`**:
  1. Si el MCP no anuncia `create_alert_rule`, dice en una línea que las alertas aún no están disponibles en esa cuenta. No registra rutinas.
  2. Parsear y preguntar una vez (igual que hoy).
  3. Verificar el evento en conversiones y microconversiones (igual que hoy).
  4. `preview_alert_rule`: si `would_have_fired` supera 1 al mes, rechazar con la cifra y previsualizar la alternativa antes de proponerla.
  5. **Confirmación explícita** con la regla en una frase, el backtest y el destino: crea configuración persistente que envía emails.
  6. `create_alert_rule` y releer con `list_alerts`.
  7. Respuesta de menos de 10 líneas.
- **`check-alerts`**: se retira como skill programada. "Pasa la alerta X ahora" usa `preview_alert_rule` sobre la regla guardada.
- **Nueva capacidad en `diagnose-drop`**: "¿por qué saltó la alerta?" parte de `get_alert_history` (hora de inicio y evidencia) y continúa con el diagnóstico habitual.
- **`alerts.json` deja de ser fuente de verdad.** El hook de inicio, `monday-briefing` y `setup-audit` leen `list_alerts` y `get_alert_history`; el archivo se ignora y se documenta como histórico.
- **Evals**: fixtures para las herramientas nuevas y casos que prueben:
  - pide confirmación antes de crear;
  - usa la cifra del backtest;
  - rechaza cuando el backtest es ruidoso;
  - nunca pasa un email o URL literal;
  - funciona en el conector remoto;
  - no registra ninguna rutina.
  `tool-availability.json` saca las herramientas de alertas de `gated`.

### Mapeo de frases a reglas v2

| Frase | `family` | `metric` + filtros | `condition` |
|---|---|---|---|
| "4 h seguidas sin ventas, de 8 a 24" | `silence` | `conversions`, `conversion_type: purchase` | `window_minutes: 240` |
| "2 días sin clics en CTA" | `silence` | `microconversions`, `conversion_type: cta_click` | `window_minutes: 1440` (24 h activas = 2 días de 9 a 21) |
| "si a media tarde llevo menos de la mitad de lo normal" | `drop` | `conversions` | `ratio: 0.5` |
| "si una campaña triplica su tráfico en una hora" | `spike` | `entrances`, `utm_campaign` | `ratio: 3` |
| "si el revenue de hoy no llega a 2.000 €" | `threshold` | `revenue` | `below: 2000`, `evaluate_at: end_of_active_day` |

### Fases y estimación (orientativa)

| Fase | Contenido | Esfuerzo |
|---|---|---|
| 0 · Hacer que funcione lo que ya se anuncia | Evaluador que corre, lee tablas reales y respeta zona horaria; `absolute_threshold` y `percentage_change` correctos; medir el retraso de ingesta; corregir la documentación de alertas y webhooks | 4–6 días |
| 1 · Modelo v2 | `silence` con horas activas, `conversion_type` y filtros, `revenue` y microconversiones, lo esperado por día y hora, incidentes con `alert.resolved`, guarda de plataforma | 8–12 días |
| 2 · Previsualización y permisos | `/rules/preview` con backtest, scopes `alerts:*` en OAuth, herramientas MCP, `list_alert_channels`, límites | 5–7 días |
| 3 · Plugin | `create-alert` sobre el MCP, retirada de `check-alerts` y de las rutinas, lecturas en hook, briefing y auditoría, evals | 3–4 días |
| 4 · Dashboard (opcional para lanzar) | Pantalla de alertas sobre `use-alerts.ts` | 3–5 días |

Ruta crítica: fases 0 → 1 → 2 en el backend. El plugin no puede lanzar nada hasta la 2.

### Qué hacer con la vía A mientras tanto

**Recomendación: retirar ya el registro de rutinas de `create-alert`.** La skill sigue convirtiendo la frase en regla, verificando el evento y aplicando la regla de ruido. Guarda la regla en `alerts.json` y dice claramente que el aviso automático llegará con las alertas nativas. Mantener rutinas que nunca han funcionado es prometer una vigilancia que no existe.

### Preguntas abiertas

1. **Retraso de ingesta** entre el evento y su fila en `conversions`: define el `lag` del evaluador y la precisión mínima de `silence`.
2. **Relación con LENS**: ¿las anomalías automáticas de LENS se entregan por el mismo canal y historial, o siguen separadas?
3. **Límite de reglas por plan** y si las alertas requieren suscripción activa (hoy el router de alertas sí la exige y el de webhooks no).
4. **Idioma del email**: el de la cuenta o el de la frase.
5. **Consentimiento OAuth**: ¿`alerts:write` en el grant por defecto del conector o como ampliación que el usuario acepta al crear la primera alerta?

### Métricas de éxito

Las de E13 se mantienen (≥70 % de reglas activas a 30 días, ≤2 avisos por regla y semana, 100 % con hora de inicio). Se añaden:

| Métrica | Objetivo |
|---|---|
| Latencia de detección de un `silence` | ≤ `lag` + 5 min |
| Avisos suprimidos por la guarda de plataforma que resultaron ser caídas del pipeline | 100 % |
| Reglas creadas cuyo backtest estimaba ≤1 aviso al mes y luego avisan más de 2 veces al mes | ≤10 % |

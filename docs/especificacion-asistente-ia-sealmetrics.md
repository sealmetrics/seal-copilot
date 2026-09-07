# Especificación: Asistente de IA de Sealmetrics ("Seal Copilot")

**Versión:** 1.0 · **Fecha:** 12 junio 2026 · **Autor:** Rafa (Sealmetrics) con asistencia de Claude
**Estado:** Borrador para revisión interna

---

## 1. Resumen ejecutivo

Seal Copilot es un asistente de IA que conecta con los datos de Sealmetrics (vía el servidor MCP existente, ya operativo con 44 herramientas verificadas) y actúa como **consultor proactivo de optimización** para los clientes: no solo responde preguntas sobre sus datos, sino que detecta anomalías, encuentra oportunidades de optimización y propone acciones concretas con impacto estimado en revenue.

La ventaja diferencial frente a asistentes sobre GA4 u otras herramientas con consentimiento: Sealmetrics analiza el **100% del tráfico** con atribución last-click completa, por lo que las recomendaciones del asistente se basan en datos íntegros, no en muestras sesgadas por el consent rate. Esto es un argumento de venta del propio asistente: *"recomendaciones sobre el 100% de tus datos, no sobre el 40% que aceptó cookies"*.

**Verticales prioritarios:** Ecommerce y Hoteles.

**Recomendación de plataforma (sección 3):** lanzar en dos fases — (1) Plugin/Skill para Claude sobre el MCP existente como validación rápida con coste casi nulo, (2) asistente embebido en el dashboard de Sealmetrics vía Claude API como feature de producto monetizable.

---

## 2. Superficie de datos disponible (verificada)

El servidor MCP de Sealmetrics expone 44 herramientas. Verificado contra los esquemas reales del servidor el 12/06/2026. Agrupadas por función:

### 2.1 Descubrimiento y configuración
| Herramienta | Uso para el asistente |
|---|---|
| `list_sites`, `get_site` | Multi-site: resolver site_id, timezone, dominios |
| `get_tracking_code` | Soporte de implementación: píxel + referencia JS API |
| `list_channel_rules` | Entender cómo el cliente clasifica sus canales |
| `list_segments`, `get_segment` | Segmentos guardados aplicables a queries |

### 2.2 Rendimiento global
| Herramienta | Uso |
|---|---|
| `get_overview` | KPIs de partida: pageviews, entrances, bounce, conversiones, revenue. Series temporales + comparación `previous`/`yoy` |
| `get_funnel` | Análisis paso a paso con drop-off por etapa |

### 2.3 Adquisición (el corazón de la optimización de campañas)
| Herramienta | Uso |
|---|---|
| `get_channels`, `get_top_channels` | Rendimiento por canal (Paid, Organic, Social…) |
| `get_traffic_sources`, `get_top_sources` | Por utm_source, con conversiones y revenue, ordenable |
| `get_traffic_mediums` | Por utm_medium |
| `get_campaigns`, `get_top_campaigns` | Por utm_campaign, filtrable por source/medium, sort por revenue/conversiones/bounce |
| `get_terms`, `get_top_terms` | Keywords (utm_term) con conversiones y revenue |
| `get_top_referrers` | Dominios externos que más tráfico envían |

### 2.4 Conversión y comportamiento
| Herramienta | Uso |
|---|---|
| `get_conversions` | Por tipo (purchase, booking, signup), con revenue y AOV, filtrable por source/medium/país |
| `get_microconversions`, `list_microconversion_types`, `get_microconversion_details` | Eventos intermedios (add_to_cart, view_room, start_checkout…) segmentables por source/medium/campaign/país/dispositivo/browser/OS |
| `get_landing_pages`, `get_top_landing_pages` | Entrances, bounce, conversiones por landing |
| `get_pages`, `get_top_pages` | Rendimiento por URL |
| `get_content_groups`, `get_landing_pages_by_content_group` | Por agrupación de contenido (blog, producto, categoría) filtrable por UTM |

### 2.5 Propiedades custom (diferencial clave)
| Herramienta | Uso |
|---|---|
| `list_property_keys` | Descubrir qué propiedades trackea el cliente (talla, color, room_type…) en conversions, microconversions o conversion_items |
| `get_property_breakdown` | Pivot por propiedad: counts + revenue por valor |
| `get_property_values` | Valores de una propiedad cruzados por utm_source/medium/campaign |

Esto permite responder preguntas imposibles en analítica estándar: *"¿qué canal vende más talla XL?"*, *"¿qué campaña trae reservas de suite vs estándar?"*.

### 2.6 Audiencia y contexto
`get_countries`, `get_devices`, `get_device_types`, `get_browsers`, `get_operating_systems` — todas con conversiones, filtrables por país, comparables período a período.

### 2.7 Calidad de datos y automatización
| Herramienta | Uso |
|---|---|
| `get_bot_stats`, `get_suspicious_sessions` | Detección de tráfico bot: imprescindible antes de recomendar (un pico de tráfico puede ser bots) |
| `list_alerts`, `get_alert_stats`, `get_alert_history` | Reglas de alerta existentes y su historial |
| `list_webhooks`, `get_webhook_stats`, `list_webhook_deliveries` | Notificaciones en tiempo real, salud de integraciones |

### 2.8 Parámetros transversales
- **Períodos:** today, yesterday, 7d, 30d, 90d, 12m, this/last week-month-quarter-year, wtd/mtd/qtd/ytd.
- **Comparación:** `previous` (período anterior) y `yoy` (año anterior) en las herramientas principales — base de la detección de anomalías.
- **Filtros:** country, utm_source/medium/campaign/term, device, browser, OS, path, content_grouping según herramienta.
- **Autenticación:** API key por cliente (`SEALMETRICS_API_KEY`, prefijo `sm_`) + `SEALMETRICS_SITE_ID` opcional. El scoping por API key es el modelo de seguridad multi-tenant.

> **Gap detectado:** el MCP actual es 100% lectura salvo configuración. No hay herramienta para **crear** alertas, segmentos o informes programados desde el asistente. Recomendación de producto: añadir `create_alert`, `create_segment` y `schedule_report` al MCP para cerrar el bucle "detectar → vigilar" (ver roadmap, fase 3).

---

## 3. Arquitectura y plataforma

### Opción A — Plugin/Skill para Claude (sobre el MCP existente)

El cliente instala el conector MCP de Sealmetrics en Claude (Desktop/Cowork/Code) con su API key, más un **plugin de Sealmetrics** que contiene el skill experto (system prompt, playbooks, metodología). Claude se convierte en su consultor.

- **Coste:** casi nulo — el MCP ya existe; solo hay que escribir el plugin (el system prompt de la sección 5 es el 80%).
- **Time-to-market:** días.
- **Quién paga la inferencia:** el cliente (su suscripción de Claude).
- **Limitaciones:** requiere que el cliente use Claude; UX no controlada por Sealmetrics; distribución vía marketplace de plugins.
- **Encaje estratégico:** excelente como contenido de marketing ("Sealmetrics es la analítica AI-ready") y para clientes técnicos/agencias. También funciona con ChatGPT y otros clientes MCP-compatibles, ampliando alcance.

### Opción B — Asistente embebido en el dashboard (agente standalone)

Chat dentro de my.sealmetrics.com. Backend propio que llama a la Claude API (tool use) reutilizando **las mismas definiciones de herramientas del MCP** — el servidor MCP puede consumirse server-side, así no se duplica lógica.

- **Coste:** desarrollo (frontend chat + backend orquestador) + coste de inferencia por uso.
- **Time-to-market:** semanas/meses.
- **Control total:** UX, onboarding, límites de uso, branding.
- **Monetización:** feature de planes superiores o add-on ("AI Copilot").
- **Ventaja única:** puede ejecutar los playbooks proactivos en servidor (cron) y entregar el informe semanal por email/Slack sin que el cliente pregunte nada.

### Recomendación

**Fase 1 (ya):** Opción A. Valida qué preguntan los clientes y qué playbooks aportan valor, con coste mínimo. Los logs de uso del MCP son investigación de producto gratuita.
**Fase 2 (tras validación):** Opción B reutilizando el mismo system prompt y el mismo servidor MCP server-side. Lo aprendido en fase 1 define el roadmap de la fase 2.
Ambas opciones comparten el 90% del trabajo de esta spec (system prompt, playbooks, metodología), así que no hay apuesta perdedora.

```
Fase 1                          Fase 2
┌─────────┐                     ┌──────────────────────┐
│ Cliente │──Claude+Plugin──┐   │ Dashboard Sealmetrics │
└─────────┘                 │   │  └── Chat UI          │
                            ▼   │       └── Backend ────┼──Claude API (tool use)
                     ┌──────────┴───┐                   │        │
                     │ MCP Server   │◄──────────────────┘────────┘
                     │ Sealmetrics  │──── API Sealmetrics (API key del cliente)
                     └──────────────┘
```

---

## 4. Capacidades del asistente

### 4.1 Modo reactivo (Q&A)

Responde en lenguaje natural a preguntas sobre los datos. Ejemplos por nivel:

- **Descriptivo:** "¿Cómo fue el tráfico este mes?" → `get_overview(period=this_month, compare=previous)`
- **Diagnóstico:** "¿Por qué cayeron las ventas esta semana?" → overview con compare → aislar canal (`get_channels`) → campaña (`get_campaigns`) → landing (`get_landing_pages`) → descartar bots (`get_bot_stats`)
- **Comparativo:** "¿Google o Meta me trae mejores clientes?" → `get_traffic_sources` + `get_conversions` filtrado por source → comparar CR, AOV y revenue, no solo volumen
- **Granular:** "¿Qué talla se vende más desde Instagram?" → `list_property_keys` → `get_property_values(property_key=talla, group_by=utm_source)`

### 4.2 Modo proactivo (consultor)

El asistente ejecuta playbooks sin que se lo pidan (al abrir sesión, programado, o tras detectar algo raro en una consulta):

1. **Health check semanal** — overview + canales + campañas con `compare=previous`; clasifica variaciones (normal / vigilar / actuar); 3 hallazgos máximo, priorizados por € de impacto.
2. **Detector de anomalías** — caídas o picos >25% en conversiones/revenue por canal-campaña; cruza siempre con `get_bot_stats` antes de alertar.
3. **Cazador de oportunidades** — patrones predefinidos (sección 4.4) que escanean campañas, landings y propiedades buscando dinero dejado sobre la mesa.
4. **Vigilancia de presupuesto** — campañas con entrances altas y CR bajo vs. campañas con CR alto y poco volumen → propuesta de reasignación.

### 4.3 Playbooks por vertical

#### Ecommerce
- **Funnel comercial:** `get_funnel` + microconversiones (product_view → add_to_cart → start_checkout → purchase). Identifica la etapa con mayor drop-off y la segmenta por dispositivo, canal y país para localizar la causa.
- **Análisis por propiedad:** talla/color/categoría/rango de precio vía property tools. Output típico: "El 38% del revenue de Paid Social viene de la categoría X, pero solo le dedicas el 12% de las campañas".
- **AOV por canal:** `get_conversions` con sort por avg_value, filtrado por source — qué canal trae compradores de ticket alto.
- **Abandono de carrito por origen:** ratio add_to_cart/purchase por utm_source vía `get_microconversion_details`.

#### Hoteles
- **Funnel de reserva:** búsqueda → ficha habitación → inicio booking → confirmación (microconversiones).
- **Directo vs OTA:** peso del canal directo en revenue; oportunidades para campañas de captación directa (el ahorro de comisión OTA es el ROI del playbook).
- **Mercados emisores:** `get_countries` con conversiones y revenue + campañas por país → en qué mercados invertir.
- **Por propiedades:** room_type, rate_plan, antelación de reserva, duración de estancia (si el hotel las trackea) cruzadas con canal/campaña: "Las reservas de suite vienen 4x más de email que de paid".
- **Estacionalidad:** `compare=yoy` en todos los análisis — en hoteles la comparación válida es contra el año anterior, no contra el período anterior.

### 4.4 Biblioteca de patrones de oportunidad (escaneo proactivo)

| # | Patrón | Detección | Recomendación tipo |
|---|---|---|---|
| 1 | Campaña fuga | Entrances altas, CR ≪ media del canal | Revisar concordancia anuncio-landing o pausar |
| 2 | Campaña estrella oculta | CR y AOV altos, volumen bajo | Escalar presupuesto |
| 3 | Landing rota | Bounce ≫ media con tráfico de pago | Test de velocidad/mensaje; urgente si es paid |
| 4 | Brecha de dispositivo | CR móvil < 50% del CR desktop | Auditar checkout móvil |
| 5 | Keyword cara sin retorno | Term con entrances y 0 conversiones (período largo) | Negativizar o ajustar puja |
| 6 | País infraexplotado | CR alto en país sin campañas activas | Campaña geo-segmentada |
| 7 | Propiedad ganadora | Valor de propiedad con revenue desproporcionado en un canal | Creatividades/segmentación específicas |
| 8 | Canal en deriva | Caída sostenida 3+ semanas vs previous | Investigación de causa raíz |
| 9 | Tráfico bot inflando métricas | bot score alto en fuente concreta | Excluir antes de decidir presupuestos |
| 10 | Micro→macro roto | Microconversiones suben, conversiones no | Revisar etapa final del funnel |

Cada patrón emite: evidencia (números + período), impacto estimado en €, acción concreta, y cómo verificar el resultado en 2-4 semanas.

---

## 5. System prompt (núcleo del asistente)

> Este prompt sirve tanto para el skill del plugin (fase 1) como para el system prompt del backend (fase 2). Mantener en inglés para máximo rendimiento del modelo; el asistente responde en el idioma del usuario.

```markdown
# Seal Copilot — Marketing Optimization Analyst

You are Seal Copilot, an expert digital marketing analyst working on top of
Sealmetrics, a consentless analytics platform that tracks 100% of traffic
(no consent-based sampling) with last-click attribution.

## Your mission
Help the customer grow their online business: diagnose performance, find
optimization opportunities, and recommend concrete actions with estimated
revenue impact. You are a proactive consultant, not a query interface.

## Operating rules
1. SESSION START: silently run `list_sites` (resolve site), then
   `get_overview(period=30d, compare=previous)`. If you notice a significant
   change (>20% in conversions or revenue), mention it before answering
   anything else.
2. ALWAYS quantify. Never say "performance improved" — say "conversions
   +18% (412 → 486) while traffic grew only 3%, so CR improved from
   2.1% to 2.4%".
3. RATES over volumes. Compare conversion rate, revenue per entrance and
   AOV across channels — volume comparisons mislead.
4. STATISTICAL HONESTY: with fewer than ~30 conversions per cell, flag low
   confidence and avoid strong recommendations. Never present noise as signal.
5. BOT CHECK: before reporting any traffic spike or anomaly, check
   `get_bot_stats`. Inflated metrics from bots are the #1 false positive.
6. LAST-CLICK CAVEAT: attribution is last-click. When a customer considers
   cutting an upper-funnel channel (display, social awareness), warn that
   last-click undervalues assist channels.
7. PROPERTIES ARE GOLD: early in an engagement run `list_property_keys` and
   `list_microconversion_types` to learn what this customer tracks. Custom
   properties (size, color, room_type, price_range...) enable insights no
   standard report can give.
8. DRILL-DOWN ORDER for any diagnosis:
   overview → channel → source/medium → campaign → term/landing/device/country
   → properties. Stop at the level where the cause is isolated.
9. RECOMMENDATIONS FORMAT — every recommendation includes:
   (a) evidence (numbers + period), (b) action, (c) estimated € impact,
   (d) how to verify in 2-4 weeks.
10. PERIOD DISCIPLINE: default 30d with compare=previous. For seasonal
    businesses (hotels, travel, retail peaks) prefer compare=yoy.
11. MAX 3 findings per proactive report, ordered by € impact. Depth over
    breadth.
12. Answer in the user's language. Be direct; no filler.

## Vertical playbooks
- ECOMMERCE: funnel = product_view → add_to_cart → start_checkout →
  purchase (use microconversion tools). Key analyses: cart abandonment by
  source, AOV by channel, property breakdowns (category/size/color/price),
  mobile vs desktop checkout gap.
- HOTELS: funnel = search → room_view → booking_start → booking. Key
  analyses: direct vs OTA share, source markets (countries × campaigns),
  booking properties (room_type, rate_plan, lead time, stay length),
  always compare yoy for seasonality.

## What you do NOT do
- No invented data: if a tool returns empty or errors, say so.
- No PII: Sealmetrics is consentless and stores no personal identifiers;
  never speculate about individual users.
- No execution of changes in ad platforms — you recommend, the customer acts.
```

### 5.1 Preguntas de arranque sugeridas (UI fase 2 / ejemplos del plugin fase 1)

"¿Dónde estoy perdiendo dinero este mes?" · "¿Qué campaña debería escalar?" · "¿Por qué cayó mi conversión ayer?" · "Hazme el informe semanal" · "¿Qué canal me trae los clientes de más valor?" · "¿Mi checkout móvil funciona bien?"

---

## 6. Metodología de análisis (referencia para QA del asistente)

1. **Triangulación mínima:** ninguna recomendación sale de una sola métrica. CR bajo + bounce alto + solo en móvil ⇒ problema de landing móvil; CR bajo con bounce normal ⇒ problema de oferta/precio.
2. **Umbrales por defecto** (ajustables por cliente): anomalía = ±25% vs comparable; significancia mínima = 30 conversiones por celda; campaña "fuga" = CR < 40% de la media del canal con ≥500 entrances; landing "rota" = bounce > media + 20 pts con tráfico de pago.
3. **Jerarquía de causas ante una caída:** (1) bots/tracking, (2) un canal concreto, (3) una campaña concreta, (4) una landing/term concreta, (5) un dispositivo/país, (6) estacionalidad (yoy), (7) mercado general.
4. **Presupuesto de llamadas:** health check ≤ 8 llamadas; diagnóstico ≤ 12. Usar herramientas `get_top_*` (compactas) para rankings y las completas solo para drill-down.

---

## 7. Informes y alertas programados

- **Fase 1 (plugin):** instrucciones en el skill para que el cliente cree una tarea programada en Claude ("cada lunes a las 8:00, ejecuta el health check semanal").
- **Fase 2 (embebido):** cron server-side que ejecuta los playbooks y entrega por email/Slack. Las alertas nativas de Sealmetrics (`list_alerts` + webhooks) cubren el tiempo real; el asistente cubre el análisis con contexto.
- **Dependencia roadmap:** para que el asistente cree alertas él mismo se necesitan las herramientas de escritura del gap detectado en §2.8.

---

## 8. Seguridad, privacidad y límites

- **Multi-tenancy por API key:** cada cliente solo ve sus sites. El asistente nunca mezcla datos entre cuentas. En fase 2, la API key vive en el backend, jamás en el navegador.
- **Sin PII:** coherente con el posicionamiento consentless — el asistente trabaja solo con agregados. Esto simplifica el DPA del propio asistente: los prompts contienen métricas agregadas, no datos personales.
- **Inferencia:** usar Claude API con zero data retention si está disponible para el plan contratado; documentarlo en la página de privacidad del asistente (coherencia de marca: privacidad primero).
- **Disclaimers:** las recomendaciones son analíticas, no garantías; decisiones de inversión publicitaria son del cliente.
- **Límites de coste (fase 2):** cap de mensajes/día por plan; modelo pequeño (Haiku) para clasificar la pregunta y enrutar, modelo grande solo para análisis complejos.

---

## 9. Roadmap

| Fase | Alcance | Esfuerzo | Señal de éxito |
|---|---|---|---|
| **1. Plugin Claude** (semanas 1-2) | Skill con system prompt §5 + playbooks §4; guía de instalación del MCP; publicación en marketplace; anuncio a base de clientes | Bajo (contenido, no código) | ≥20 clientes lo instalan; feedback cualitativo |
| **1b. Validación** (semanas 3-6) | Entrevistas con usuarios; registrar qué preguntan; afinar playbooks y umbrales | Bajo | Lista priorizada de casos de uso reales |
| **2. Copilot embebido** (meses 2-4) | Chat en dashboard; backend con Claude API + MCP server-side; health check programado por email; quick prompts | Medio-alto | Adopción >30% MAU; impacto en retención/upsell |
| **3. Cierre del bucle** (meses 4-6) | Herramientas de escritura en MCP (`create_alert`, `create_segment`, `schedule_report`); el asistente pasa de recomendar a vigilar | Medio | Alertas creadas por IA activas por cliente |
| **4. Acciones externas** (exploratorio) | Integraciones Google/Meta Ads (lectura de coste → ROAS real; luego acciones con confirmación) | Alto | ROAS por campaña dentro del asistente |

**Nota fase 4:** hoy el asistente no conoce el **coste** de las campañas (Sealmetrics no lo ingesta). Es la limitación más importante para optimización de presupuesto: puede comparar CR/AOV/revenue entre campañas, pero no ROAS. Integrar coste (API de Google/Meta Ads o import manual) multiplica el valor de los playbooks 1, 2 y de vigilancia de presupuesto.

---

## 10. Métricas de éxito del producto

- Activación: % de clientes que usan el asistente ≥1 vez/semana.
- Profundidad: nº medio de playbooks proactivos leídos/accionados.
- Valor declarado: encuesta trimestral "¿el copilot te ha hecho ganar/ahorrar dinero?" (NPS específico).
- Negocio: impacto en churn de clientes con copilot activo vs sin él; conversión a planes superiores (fase 2).

---

## Apéndice A — Catálogo de herramientas MCP (44, verificadas 12/06/2026)

**Descubrimiento:** list_sites · get_site · get_tracking_code · list_channel_rules · list_segments · get_segment
**Global:** get_overview (compare) · get_funnel (country)
**Adquisición:** get_channels · get_top_channels · get_traffic_sources (compare, sort) · get_top_sources · get_traffic_mediums (compare, sort) · get_campaigns (compare, sort, filtros utm) · get_top_campaigns · get_terms (compare, sort, filtros) · get_top_terms · get_top_referrers
**Conversión:** get_conversions (compare, sort, filtros) · get_microconversions (compare, sort) · list_microconversion_types · get_microconversion_details (filtros completos: utm, país, device, browser, OS)
**Contenido:** get_pages (compare, sort, path_filter) · get_top_pages · get_landing_pages (compare, sort, path_filter) · get_top_landing_pages · get_content_groups (filtros utm) · get_landing_pages_by_content_group
**Propiedades:** list_property_keys (tabla: conversions/micro/items) · get_property_breakdown · get_property_values (group_by utm)
**Audiencia:** get_countries (compare, sort) · get_devices (compare) · get_device_types · get_browsers · get_operating_systems
**Calidad/automatización:** get_bot_stats · get_suspicious_sessions · list_alerts · get_alert_stats · get_alert_history · list_webhooks · get_webhook_stats · list_webhook_deliveries

Períodos soportados en todas las de reporting: today, yesterday, 7d, 30d, 90d, 12m, this/last_week, wtd, this/last_month, mtd, this/last_quarter, qtd, this/last_year, ytd.

## Apéndice B — Pendiente para test en vivo

La API key del MCP no estaba configurada en esta sesión (`SEALMETRICS_API_KEY`). Para validar la spec contra datos reales: generar token en my.sealmetrics.com → Settings → API Tokens, configurarlo en el servidor MCP y ejecutar el health check semanal de prueba (§4.2.1).

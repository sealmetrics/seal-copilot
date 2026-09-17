# Encargo: el transporte local del MCP debe ocultar las herramientas que una clave de API no puede usar

**Repo:** `sealmetrics2/mcp-server` · **Esfuerzo:** medio día · **Prioridad:** alta, afecta a todo cliente MCP local

> **Corrección del 17/09/2026 — leer antes de implementar.** La versión original
> de este encargo hablaba de **veinte** herramientas e incluía `get_channels`,
> `list_channel_rules` y `test_channel_rules`. Las tres **funcionan**: el router
> `channel-groups` está protegido por
> `require_any_scope("read", "sites:read", "channel_rules:write")` y una clave
> moderna lleva `sites:read` (PRD-055 Bloque A). Verificado el 17/09 en
> `api/src/sealmetrics_api/routers/channel_groups.py` y en `src/remote/gate.ts`
> de 1.8.2 y del paquete publicado 1.9.1.
>
> Lo que hay que ocultar en local son **diez**, no veinte: las de los routers
> `alerts`, `segments`, `bot-stats` y `webhooks`, que exigen el ámbito genérico
> `read`. Son exactamente las de `REMOTE_EXCLUDED_TOOLS`, así que el punto 2 de
> abajo ("completarla hasta las 20") **ya no aplica**: la lista está completa y
> solo hay que reutilizarla.
>
> Las cuatro de escritura de reglas de canal son un caso aparte y **no** van en
> esta lista: `channel_rules:write` y `channel_rules:publish` sí son ámbitos que
> una clave de API puede llevar (PRD-055 Bloque B, `API_KEY_ALLOWED_SCOPES`), así
> que en local funcionan con la clave adecuada. El remoto no las anuncia porque
> su clave OAuth es de solo lectura.
>
> El plugin Seal Copilot ya no depende de esta lista escrita a mano:
> `evals/dump-transport-tools.mjs` la genera del paquete publicado. Cuando esto
> se implemente, ese script informará de diez herramientas retiradas del
> transporte local y `check.sh` pedirá aceptar el cambio.

## Qué pasa

Veinte herramientas del MCP llaman a rutas del backend que exigen el ámbito genérico `read` (`/channel-groups`, `/bot-stats`, `/alerts`, `/segments`, `/webhooks`) o `write`. Una clave de API solo puede llevar `stats:read`, `sites:read`, `accounts:read` (`api/src/sealmetrics_api/models/api_tokens.py`, `API_KEY_ALLOWED_SCOPES`), y la jerarquía de ámbitos es de un solo sentido (`auth/models.py`, `SCOPE_HIERARCHY`). Resultado: esas veinte herramientas devuelven 403 a cualquier clave moderna, siempre.

El transporte **remoto** ya lo sabe: `src/remote/gate.ts` define `REMOTE_EXCLUDED_TOOLS` y `src/remote/app.ts:185-186` lo pasa al servidor junto con `omitSetupTools: true`, así que esas herramientas no se anuncian. El transporte **local** (`npx @sealmetrics/mcp`, el que usan Claude Desktop, Claude Code y el plugin Seal Copilot) no recibe ese filtro: anuncia las 62 y veinte fallan. Un asistente las llama por su nombre natural (`get_channels`) y el cliente ve "Access denied" en cada informe.

Decisión de referencia: PRD 2026-07-02, comentario de cabecera en `src/remote/gate.ts`.

## Qué hay que hacer

### 1. Aplicar el mismo filtro en el transporte local

`src/index.ts` construye el servidor pasando solo `apiKey` (línea 39). Debe pasar además las dos opciones que ya acepta `createServer` en `src/server.ts` (líneas 51-57 y 152-158):

```ts
excludeReadOnlyTools: API_KEY_EXCLUDED_TOOLS,
omitSetupTools: false,   // ver punto 3
```

### 2. Sacar la lista de `remote/` y completarla

`REMOTE_EXCLUDED_TOOLS` está en `src/remote/gate.ts` y tiene 12 nombres. La restricción no es del transporte sino de la credencial, así que:

- Moverla a `src/tools/gate.ts` (o similar) como `API_KEY_EXCLUDED_TOOLS`, y que `remote/gate.ts` la reexporte para no romper imports.
- Completarla hasta las 20 herramientas cuya ruta exige `read` o `write`. Las 12 actuales más:

  | Herramienta | Ruta backend | Ámbito exigido | Estado 17/09 |
  |---|---|---|---|
  | `test_channel_rules` | `POST /channel-groups/test` | `read`, `sites:read` o `channel_rules:write` | **funciona — no ocultar** |
  | `create_channel_rule` | `POST /channel-groups` | `write` o `channel_rules:write` | funciona con clave que lleve el ámbito; no ocultar en local |
  | `update_channel_rule` | `PUT /channel-groups/{id}` | `write` o `channel_rules:write` | idem |
  | `delete_channel_rule` | `DELETE /channel-groups/{id}` | `write` o `channel_rules:write` | idem |
  | `import_channel_rules` | `POST /channel-groups/import` | `write` o `channel_rules:write` | idem |
  | `verify_setup` | setup con `account_id` | por confirmar | comprobar con `grep require_scope` antes de decidir |
  | `get_instrumentation_guide` | idem | por confirmar | idem |
  | `verify_event_instrumented` | idem | por confirmar | idem |

  Las tres de setup son las únicas de esta tabla que siguen en duda, y el
  motivo de la duda es el mismo que produjo el error original: nadie leyó el
  router. `grep -n 'require_scope' api/src/sealmetrics_api/routers/<router>.py`
  antes de añadir ninguna.

  Verificar cada una con `grep -n 'require_scope' api/src/sealmetrics_api/routers/<router>.py` antes de cerrar la lista.

### 3. No usar `omitSetupTools: true` en local

Remoto omite todo el bloque de setup, pero en local tres de esas herramientas **sí funcionan** con clave (`provision_site`, `detect_framework`, `get_tracking_code`; la primera no lleva site, la segunda es local, la tercera va por `/stats`). Hay que excluir por nombre solo las tres de setup que exigen `read` (tabla anterior), no el bloque entero. Si `CHANNEL_WRITE_TOOLS` se registra por separado en `src/server.ts:188`, aplicarles el mismo filtro por nombre.

### 4. Test espejo para stdio

`__tests__/remote-transport.test.ts:248-258` hace `tools/list` contra el remoto y asegura que ninguna herramienta excluida aparece. Añadir el mismo test contra el transporte stdio: arrancar el servidor con una clave de prueba, pedir `tools/list`, y afirmar que ninguna de las 20 está en la respuesta y que `get_top_channels`, `get_overview` y `get_tracking_code` sí están.

### 5. Descripción de `get_top_channels`

Su descripción actual dice "compact list of the top N". Ahora es **la** herramienta de canales para clientes con clave. Añadir: "Use this for channel breakdowns; `get_channels` requires a dashboard session and is not available over an API key."

## Lo que NO hay que hacer

- No tocar ámbitos ni routers del backend. La decisión de julio es de seguridad y este encargo la respeta.
- No hacer el filtro dinámico (introspección de ámbitos al arrancar) en esta iteración. Las claves con `read` heredado son residuales; si aparece una queja, se estudia entonces.

## Cómo comprobar que está hecho

```
SEALMETRICS_API_KEY=sm_... npx @sealmetrics/mcp   # tools/list debe listar 54, no 64
```

54 y no 42: el remoto oculta además las de setup y las de escritura de reglas
(`omitSetupTools`), y en local eso no debe pasar — `provision_site`,
`detect_framework` y `get_tracking_code` funcionan con clave, que es el punto 3.

Y en el plugin, `node evals/dump-transport-tools.mjs` debe informar de diez
herramientas retiradas del transporte local. Es el resultado esperado, y el
plugin ya no las llama.

## Efecto en clientes

Ninguna pérdida de función real: esas herramientas ya fallaban. Lo que desaparece es el error. Los asistentes dejan de ofrecer reglas de canal, alertas, webhooks y validación de bots a quien no puede usarlos, y `get_top_channels` pasa a ser lo que encuentran al pedir canales.

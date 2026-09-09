# Encargo: el transporte local del MCP debe ocultar las herramientas que una clave de API no puede usar

**Repo:** `sealmetrics2/mcp-server` · **Esfuerzo:** medio día · **Prioridad:** alta, afecta a todo cliente MCP local

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

  | Herramienta | Ruta backend | Ámbito exigido |
  |---|---|---|
  | `test_channel_rules` | `POST /channel-groups/test` | `read` |
  | `create_channel_rule` | `POST /channel-groups` | `write` |
  | `update_channel_rule` | `PUT /channel-groups/{id}` | `write` |
  | `delete_channel_rule` | `DELETE /channel-groups/{id}` | `write` |
  | `import_channel_rules` | `POST /channel-groups/import` | `write` |
  | `verify_setup` | `/bot-stats` o setup con `account_id` | `read` |
  | `get_instrumentation_guide` | idem | `read` |
  | `verify_event_instrumented` | idem | `read` |

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
SEALMETRICS_API_KEY=sm_... npx @sealmetrics/mcp   # tools/list debe listar 42, no 62
```

Y en el plugin Seal Copilot, `node evals/check-schema-drift.mjs` debe informar de 20 herramientas retiradas: es el resultado esperado, y el plugin ya no las llama.

## Efecto en clientes

Ninguna pérdida de función real: esas herramientas ya fallaban. Lo que desaparece es el error. Los asistentes dejan de ofrecer reglas de canal, alertas, webhooks y validación de bots a quien no puede usarlos, y `get_top_channels` pasa a ser lo que encuentran al pedir canales.

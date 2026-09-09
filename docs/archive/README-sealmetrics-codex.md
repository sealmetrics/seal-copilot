# sealmetrics-codex v0.1.0 (junio 2026)

El primer plugin de Codex para Sealmetrics, sustituido por Seal Copilot el 9 de
septiembre de 2026 y archivado aquí porque no estaba en ningún repositorio: no
era git, así que borrarlo habría sido definitivo.

Qué tenía: una sola skill de 41 líneas que cubría aprovisionar un sitio,
instalar el tracker e instrumentar conversiones, y una copia empaquetada del
servidor `@sealmetrics/mcp` en `server/index.js` — un artefacto de compilación,
no fuente, regenerable con `npx @sealmetrics/mcp`.

Lo único que no se podía regenerar eran los iconos, y están rescatados en
`seal-copilot/assets/`. El export de Codex los usa en su bloque `interface`.

No lo revivas tal cual: su skill contradice la metodología actual en atribución,
umbrales y llamadas al MCP.

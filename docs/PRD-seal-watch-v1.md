# PRD — Seal Watch: la evaluación de alertas fuera del producto

**Versión:** 1.0 · **Fecha:** 17 septiembre 2026 · **Autor:** Rafa (Sealmetrics) con Claude
**Estado:** **Implementado y probado**; pendiente solo el despliegue en Railway.
**Relación con el resto:** es la vía A del [E13 del PRD v1](PRD-seal-copilot-v1.md#e13--alertas-en-lenguaje-natural--p0), hecha bien. La vía B, el motor nativo del [Addendum 1.2 (E15)](PRD-seal-copilot-v1.md), sigue siendo el destino.

---

## 1. Resumen

Ningún cliente puede tener una alerta hoy. El producto guarda reglas y sabe
entregar avisos, pero nada evalúa una: `check_and_trigger` solo se llama desde
un test, crear una regla exige el ámbito `write` que solo tiene una sesión del
dashboard, y el dashboard no tiene pantalla de alertas. El plugin sabía guardar
una regla y comprobarla a petición, y ahí acababa.

La restricción impuesta el 17/09 fue arreglarlo **sin tocar `sealmetrics2`**.
Es posible por un hecho verificado antes de escribir una línea: **todo lo que
una regla necesita para ser juzgada está bajo `/stats/`, que la API protege con
`stats:read`, y toda clave de API lleva ese ámbito.** Lo cerrado es guardar y
evaluar reglas, y las dos cosas pueden vivir fuera.

`watcher/` es ese evaluador: sin dependencias, sin modelo, 89 comprobaciones.

---

## 2. Por qué no las otras vías

| Vía | Por qué no |
|---|---|
| Motor nativo del backend (E15) | Es el destino correcto y exige tocar `sealmetrics2`: un evaluador, un ámbito `alerts:write` que una clave pueda llevar, y herramientas de escritura en el MCP. Fuera de la restricción |
| Rutinas de Claude Code | Probadas y retiradas en 1.13.0: mínimo horario, tope diario por cuenta, el plugin solo carga desde un repositorio, cada ejecución es una sesión de modelo, y se crean con todos los conectores de la cuenta |
| Un cron que llame a `check-alerts` | Es una sesión de modelo por comprobación: caro, no determinista, y solo existe en Claude Code y Cowork |

Un evaluador propio no tiene ninguno de esos límites: está siempre encendido,
es barato, es determinista y no depende del cliente de IA que use el cliente.

---

## 3. Lo que hace, y lo que cuesta

Cada cinco minutos, para cada regla vencida y dentro de su ventana:

| Familia | Lee | Dispara cuando | Cadencia |
|---|---|---|---|
| `silence` | total del día, luego la marca del evento más reciente | no hay evento durante N horas **vigiladas** | 5 min |
| `drop` | acumulado del día | cae al `ratio` de lo normal para ese día y hora | 15 min |
| `spike` | lo mismo, en espejo | sube al `ratio`, y entonces nombra lo que hizo el referrer principal | 15 min |
| `threshold` | una lectura | se cruza un suelo o un techo | 60 min |

Una llamada a `/stats/overview` por site y pasada sirve a todas sus reglas. El
límite es de 240 peticiones por minuto en Growth, así que el servicio se queda
en menos de una por minuto y el límite nunca es la restricción.

**Decisiones que no son negociables en el diseño:**

- **Una lectura fallida nunca es un veredicto.** Si la API rechaza o expira, la
  regla se reporta como error y no se entrega nada. Leer un rechazo como
  silencio dispararía todas las reglas de silencio de todos los clientes
  durante una caída nuestra.
- **Incidentes, no evaluaciones.** Un aviso al abrir, "sigue abierto" después,
  enfriamiento antes de reabrir, y una línea al recuperarse.
- **`silence` cuenta solo horas vigiladas.** Una tienda que cierra a
  medianoche no recibe un aviso a las cuatro. Verificado cruzando el cambio de
  hora.
- **Latido en cada ciclo**, porque la forma en que este servicio falla es en
  silencio: si se para, nada dispara y nadie lo nota.
- **Una edición rota no para la vigilancia.** Si la config nueva no parsea o no
  valida, se registra y sigue la última buena; una errata en una regla
  silenciaría todas.

---

## 4. Tokens y responsabilidad

Decisión del 17/09: **cada cliente se responsabiliza de su token.**

La config nombra la variable de entorno; la variable guarda el token. Así la
config es commiteable, el cliente crea, rota y revoca su propio token en
my.sealmetrics.com → Settings → API Tokens, y si lo revoca solo dejan de
funcionar sus reglas. Nadie guarda un token en un archivo.

Ámbitos necesarios: ninguno especial. Los de lectura por defecto bastan, que es
la razón por la que todo esto funciona sin tocar el producto.

---

## 5. Cómo entra una regla

Una gramática, tres lectores: `create-alert` la escribe, `check-alerts` la
evalúa a petición, el vigilante la vigila. Todos validan contra el mismo
esquema, `seal-copilot/hooks/schemas/alerts.json`, que un hook hace cumplir.

```
node watcher/rules.mjs import <site> <state-dir>/<site>/alerts.json
```

Se trae el archivo completo que escribió el plugin. Es estrecho a propósito:
solo reglas activas, porque importar una pausada rearmaría algo apagado; solo
válidas, comprobadas una a una; y **siempre dice qué dejó fuera**, porque una
regla que el operador cree vigilada y no lo está es el fallo que este servicio
existe para evitar.

La config se relee entre pasadas, así que ni añadir ni pausar exige
redespliegue.

Antes de confiar en una regla, `watcher/preview.mjs` la reproduce sobre los
eventos reales del site y nombra los días en que habría saltado. `create-alert`
estima falsas alarmas con Poisson; esto lee el historial. **No dictamina que
una regla sea ruidosa**, porque un backtest cuenta incidentes reales además de
falsos y el umbral de "una falsa al mes" no se le aplica. Lo único que afirma
es la densidad: una regla que salta un tercio de los días describe el site.

---

## 6. Lo que deliberadamente no hace

- **Email.** Sealmetrics ya tiene email de alertas con plantillas y baja.
  Reimplementarlo sería asumir la entregabilidad del dominio de un cliente.
  Slack y webhooks cubren la necesidad hasta que llegue el motor nativo.
- **Reglas en el dashboard.** Viven en la config del vigilante, no en el
  producto, así que no salen en la interfaz de Sealmetrics.
- **Ser el destino.** Cuando el motor nativo llegue, la gramática de aquí ya es
  la que ese diseño usa, así que las reglas se traducen y no se reescriben.

---

## 7. Despliegue

Railway, servicio desde este repositorio con **raíz `/`** y Dockerfile
`watcher/Dockerfile`. No raíz `watcher`: el validador de reglas es el del
plugin y vive fuera de ese directorio, así que el contexto de build tiene que
ser el repositorio.

| Variable | Necesaria | Qué |
|---|---|---|
| `SEAL_CONFIG_PATH` | sí | La config en el volumen, para que `rules.mjs` pueda editarla |
| `SEAL_TOKEN_<SITE>` | una por cliente | Su propio token |
| `SEAL_SLACK_<SITE>` | | Webhook entrante de Slack; sin él los avisos van al log |
| `SEAL_STATE_PATH` | muy recomendable | Incidentes en el volumen; sin él un reinicio reavisa |
| `SEAL_HEARTBEAT_URL` | muy recomendable | Dead-man's-switch |

La imagen ejecuta sus 89 tests al construirse, así que un vigilante roto rompe
el despliegue y no la primera alerta.

---

## 8. Estado de verificación

| Comprobación | Resultado |
|---|---|
| 89 tests, macOS y Alpine | pasan en los dos |
| Imagen Docker | construye, y los tests corren dentro |
| `--check` en la imagen | configuración usable, salida 0 |
| Ruta de lectura contra producción | 401 limpio de `/stats/overview`: URL, path, cabecera y `account_id` correctos |
| Una lectura rechazada | error contra todas las reglas del site, **no dispara nada** |
| Camino del cliente completo | import → list → check → pause, sin redespliegue |
| Contrato de la gramática | `evals/check-alert-contract.mjs` compara las cuatro definiciones |

**Sin verificar:** nada ha corrido todavía contra una cuenta real con una clave
válida, porque no hay clave en este entorno. Es lo primero que hay que hacer al
desplegar: un `--once` con el token del cliente, mirando que reporte el estado
real de sus reglas y no un error.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| El servicio se para y nadie lo nota | Latido por ciclo a un dead-man's-switch, y un `--once` diario desde otro sitio cuyo fallo se vea |
| Un retraso de la ingesta dispara todas las reglas de silencio | Una lectura fallida no es veredicto; y el aviso incluye las entradas de la misma ventana, que separa "no entra tráfico" de "entra y no convierte" |
| Deriva entre los dos evaluadores | `check-alert-contract.mjs` compara familias, métricas y condiciones entre esquema, referencia, prosa y código |
| Custodia de tokens | No hay: la config nombra la variable, el cliente gestiona su token |
| Reinicio duplica un aviso | `SEAL_STATE_PATH` en el volumen. Sin él avisa dos veces, que es el lado correcto del error |

---

## 10. Preguntas abiertas

1. **¿Un servicio o uno por cliente?** Hoy uno sirve N sites con un token por
   site. Uno por cliente aísla más y multiplica el coste de operación. La misma
   imagen sirve para las dos.
2. **¿Quién corre `rules.mjs`?** Hoy el operador. Darle al cliente una forma de
   entrar exigiría una interfaz, y eso ya es producto.
3. **¿Qué pasa con las reglas cuando llegue el motor nativo?** Se traducen; la
   gramática es la misma. Conviene decidir si el vigilante se apaga o queda como
   respaldo.

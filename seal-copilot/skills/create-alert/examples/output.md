> Reference output. Two runs: one that creates the rule the user asked for, and
> one that refuses a rule that would have fired most afternoons. Both are short.
> Note that the refusal names the arithmetic and offers specific alternatives,
> each with its own false-alarm figure.
>
> **These two happen to be in Spanish because those users wrote in Spanish.**
> Match the density, the structure and the brevity — never the language. You
> answer in whatever language the user used, per operating rule 18. A run once
> replied in Spanish to an English request because this page is in Spanish.

**Run 1 — "avísame si paso 4 horas seguidas sin ventas"**

Guardada: 4 horas sin ninguna `purchase` en demo-store.com, entre las 8:00 y
medianoche (hora de Madrid). Con 32 compras al día esperas unas 8 en esa
ventana; saltaría sin motivo menos de una vez al año.

Todavía no se vigila sola: el aviso automático llega con las alertas nativas
de Sealmetrics. Hoy, "pasa la alerta no-purchases-4h" la comprueba al momento.

Para borrarla: "borra la alerta de ventas".

---

**Run 2 — "avísame si paso 4 horas sin solicitudes de demo"**

No te creo esa regla tal como está, porque te avisaría casi cada día.

`demo_request` lleva 61 eventos en 30 días, unos 0,13 por hora entre las 8:00
y medianoche. En 4 horas esperas 0,5 (λ), así que el 60% de esas ventanas
quedan vacías sin que pase nada: unas 70 falsas alarmas al mes.

Con ese volumen no se puede detectar una tarde mala, pero sí un tracking roto:

- **3 días sin `demo_request`**, en horario 8:00–24:00. Esperas 6 (λ = 6,1);
  saltaría sin motivo menos de una vez al año.
- **Menos de 5 `demo_request` en una semana**, comprobado el domingo por la
  noche. Esperas 14; el mismo margen de falsas alarmas.

Dime cuál y la dejo montada.

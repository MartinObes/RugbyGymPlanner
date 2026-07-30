# F3.5 — Prompts para el chat de diseño

> Para pegar en un chat aparte de Claude (uno con artifacts). **Pegá el bloque 0 primero**, en ese
> chat, y después los bloques 1–4 de a uno en el mismo chat. Los bloques 3 y 4 están armados para
> ayudar a resolver dos decisiones abiertas del scope
> (`2026-07-29-f35-player-dashboard-scope.md` §6.1 y §6.3): pedí las variantes y elegí mirando.
>
> Los datos de ejemplo son calcos anonimizados de las planillas reales. **No pegues nombres de
> jugadores del club en un chat.**

---

## 0. Contexto (pegar una sola vez, al abrir el chat)

```
Vas a diseñar pantallas para CoachLab, una app de rutinas de gimnasio para un plantel de rugby.
Necesito mockups visuales que yo pueda mirar y comparar, no código de producción.

QUIÉN LA USA Y DÓNDE
El usuario de estas pantallas es un jugador de rugby, parado en el gimnasio, con el celular en una
mano y a veces con las manos sucias de magnesio. Entra entre series. Pantalla de referencia: 380 px
de ancho. Todo tiene que ser tocable sin zoom.

EL EJE DEL PRODUCTO (esto es lo más importante)
El jugador es un LECTOR de su rutina, no una fuente de datos. Viene a ver QUÉ ejercicio le toca,
CUÁNTAS reps y CON CUÁNTO PESO. Registrar lo que efectivamente hizo es OPCIONAL y SECUNDARIO: solo
si usó más o menos peso que lo prescrito y quiere dejarlo anotado. Todo diseño que haga que la
pantalla se lea como un formulario está mal. La referencia mental es la planilla de Excel impresa
que hoy el preparador físico les da en mano.

STACK Y RESTRICCIONES DE OUTPUT
- Entregame UN artifact HTML autocontenido por pantalla: Tailwind por CDN o CSS inline, sin JS de
  librerías externas. Renderizado a 380 px de ancho como caso principal; mostrame también cómo
  queda en ~1024 px si cambia algo.
- El código final va a ser Vue 3 con Nuxt UI v3. Usá formas que mapeen a sus componentes: card,
  badge, button, input, select, textarea, form-field, alert, accordion, slideover.
- Iconos: solo de Lucide, nombrados como `i-lucide-<nombre>`. Si usás un icono, escribí su nombre
  Lucide al lado en un comentario.
- Colores: usá los roles semánticos, no hex arbitrarios. Necesito distinguir: texto principal,
  texto atenuado (muted), primario, éxito, y ámbar/warning. Decime a qué rol corresponde cada uno.
- Modo claro es el caso principal.

IDIOMA Y TONO
Todos los textos de UI en español de Uruguay, tratando al jugador de "vos", nunca de "tú" ni de
"usted". Ejemplos del registro que ya usa la app: "Poné un nombre", "Elegí tu puesto",
"¿Cómo te fue hoy?", "Cargalos en Mi perfil". Sin signos de admiración de más, sin emojis, sin
lenguaje motivacional de app de fitness. Es la herramienta del club, no un coach virtual.

DATOS DE EJEMPLO (usá estos, son calcos de las planillas reales)
- Ejercicios: Pecho plano, Lagartijas pronos, Sentadilla, Peso muerto, Remo Pendlay, Dominadas,
  Estocadas, Prensa, Curl femoral, Abdominales rueda.
- Días: "Sesión 1 - Lunes", "Sesión 2 - Miércoles", "Sesión 3 - Viernes".
- Semanas: "Semana 14", "Semana 15".
- Las cargas vienen en cuatro formas distintas y las cuatro tienen que verse bien:
  1. kg fijos: "112 kg"
  2. porcentaje ya resuelto contra el 1RM del jugador: "80% → 112 kg"
  3. porcentaje SIN el 1RM cargado: "80% — falta tu 1RM de Sentadilla" (esto va en ámbar)
  4. etiqueta cruda de la planilla, se muestra tal cual: "p.corp", "barra", "goma", "med 9"
- Reps es texto libre, no siempre un número: "6", "10", "8 c/lado", "máx".
- Series: "4 × 6" (series × reps). Muchas veces las series son 1 y el dato no aporta.
- Hay dos tipos de bloque: SINGLE (ejercicios sueltos) y CIRCUIT, que se rotula por sus vueltas:
  "Circuito · 3 vueltas".

No escribas explicaciones largas antes del artifact. Mockup primero, tres o cuatro líneas de
justificación después.
```

---

## 1. Dashboard del jugador (pantalla de entrada)

```
Pantalla 1 de 4: el DASHBOARD, que es a donde el jugador aterriza al entrar a la app.

Tiene que responder dos preguntas de un vistazo, sin scroll en 380 px:

A) "¿Cuánto de la semana ya hice?" — una rueda de progreso circular con "2/3" y el rótulo
   "rutinas de esta semana". El dato es días completados sobre días de la semana. Valores a
   mockear: 0/3, 2/3 y 3/3 (el 3/3 debería sentirse cerrado, sin ser una celebración).

B) "¿Estoy mejorando?" — tarjetas de tendencia de sus tests de fuerza. Cada tarjeta es un
   ejercicio y compara su última evaluación contra la anterior. Mockeá estos cinco casos, que son
   todos los que existen:
   - Sentadilla: 140 kg, antes 132 kg (subió)
   - Pecho plano: 100 kg, antes 100 kg (igual)
   - Peso muerto: 155 kg, antes 160 kg (bajó)
   - Remo Pendlay: 70 kg, primera evaluación, no hay con qué comparar
   - Dominadas: sin evaluaciones todavía
   Mostrá la fecha del test ("12 jul") en algún lugar discreto.

Y un acceso claro a "Mi semana", que es donde está la rutina.

DECISIÓN QUE QUIERO TOMAR MIRANDO: qué tan fuerte se muestra el delta. Dame la misma pantalla en
dos variantes:
  Variante A — el número absoluto manda: "+8 kg" grande, con flecha.
  Variante B — solo dirección: una flecha y un color, y el "+8 kg" en chico al costado.
No me des una recomendación genérica: decime cuál aguanta mejor el caso "bajó 5 kg" sin que el
jugador lo lea como un reto.
```

---

## 2. "Mi semana" — la lista de días

```
Pantalla 2 de 4: la LISTA DE DÍAS de la semana vigente. Hoy esta pantalla renderiza los 3 días
enteros, expandidos, con sus ~12 ejercicios cada uno y sus inputs: son varias pantallas de scroll
en el celular. La quiero comprimida, un ítem por día, y que el jugador elija a cuál entrar.

Encabezado: nombre del programa y "Semana 14".

Un ítem por día, y cada ítem muestra: el nombre del día, cuántos ejercicios tiene, y en qué estado
está. Los estados son tres y hay que distinguirlos de un vistazo:
  - Sin empezar
  - Empezado: tiene algo registrado pero no está cerrado. El dato disponible es "3/8 registrados".
  - Completado: el jugador lo cerró.
Ojo con el texto: es "registrados", no "hechos". No hay checkbox por ejercicio, así que la app no
sabe qué hizo, solo qué anotó. El copy no puede prometer más que eso.

Casos a mockear: Sesión 1 completada, Sesión 2 con 3/8 registrados, Sesión 3 sin empezar.

Puede haber un banner ámbar arriba cuando faltan 1RM:
"Faltan tus 1RM de Sentadilla, Peso muerto" + "Cargalos en Mi perfil para ver los kg de cada serie".

Y el estado vacío: "Todavía no tenés un programa asignado. Cuando tu entrenador te asigne uno, lo
vas a ver acá."

DAME DOS VARIANTES: filas compactas tipo lista, contra tarjetas. En 380 px quiero ver los tres
días sin scroll — decime cuál lo logra y qué información hay que sacrificar para lograrlo.
```

---

## 3. El día — la rutina como en el Excel

```
Pantalla 3 de 4, y la más importante: EL DÍA, con su rutina. Es la pantalla que el jugador tiene
abierta mientras entrena.

Hoy cada ejercicio se muestra en columna: nombre → carga → RPE objetivo → "última vez" → y tres
inputs (peso, reps, RPE). Los inputs ocupan la mitad vertical de cada fila, así que doce ejercicios
se leen como un formulario de 36 campos. Eso es exactamente lo que hay que invertir.

LO QUE ES CONTENIDO (grande, legible de arriba, sin tocar nada):
el ejercicio, las series × reps, y el peso prescrito. Un bloque tipo "Pecho plano — 4 × 6 — 112 kg"
tiene que leerse de un vistazo y sin ambigüedad sobre cuál es el peso.

LO QUE ES SECUNDARIO (chico, al costado, opcional):
lo que el jugador efectivamente usó. Ver el bloque 4, que es solo sobre ese control.

LO QUE ES CONTEXTO (chico, atenuado):
- "última vez": "Semana 13 · Sesión 1: 105 kg · 6 reps"
- el RPE objetivo que puso el coach, cuando existe: "RPE 8". Es un dato del coach, no una pregunta
  al jugador. Que no parezca un campo a llenar.

ESTRUCTURA DE BLOQUES: los bloques tienen que verse separados de verdad, como las secciones de la
planilla, no como una lista corrida. Un CIRCUIT se rotula "Circuito · 3 vueltas".

DECISIÓN QUE QUIERO TOMAR MIRANDO — dame la pantalla en dos variantes:
  Variante A — los bloques tienen nombre, como en la planilla: "CIRCUITO CALENTAMIENTO",
    "Fuerza tren inferior", "C 1". Hoy el import descarta ese nombre, y rescatarlo cuesta una
    migración: quiero ver cuánto mejora la legibilidad antes de pagarla.
  Variante B — los bloques no tienen nombre: solo se distinguen por su separación visual y, si es
    circuito, por sus vueltas.

Armá un día realista de 3 bloques y 9 ejercicios en total, mezclando las cuatro formas de carga
(kg, "80% → 112 kg", "80% — falta tu 1RM de X" en ámbar, y "p.corp"), con un circuito entre medio.

Abajo, el cierre del día: un botón "Completar día", y un comentario del día OPCIONAL. Hoy el
textarea está pegado arriba del botón y por eso se lee como un paso obligatorio previo — no lo es.
Mostrame cómo lo colapsás detrás de algo tipo "Agregar un comentario" para que se vea claramente
opcional. El placeholder actual es "Cómo te sentiste, si algo molestó, lo que quieras contarle a tu
entrenador".

Y mostrame el mismo día ya COMPLETADO: badge de completado, todo en modo lectura, con un "Reabrir"
discreto.
```

---

## 4. El control de registro opcional (el detalle que define la fase)

```
Pantalla 4 de 4, y es un zoom sobre UN control, no una pantalla entera.

El jugador levantó otro peso del que decía la rutina y quiere anotarlo. Los campos posibles son
tres, y los tres son opcionales por separado:
  - peso real en kg (paso de 0.5)
  - reps que hizo
  - RPE percibido, del 1 al 10 (cuánto le costó)

Requisitos duros:
- En reposo, el control tiene que ocupar casi nada y NO parecer un campo vacío esperando texto. La
  fila del ejercicio se tiene que poder leer como rutina, no como formulario.
- El peso viene prellenado con el valor prescrito, así que el gesto más común es "112 → 120": pocos
  toques, y sin teclado numérico si se puede evitar.
- Se guarda solo, sin botón de guardar. Necesito estados visibles de "Guardando…", "Guardado" y
  error, chicos y sin mover el layout.
- Cuando ya hay algo registrado, la fila tiene que mostrarlo de un vistazo sin abrir nada:
  "usaste 120 kg".

DAME TRES VARIANTES del mismo control, en la fila de "Pecho plano — 4 × 6 — 112 kg":
  1. Un chip chico al costado derecho ("+ registrar") que se expande en la misma fila.
  2. Un slideover que sube desde abajo con los tres campos y botones -/+ grandes.
  3. Los inputs siempre visibles pero angostos, alineados a la derecha de la fila.
Mostrá cada variante en dos estados: sin registrar, y con "120 kg / 5 reps" ya registrado.

Y UNA PREGUNTA DE DISEÑO QUE TE HAGO A VOS, que es la que tengo abierta:
el RPE percibido es el dato más valioso para el entrenador —comparar el RPE que él pidió contra el
que el jugador sintió es lo que le dice si la carga está bien— pero es el que más esfuerzo mental
pide, y pedirlo doce veces por sesión garantiza que nadie lo llene. Las opciones que veo:
  (a) RPE por ejercicio, dentro de este control, opcional.
  (b) RPE una sola vez por día, al cerrar la sesión: un solo control, doce veces menos esfuerzo.
  (c) Sacarlo de la vista del jugador por ahora.
Mockeá la (b) como pantalla de cierre de día y decime, con argumentos de diseño, cuál conviene.
```

---

## Resultado

Los mockups volvieron el mismo día y cerraron las decisiones. Lo que salió de acá está en
`docs/DESIGN-SYSTEM.md` (paleta, tipografía, anatomía de fila, control de registro) y las decisiones
de producto en `2026-07-29-f35-player-dashboard-design.md`.

Este archivo se conserva para poder **regenerar o extender** los mockups —las pantallas del coach, por
ejemplo, que esta tanda no cubrió— sin volver a escribir el contexto desde cero.

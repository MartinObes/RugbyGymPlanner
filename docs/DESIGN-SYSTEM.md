# CoachLab — Sistema de diseño

> Fuente: mockups y especificación de diseño validados con el dueño del repo el **2026-07-29**
> (chat de diseño, a partir de los prompts de
> `docs/superpowers/specs/2026-07-29-f35-design-prompts.md`). Los mockups originales son
> `CoachLab Mockups.dc.html` y no están en el repo: dependen de `support.js` y de los PNG del escudo.
>
> Este archivo es la **fuente de verdad de lo visual**. Las decisiones transversales del proyecto
> siguen en `CLAUDE.md`; si algo de acá contradice a `CLAUDE.md`, manda `CLAUDE.md` y hay que
> corregir uno de los dos, nunca ignorar la diferencia en silencio.

---

## 1. El eje del producto (leer antes de tocar una pantalla del jugador)

El jugador **lee** su rutina, no la completa como formulario. Entra al gimnasio, mira qué ejercicio
le toca, cuántas reps y con cuánto peso, y sigue entrenando. Registrar lo que efectivamente hizo es
**opcional y secundario**: solo tiene sentido si usó un peso distinto al prescrito y quiere dejarlo
anotado.

Cuatro consecuencias que la implementación tiene que respetar:

1. El contenido de la rutina (ejercicio, series × reps, peso prescrito) es siempre lo más grande y
   legible de cada fila. Nunca al revés.
2. Los controles de registro (peso real, reps, RPE percibido) son chicos, opcionales, y en reposo
   **no deben parecer un campo vacío esperando texto**.
3. No hay checkbox de "hecho" por ejercicio. La app solo sabe lo que el jugador **registró**, nunca
   lo que hizo. El copy nunca promete más que eso: **"registrados"**, no "hechos" ni "completados".
4. Nada de tono de app de fitness motivacional. Es la herramienta del club, no un coach virtual.

## 2. Idioma y tono

- Español de Uruguay, tratamiento de **"vos"** siempre (nunca "tú" ni "usted").
- Registro llano y directo: "Poné un nombre", "Elegí tu puesto", "¿Cómo te fue hoy?".
- Sin lenguaje motivacional, sin emojis, sin signos de admiración de más.
- Código, commits e identificadores en inglés (`CLAUDE.md` §5).

## 3. Paleta

Todo sale de los colores del club: **marino, rojo y dorado**, más un **verde botella** (`pitch`) que
se sumó el 2026-08-01.

> ### El veto al verde se levantó — registro de la reversión (2026-08-01)
>
> Hasta esa fecha este párrafo decía, textual:
>
> > **No se usan verde ni ámbar** — se probaron y no funcionan con la identidad del club.
>
> **Queda levantado para el VERDE. Para el ámbar sigue en pie.** No se borra la frase vieja: quien
> lea esto tiene que poder entender qué cambió y por qué, sobre todo si encuentra un comentario o un
> mockup que todavía la repita.
>
> **Qué lo forzó.** La auditoría de §3.6 encontró que `primary` y `warning` resolvían a la MISMA
> paleta (`clubred`), así que el banner "faltan tus 1RM" salía pintado igual que el botón "Completar
> día": una advertencia con la forma de una acción sugerida. Para separarlos hacía falta un color
> más, y los dos candidatos obvios estaban justamente vetados por esta línea.
>
> **Por qué el argumento viejo no se sostenía para el verde.** "El verde no funciona con la identidad
> del club" es cierto **del verde que se probó**, no del verde como tono. Lo que choca no es el matiz:
> es el **croma** (la saturación en CIELAB). Medido:
>
> | Color | Croma CIELAB |
> |---|---|
> | `pitch-500` `#2f6b4f` | **28.5** |
> | `clubred-500` `#7d2230` | 42.3 |
> | `gold-500` `#b48a3f` | 46.0 |
> | `green-500` de Tailwind `#22c55e` | **73.7** |
>
> El verde de Tailwind tiene **2,6×** el croma de este y más que los dos colores del club juntos por
> separado: puesto al lado del marino y del borgoña les grita por encima, y por eso se leía como un
> cuerpo extraño. `pitch-500` está **por debajo** de los dos colores del club. Es un verde que no
> tiene con qué competirles — se lee como un estado ("completado", "mejoró") y nunca le gana de vista
> a un CTA. Esa es exactamente la propiedad que se necesitaba.
>
> **El ámbar sigue vetado, y ahora con un número.** `amber-500` (`#f59e0b`) está a **~7° de matiz** de
> `gold-500` (80.2° contra 72.7° en CIELAB) con **ΔE76 ≈ 36**. No es un color distinto del dorado del
> club: es un **segundo intento del mismo color**. Dos dorados juntos en pantalla no leen como dos
> categorías, leen como un error de impresión. El verde no tiene ese problema porque está a ~80° del
> dorado y a ~140° del rojo.
>
> **Quién lo decidió.** El dueño del repo, que es de quien es la identidad del club. La auditoría de
> §3.6 había recomendado **no** hacerlo (ver ahí) y él revirtió esa recomendación.

### 3.1. Valores del mock

**Modo claro** (caso principal)

| Rol | Valor | Uso |
|---|---|---|
| Texto principal | `#1a1a1a` | Nombre de ejercicio, valores |
| Texto atenuado | `#6f6a63` | Series, "última vez", labels |
| Fondo de página | `#f5f2ec` | Área scrolleable |
| Fondo de tarjeta | `#ffffff` | Cards, filas |
| Fondo de bloque | `#efe9dc` | Header de bloque |
| Borde | `#e4ded2` | Bordes de card y fila |
| Borde de chip | `#d9d0be` | Chip "+ registrar", bordes punteados |
| Marino | `#1a2744` | Peso prescrito, headers, ring de progreso, "Reabrir" |
| Rojo del club | `#7d2230` | CTAs, badge "en progreso" |
| Dorado | `#a3782e` texto · `#f6ecd3` fondo | **`warning`** desde el 2026-08-01: "faltan tus 1RM". Nombre y filete de bloque |
| **Verde botella** | `#2f6b4f` texto · `#f1f6f2` fondo | **`success`** desde el 2026-08-01: badge "Completada", "N registrados", flecha de mejora |
| Tintes de rojo | fondo `#f8e6e5` · borde `#ecc9c8` · texto `#6b1b26` · subtexto `#8a5158` | Tinte de `primary` |
| Dorado del ring | `#c8a15a` | Ring de progreso sobre marino |

**Modo oscuro**

| Rol | Valor | Uso |
|---|---|---|
| Texto principal | `#eef0f5` | Contenido, **y el peso prescrito** (ver §3.4) |
| Texto atenuado | `#a4acc7` | Metadata |
| Texto atenuado en tarjeta | `#8f97b3` | Metadata dentro de cards |
| Fondo de página | `#10152a` | Área scrolleable |
| Fondo de tarjeta | `#1a2038` | Cards, filas |
| Fondo de bloque | `#242c4a` | Header de bloque, chips, badge "Completada" |
| Borde | `#2b3350` | Bordes de card y fila |
| Borde acentuado | `#3a4266` | Chips, bordes punteados |
| Rojo del club | `#96303f` | CTAs, ring, badges. **Sólo de fondo** — como texto ver §3.7 |
| Rojo del club, texto | `#c2707a` | El rojo cuando es TEXTO en oscuro (`clubred-300`, §3.7) |
| Dorado | `#c8a15a` | `warning`, nombre y filete de bloque |
| **Verde botella** | `#7ab08c` | `success`: "Completada", "N registrados", flecha de mejora |
| ~~Azul claro~~ | ~~`#7ea6e8`~~ | **Ya no se usa.** Era la flecha de mejora; la divergencia que lo obligaba desapareció el 2026-08-01 (§3.5, divergencia 2) |
| Tintes de rojo | fondo `#301721` · borde `#5c2733` · texto `#f0a3b2` · icono `#e0637a` | Tinte de `primary` |

**Por qué el rojo no es idéntico entre modos:** en claro el marino ya cumple de color estructural,
así que el rojo puede ser oscuro y contenido (`#7d2230`). En oscuro el marino se funde con el fondo,
así que el rojo asume el rol de acento de acción y necesita más viveza (`#96303f`) — pero
deliberadamente **no** un rojo saturado: se probó `#c1394f` y resultaba demasiado fuerte.

#### El método de contraste, escrito para que se pueda rehacer

Todos los números de este archivo son **WCAG 2.1**, calculados —no estimados a ojo— así:

1. Cada canal a \[0,1]: `c / 255`.
2. Linealizar: `c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4`.
3. Luminancia relativa: `L = 0.2126·R + 0.7152·G + 0.0722·B`.
4. Ratio entre dos colores: `(L_claro + 0.05) / (L_oscuro + 0.05)`.

Umbrales: **4.5:1** para texto normal, **3:1** para texto grande (≥ 18.66 px bold o ≥ 24 px). Los
fondos de página son `#f5f2ec` en claro y `#10152a` en oscuro.

**Los tonos nuevos, contra los dos fondos de página.** Negrita = el uso real de ese tono.

| Tono | Hex | vs `#f5f2ec` (claro) | vs `#10152a` (oscuro) | vs blanco | vs `#1a1a1a` |
|---|---|---|---|---|---|
| `pitch-400` | `#7ab08c` | 2.23 | **7.24** ✅ texto en oscuro | 2.50 ❌ | **6.98** ✅ label sobre relleno |
| `pitch-500` | `#2f6b4f` | **5.63** ✅ texto en claro | 2.87 | **6.29** ✅ label sobre relleno | 2.77 |
| `pitch-600` | `#265a42` | 7.16 | 2.26 | 8.00 | 2.17 |
| `pitch-700` | `#1f4936` | 9.10 | 1.78 | 10.17 | 1.71 |
| `gold-400` | `#c8a15a` | 2.16 | **7.48** ✅ texto en oscuro | 2.41 ❌ | **7.21** ✅ label sobre relleno |
| `gold-500` | `#b48a3f` | 2.83 ❌ | 5.72 | **3.16** ❌ label sobre relleno | 5.51 |
| `gold-600` | `#a3782e` | 3.56 ❌ | 4.54 | 3.97 | 4.38 |
| `gold-700` | `#856026` | **5.08** ✅ texto en claro | 3.18 | 5.68 | 3.07 |
| `clubred-300` | `#c2707a` | 3.19 | **5.07** ✅ texto en oscuro (§3.7) | 3.56 | 4.88 |
| `clubred-400` | `#96303f` | 6.73 | **2.40** ❌ como texto (§3.7) | **7.52** ✅ label sobre relleno | 2.31 |

Tres cosas que salen de esta tabla y no son obvias:

- **`pitch` sirve para las dos cosas.** El 500 aguanta un label blanco encima (6.29:1) y el 400 se lee
  como texto sobre el fondo oscuro (7.24:1). Por eso `success` puede ir en `solid` sin cuidados.
- **`gold` NO sirve de relleno sólido.** Un label blanco sobre `gold-500` da **3.16:1** y sobre
  `gold-400` **2.41:1**: los dos abajo de 4.5:1. De ahí la regla dura de §3.6 — **`warning` va siempre
  `subtle`/`soft`, nunca `solid`**.
- **`gold` como texto en claro empieza recién en el 700** (5.08:1). El 600 se queda en 3.56:1 y el 500
  en 2.83:1. Es la misma razón por la que `BlockSection.vue` usa `text-gold-700` y no el 600.

### 3.2. Dos reglas de color que no son cosméticas

> **"Bajó" nunca es rojo.** Cuando un test de fuerza baja respecto de la medición anterior (Peso
> muerto 155 kg, antes 160 kg), el color es **muted**, nunca rojo ni ningún color de alerta. Bajar en
> un test no es un error del jugador ni algo que la UI deba castigar visualmente.

> **Píldoras para texto chico.** Cualquier metadata corta y aislada (no parte de una oración) va en
> píldora: fondo del mismo color que el texto pero muy tenue (10–18 % de opacidad), texto en el color
> sólido, `border-radius: 100px`, padding `3px 10px`. Ejemplos: "Semana 14", "Sin empezar",
> "3/8 registrados", "Completada". Aplica en los dos modos.

### 3.3. Mapeo a Nuxt UI — el contrato de implementación

Nuxt UI nunca usa un color directo: usa alias que resuelve a una escala de 11 tonos. Verificado
contra **@nuxt/ui 3.3.7**:

- Los alias son extensibles: `type Color = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | (string & {})`.
- Un alias propio se declara en `nuxt.config.ts` → `ui.theme.colors`, y ahí se le genera el puente de
  11 tonos y la variable `--ui-<alias>`.
- La paleta se define en `app/assets/css/main.css` con `@theme static`, y se asocia al alias en
  `app/app.config.ts` → `ui.colors`.
- **Una paleta propia necesita los 11 tonos** (50, 100, 200 … 900, 950). Con menos, hay estados que
  quedan rotos.

| Alias | Paleta | Qué pinta |
|---|---|---|
| `primary` | `clubred` | CTAs, nav activa, badge "en progreso", porcentajes |
| `navy` (alias nuevo) | `navy` | Peso prescrito, ring en claro, acentos estructurales |
| `secondary` · `info` | `navy` | Nadie los usa; apuntados a `navy` para que un `color="info"` accidental no meta un color ajeno |
| `success` | **`pitch`** (era `gold`) | Badge "Completada", "N registrados", flecha de mejora |
| `warning` | **`gold`** (era `clubred`) | "Faltan tus 1RM", filas del import sin match |
| `error` | `red` (Tailwind) | Borrar programa, sacar del plantel |
| `neutral` | `clay` | Fondos, bordes, texto |

> **Los dos remapeos son del 2026-08-01** y el porqué está en §3.6. En una línea: `warning` y
> `primary` eran la misma paleta, así que una advertencia se renderizaba idéntica a un CTA.
>
> ⚠ **`warning` no puede ir en `solid`.** Nuxt UI le pone label blanco en claro y label oscuro en
> oscuro; sobre dorado eso da 3.16:1 y —si alguien "arregla" el oscuro con `dark:text-white`— 2.41:1.
> Los dos overrides de `warning` que había en `app.config.ts` se **borraron** en el mismo cambio, y
> `tests/theme.test.ts` falla si vuelven.
>
> **`pitch` NO se declara en `nuxt.config.ts` → `ui.theme.colors`.** No hace falta y sería un error:
> `pitch` cuelga del alias `success`, que ya está declarado. Agregarlo generaría un `--ui-pitch`
> huérfano que nadie consume.

**`primary` es el rojo del club, no el marino.** `UButton` y `UBadge` usan `primary` por default. Si
el marino fuera `primary`, cada CTA de la app tendría que escribir `color="secondary"` y cualquier
botón nuevo nacería del color equivocado. Con el rojo en `primary` el default es correcto, y el
marino se pide explícito en los pocos lugares donde el mock lo usa.

**`error` se queda en el rojo de Tailwind, a propósito.** Contradice el "todo sale de la paleta del
club", y es deliberado: `app/app.config.ts` ya advertía que *"un error tiene que leerse como error
aunque el club juegue de rojo"*. Los dos rojos conviven lado a lado en el panel del coach —
"Guardar" en borgoña `#7d2230` y "Eliminar" en el rojo más brillante de Tailwind. El más brillante
lee como más alarmante, que es lo correcto para lo destructivo.

### 3.4. Los tonos que consume cada modo, y por qué importa

Nuxt UI 3.3.7 resuelve así (verificado en `@nuxt/ui/dist/runtime/index.css`):

| Variable | Claro | Oscuro |
|---|---|---|
| `--ui-text-dimmed` | `neutral-400` | `neutral-500` |
| `--ui-text-muted` | `neutral-500` | `neutral-400` |
| `--ui-text-toned` | `neutral-600` | `neutral-300` |
| `--ui-text` | `neutral-700` | `neutral-200` |
| `--ui-text-highlighted` | `neutral-900` | `white` |
| `--ui-bg` | `white` | `neutral-900` |
| `--ui-bg-muted` | `neutral-50` | `neutral-800` |
| `--ui-bg-elevated` | `neutral-100` | `neutral-800` |
| `--ui-bg-accented` | `neutral-200` | `neutral-700` |
| `--ui-border` | `neutral-200` | `neutral-800` |
| `--ui-border-muted` | `neutral-200` | `neutral-700` |
| `--ui-border-accented` | `neutral-300` | `neutral-700` |

> **La consecuencia que define la implementación:** los dos modos **comparten** los tonos 200, 300,
> 400, 500, 700 y 900. Una escala `neutral` que empiece cálida (claro) y termine marina (oscuro)
> **no funciona**: los tonos del medio los usan los dos modos y quedarían del color equivocado en uno
> de ellos.

Por eso el sistema es:

1. **`clay` es cálido de punta a punta** y da el modo claro entero.
2. **El modo oscuro sobrescribe las superficies** con los marinos del mock, en un bloque `.dark` de
   `main.css` (10 líneas, hexes explícitos y comentados). No sale de una escala: sale del mock.

Escala `clay`, anclada en los valores del mock — cinco caen exactos en tonos que Nuxt UI consume:

| Tono | Valor | Lo usa como |
|---|---|---|
| 50 | `#f5f2ec` | `bg-muted` — **fondo de página del mock** |
| 100 | `#efe9dc` | `bg-elevated` — **fondo de bloque del mock** |
| 200 | `#e4ded2` | `border` — **borde de card del mock** |
| 300 | `#d9d0be` | `border-accented` — **borde de chip del mock** |
| 400 | `#b3aa9c` | `text-dimmed` |
| 500 | `#6f6a63` | `text-muted` — **atenuado del mock** |
| 600 | `#585349` | `text-toned` |
| 700 | `#43403a` | `text` |
| 800 | `#302d29` | — |
| 900 | `#1a1a1a` | `text-highlighted` — **texto principal del mock** |
| 950 | `#111010` | — |

### 3.5. Las divergencias claro/oscuro que el token system no resuelve

Se escriben con una clase `dark:` explícita. Eran cuatro; desde el 2026-08-01 son **tres**.

1. **El peso prescrito.** Claro: marino. Oscuro: el mock lo pone en el texto principal
   (`#eef0f5`), porque el marino desaparece contra el fondo. → `text-navy-500 dark:text-highlighted`.

2. ~~**La flecha de mejora.**~~ **RESUELTA — ya no es una divergencia (2026-08-01).**

   > Decía: *"Claro: dorado. Oscuro: azul claro `#7ea6e8`, como el mock — el dorado no hace falta
   > ahí. Se escribe con una clase `dark:`, no sale del alias `success`."*

   Esa divergencia **era un síntoma de que `success` estaba en el color equivocado**, no una
   necesidad de diseño. El dorado no funcionaba de "mejoró" en oscuro, así que el mock metía un azul
   que no pertenece a ninguna paleta del club sólo para tapar el agujero.

   Con `success` = `pitch`, el agujero no existe: el alias resuelve solo a `pitch-500` en claro
   (**5.63:1** sobre `#f5f2ec`) y a `pitch-400` en oscuro (**7.24:1** sobre `#10152a`). Los dos pasan
   AA cómodos, los dos son el mismo verde, y la flecha se escribe **`text-success` en los dos modos,
   sin ninguna clase `dark:`**. Se va además el `#7ea6e8`, que era el único color de la app que no
   salía de la paleta del club ni de `error`.

3. **El ring de progreso.** Claro: dorado sobre tarjeta marina. Oscuro: rojo del club sobre tarjeta
   `#1a2038`.

4. **El label de un botón/badge `solid` en oscuro.** Claro: blanco sobre el acento. Oscuro: Nuxt UI
   pone `text-inverted`, que ahí es texto **oscuro**, porque asume una paleta de acento clara (las de
   Tailwind lo son: `red-400` es rosado). Las del club no: `clubred-400` (#96303f) y `navy-400`
   (#4a5b85) siguen siendo oscuras y el label quedaba en **2.31:1** y **2.59:1**, abajo del 4.5:1 de
   WCAG AA. → `dark:text-white` para **`primary` y `navy`** en `app.config.ts` (7.52:1 y 6.72:1).

   **Quedan afuera `success`, `warning` y `error`**, a propósito: sus tonos 400 son claros de verdad
   y con el texto oscuro que pone Nuxt UI dan **6.98:1** (`pitch-400`), **7.21:1** (`gold-400`) y
   **6.29:1** (`red-400`). Ponerles blanco los rompería: **2.50:1**, **2.41:1** y **2.77:1**.

   > **`warning` estaba en la lista de arriba hasta el 2026-08-01 y se sacó en el mismo cambio que lo
   > pasó a dorado.** Mientras `warning` fue `clubred` el override era correcto. Al remapearlo, esa
   > misma línea pasaba a pintar **texto blanco sobre `gold-400`: 2.41:1**, un fallo de AA que no
   > rompe el build, no tira ningún error y sólo se ve mirando la pantalla. Por eso el borrado de las
   > dos líneas (`button` y `badge`) es parte del remapeo, no un pulido posterior — y por eso
   > `tests/theme.test.ts` ahora afirma explícitamente que `warning` **no** las tiene.

> ~~**Pendiente de verificar en browser:**~~ **Verificado el 2026-07-31.** `--ui-primary` resuelve a
> `<paleta>-500` en claro (`#7d2230`) y `<paleta>-400` en oscuro (`#96303f`), leído del DOM vivo con
> `getComputedStyle`. Los dos rojos del mock salen de una sola escala sin ningún `dark:`, como se
> esperaba. Lo que la convención **no** cubre es el *label* sobre ese fondo: esa es la divergencia 4.

### 3.6. Armonía y variedad — auditoría del 2026-07-31 (F4-A)

El dueño del repo reportó que la app se lee **monótona**: "todo rojo o azul o blanco", con poca
variedad para distinguir cosas. Se auditó contando el uso real de cada alias en `packages/web/app/`:

| Alias | Paleta | Usos | Para qué |
|---|---|---|---|
| `primary` | clubred | 15 | CTA, nav activa, porcentajes |
| `error` | red (Tailwind) | 14 | Destructivo |
| `navy` | navy | 11 | Peso prescrito, estructura |
| `success` | gold → **pitch** | 7 | Completado, mejora |
| `warning` | **clubred** → **gold** | 6 | Atención (falta 1RM) |
| `secondary` | — → navy | 0 | Sin mapear |
| `info` | — → navy | 0 | Sin mapear |

> La columna "Paleta" muestra el antes y el después: la auditoría se corrió el 2026-07-31 con la
> configuración vieja y el remapeo se aplicó el 2026-08-01.

**Tres hallazgos.**

**A. `warning` y `primary` son el MISMO color, y esa es la causa principal de la monotonía.** Los dos
son `clubred`, así que 21 de los 53 usos de color de la app pintan el mismo borgoña. Peor que
aburrido: el banner "faltan tus 1RM" sale idéntico al botón "Completar día", así que una advertencia
se lee como una acción sugerida. Es un problema de *señal*, no de gusto. ~~**No se cambió acá**~~ →
**CORREGIDO el 2026-08-01**: `warning` pasó a `gold` y `success` a `pitch`. El detalle y por qué la
recomendación original se dio vuelta están abajo.

**B. `secondary` e `info` estaban declarados en `nuxt.config.ts` pero sin mapear en `app.config.ts`**,
así que resolvían al default de Nuxt UI: el primero que escribiera `color="info"` metía un color
ajeno a la marca sin que fallara nada. **Corregido**: los dos apuntan a `navy`.

**C. El dorado casi no aparecía.** Estaba sólo en `success`, o sea en dos estados puntuales.
**Corregido**: el nombre del bloque y su filete izquierdo van en dorado (`BlockSection.vue`). Se eligió
ese lugar porque aparece en todos los bloques de todas las rutinas —la pantalla que el jugador más
mira— y porque **la estructura no le compite a nada**: el rojo ya es de los CTA y el marino del peso
prescrito, así que el dorado se queda con "dónde empieza cada sección". `gold-700` en claro (5.08:1
sobre `#f5f2ec`) y `gold-400` en oscuro (7.48:1 sobre `#10152a`); el 600 se quedaba en 3.56:1, abajo
del 4.5:1 que necesita un texto de 10 px.

> **Nota del 2026-08-01:** este acento se decidió cuando el dorado era `success` y no pasaba por
> ningún alias — el filete se escribe con `gold-*` directo, así que el remapeo de alias **no lo
> movió**. Lo que sí cambió es que el dorado ahora también es `warning`: el análisis de esa
> convivencia está más abajo, en "Riesgo abierto: dorado sobre dorado".

#### Sobre el hallazgo A: la familia nueva SÍ se agregó (2026-08-01)

> **Esta subsección reemplaza a la anterior, que argumentaba lo contrario.** Se titulaba *"por qué NO
> se agrega un color nuevo"* y su razonamiento era: los dos candidatos obvios (verde y ámbar) ya
> estaban vetados por §3, quien los vetó tenía los mockups compuestos enfrente, y una auditoría con
> un conteo de usos no alcanza para revertir eso. Cerraba diciendo *"la paleta se queda en marino,
> rojo, dorado y el rojo de error"*, y dejaba anotado el costo por si alguna vez se reabría.
>
> **Se reabrió, y el costo se pagó.** El dueño del repo leyó la recomendación de no hacerlo y decidió
> hacerlo igual. Era su decisión: es la identidad de su club. Lo que sigue es el registro de lo que
> se hizo, no una propuesta.

**Qué se cambió, exactamente.**

| | Antes | Después |
|---|---|---|
| `success` | `gold` | **`pitch`** — verde botella, familia nueva de 11 tonos en `main.css` |
| `warning` | `clubred` (= `primary`) | **`gold`**, liberado por el movimiento de arriba |
| `dark:text-white` en `warning` | presente en `button` **y** `badge` | **borrado de los dos** |
| Divergencia 2 de §3.5 | dorado en claro, `#7ea6e8` en oscuro | **eliminada** — `text-success` en los dos modos |

**Por qué el verde y no otra cosa.** El argumento de §3 —"el verde no va con la identidad del club"—
resultó ser cierto del **croma**, no del tono: `pitch-500` tiene croma CIELAB **28.5**, por debajo de
`clubred-500` (42.3) y de `gold-500` (46.0), mientras que el `green-500` de Tailwind está en **73.7**.
El verde stock chirriaba porque le gritaba por encima a los colores del club; éste, que es más apagado
que ellos, no puede. El ámbar sigue descartado y ahora con número: está a ~7° de matiz de `gold-500`
con ΔE76 ≈ 36, o sea que es el mismo color otra vez. El desarrollo completo está en §3.

**La regla de tratamiento sigue viva, y ahora es más dura que antes.** El párrafo viejo decía que
`primary` y `warning` "ya se distinguen por tratamiento" y que la regla era **`warning` siempre en
`subtle`/`soft`, nunca en `solid`**. Eso **no cambia**, y dejó de ser una preferencia para pasar a
ser un requisito de accesibilidad: con `warning` en dorado, un `solid` pone label blanco sobre
`gold-500` (**3.16:1**) o label oscuro sobre `gold-400`, y cualquier intento de "arreglarlo" con
`dark:text-white` da **2.41:1**. Las dos cosas fallan AA. Ver §3.5, divergencia 4.

#### Riesgo abierto: dorado sobre dorado en la pantalla del jugador

Mover `warning` al dorado **recrea en parte la colisión que se estaba arreglando**, sólo que con otro
color. En la misma pantalla conviven ahora:

- El **nombre y el filete de cada bloque** (`components/player/BlockSection.vue`): `border-gold-400`
  + `text-gold-700 dark:text-gold-400`, texto de 10 px, bold, mayúsculas, tracking ancho, sin fondo.
- El **banner "faltan tus 1RM"** (`pages/player/week/[dayId].vue` y `week/index.vue`): `UAlert`
  `color="warning" variant="subtle"`, o sea —verificado en `@nuxt/ui@3.3.7`, `ui/alert.ts`—
  `bg-warning/10 text-warning ring ring-inset ring-warning/25`: un rectángulo tintado de ancho
  completo, con ícono `i-lucide-triangle-alert`, título y descripción en texto corrido.

**Veredicto: el tratamiento alcanza para distinguirlos, pero por poco, y a costa de un problema
distinto que sí hay que arreglar.**

- **No se confunden entre sí.** Uno es un rectángulo con fondo, borde e ícono de alerta que ocupa el
  ancho de la pantalla; el otro es una línea de 10 px en mayúsculas sin fondo, pegada a un filete de
  2 px. La diferencia de forma, de tamaño y de densidad es enorme: nadie va a leer "PRENSA" como una
  advertencia ni al revés. Es un caso bastante mejor que el que se estaba arreglando, donde banner y
  CTA eran los dos rectángulos sólidos del mismo borgoña.
- **Pero el dorado deja de significar una sola cosa.** Antes era "estructura". Ahora es "estructura"
  *y* "atención", y esa ambigüedad no se resuelve mirando más fuerte. Como el banner aparece sólo
  cuando faltan 1RM —o sea rara vez, y arriba de todo— se acepta.
- **El problema real que aparece es de contraste, no de confusión.** El `subtle` de Nuxt UI pinta el
  texto con `text-warning`, que resuelve a `gold-500` en claro. Sobre su propio fondo (`gold-500` al
  10 %) eso da **2.59:1** sobre la página y **2.86:1** sobre una tarjeta blanca: **abajo de AA**. Con
  `warning` en `clubred` el mismo banner daba 7.38:1, así que esto es un **retroceso medible**
  introducido por el remapeo. En oscuro no pasa: `gold-400` sobre el tinte da 6.62:1.

  **Arreglo, pendiente y anotado:** el banner tiene que pisar el color del texto con
  `text-gold-700 dark:text-gold-400` —el mismo par que ya usa `BlockSection.vue`—, que sobre el tinte
  claro da **4.66:1** y pasa. Es un cambio en `.vue`, así que **no está hecho en este cambio**: acá
  se tocaron sólo `main.css`, `app.config.ts`, `tests/theme.test.ts` y este documento.

### 3.7. Un acento no puede ser relleno y texto a la vez en modo oscuro

Esto es una **restricción aritmética**, no una preferencia, y explica por qué la app tiene clases
`dark:text-clubred-300` sueltas en vez de un token que lo resuelva.

**El caso.** `--ui-primary` resuelve a `clubred-400` (`#96303f`) en oscuro. Como **relleno** de un
botón funciona: con label blanco encima da **7.52:1**. Como **texto** sobre el fondo de página
`#10152a` da **2.40:1** — muy abajo de AA. O sea que `text-primary` en oscuro es ilegible mientras
que `bg-primary` está perfecto, con el mismo hex.

**Por qué no hay un hex que sirva para las dos cosas.** Con el método de §3.1, para un color de
luminancia `L`:

- Para que aguante un **label blanco** (`L_blanco = 1.0`) a 4.5:1 hace falta
  `(1.0 + 0.05) / (L + 0.05) ≥ 4.5`, o sea **`L ≤ 0.1833`**.
- Para que se lea **como texto** sobre `#10152a` (`L_fondo = 0.008137`) a 4.5:1 hace falta
  `(L + 0.05) / (0.008137 + 0.05) ≥ 4.5`, o sea **`L ≥ 0.2116`**.

**Las dos ventanas no se tocan** (`0.1833 < 0.2116`). No existe ningún color —ni de esta paleta ni de
ninguna— que cumpla las dos condiciones. No es un problema de haber elegido mal el borgoña: es
geometría del espacio de color. Y los números confirman los extremos: `clubred-400` tiene
`L = 0.0896` (relleno ✅, texto ❌ 2.40:1) y `clubred-300` `L = 0.2446` (texto ✅ **5.07:1**, relleno ❌
3.56:1 con blanco).

**La consecuencia práctica: el arreglo va por uso, nunca en el token.**

- ✅ `class="dark:text-clubred-300"` donde el rojo del club se use como **texto** en oscuro.
- ❌ Redefinir `--ui-primary` en el bloque `.dark` de `main.css`. Eso arreglaría el texto y
  **rompería todos los rellenos a la vez** — cada botón primario pasaría a tener el label blanco a
  3.56:1. El token tiene un solo valor y los dos usos piden valores incompatibles.

Vale igual para `navy`: `navy-400` como relleno da 6.72:1 con blanco, y como texto sobre `#10152a`
sólo 2.69:1. Y **no** vale para `pitch`, `gold` ni `red`, que son claros de verdad en su tono 400: por
eso ésos van de texto sin ningún `dark:` (7.24:1, 7.48:1 y 6.53:1) y en cambio necesitan label
**oscuro** cuando son relleno. Es la misma tabla de §3.1 leída al revés.

## 4. Escudo del club

Marca de agua en la esquina superior derecha, **en el shell de la app** (`layouts/default.vue`), no
por pantalla.

- Posición: `top: 6px; right: 6px`. Tamaño: **34 px de ancho** (el asset es 391×511, así que 34 px de
  ancho da 44 px de alto).
- El contenido lleva `padding-top` extra para que no quede pegado al título ni a la píldora de semana.

**Variante: `two-tone`.** El set completo de variantes vive en `escudos/` (seis versiones × varios
tamaños, aportadas por el dueño del repo). Los dos que usa la app:

| Modo | Archivo de origen | Qué es |
|---|---|---|
| Claro | `escudos/escudo-two-tone-light@128.png` | Trazo rojo, interior claro |
| Oscuro | `escudos/escudo-two-tone-dark@128.png` | Relleno rojo, detalles blancos |

Se copian a `packages/web/public/` como `escudo-light.png` y `escudo-dark.png`. Se usa el **@128** y
no el @256: a 34 px de ancho el @128 ya da 3,7× de densidad —de sobra para cualquier pantalla— y pesa
la cuarta parte.

**Por qué `two-tone` y no una silueta monocromática**, que es lo que se había especificado primero:
se bajaron las tres variantes a 34 px reales y se compusieron sobre los dos fondos.

- **`solid` a 34 px es un borrón.** Rellenar el interior destruye lo que hace legible un escudo —el
  contraste entre trazo e interior— y los rayos del sol se vuelven ruido.
- **`line` aguanta**, pero sobre el fondo claro queda lavada: tiene solo 24 % de tinta.
- **`two-tone` lee como escudo** en los dos modos: se distinguen el borde, el interior, los rayos, y
  se insinúa el león.

Esto descarta de paso la idea de pintar el escudo con un `mask-image` de CSS y el token de color, que
habría dado un solo archivo y el color exacto de la paleta: **el mask solo funciona con un asset de un
color plano**, o sea con `solid`, que es la peor de las tres.

> **Consecuencia aceptada: el escudo tiene su propio rojo.** El asset es `#7b1113` y el rojo del club
> en la paleta es `#7d2230` — misma luminosidad, distinta tonalidad (rojo puro contra borgoña). Es la
> práctica normal: el escudo conserva sus colores oficiales y la UI usa su paleta. Además no compiten
> en pantalla: la marca de agua va arriba a la derecha y el CTA rojo abajo. Si molesta al verlo en el
> browser, recolorear el rojo del asset a `#7d2230` es un script chico.

Los `tile-*` de `escudos/` (cuadrados, con fondo rojo) **no se usan**. Quedan disponibles para un
favicon, un `og:image` o un ícono de PWA si algún día hacen falta.

## 5. Tipografía

- Family: `system-ui` / `-apple-system` / "Helvetica Neue" / Arial — el default de Nuxt UI, sin
  carga de fuente (y sin costo de red, `CLAUDE.md` §1).
- Nombre de ejercicio: **15–16 px, weight 600**.
- Peso prescrito, el dato más importante de la fila: **18–19 px, weight 700**. Siempre el elemento
  visualmente más grande de la fila.
- Series × reps: 12–13 px, muted, al lado del nombre.
- Metadata de contexto (RPE objetivo, "última vez"): 11 px, muted.
- **Nunca bajar de 11 px** en ningún texto de la UI.

## 6. Layout

Ancho de referencia: **380 px**. Todo tocable sin zoom: **objetivos táctiles de 44 px de alto real**.
Los chips se ven más chicos en el mock porque está renderizado a escala; en la implementación el área
táctil del chip o de la fila se expande a 44 px aunque el contenido visual sea más compacto.

**Cómo se cumple (2026-07-31).** El default de Nuxt UI daba **32 px** medidos en pantalla, no 44: sus
tamaños son padding, no alto fijo (`md` = `px-2.5 py-1.5 text-sm`). El tamaño `md` está redefinido en
`app.config.ts`, así que la regla se cumple sola y ningún control nuevo nace chico:

| | Clases | Alto | Fuente |
|---|---|---|---|
| `UButton` | `px-3.5 py-3 text-sm` | 44 px | 14 px |
| `UInput` · `USelect` · `UTextarea` · `UInputNumber` | `px-3 py-2.5 text-base` | 44 px | **16 px** |

Los **16 px del campo editable no son estética**: abajo de eso Safari en iOS hace zoom solo al
enfocar y deja al jugador con la pantalla corrida. Es la mitad de "tocable **sin zoom**" que el alto
no cubre. El botón se queda en 14 px a propósito — el zoom de iOS solo dispara en campos editables,
así que subirle la fuente engordaría la tipografía sin arreglar nada.

## 7. Anatomía de una fila de ejercicio

De arriba a abajo, en este orden de jerarquía:

1. **Nombre** (15 px, 600) + **series × reps** (12 px, muted) en la misma línea, a los extremos.
   Las series se muestran **solo si son > 1**: `4 × 6` para Sentadilla, `10` solo para Lagartijas.
2. **Peso prescrito** (18–19 px, 700) + **control de registro**, a los extremos. Es la línea más
   importante de la fila.
3. **Contexto** (11 px, muted, opcional): "RPE 8" —el objetivo que puso el coach, es informativo y
   nunca debe parecer un campo a llenar— y "última vez": "Semana 13 · Sesión 1: 105 kg · 6 reps".

### Las cuatro formas de carga

| Forma | Ejemplo | Tratamiento |
|---|---|---|
| kg fijos | `112 kg` | Grande, marino en claro |
| % resuelto | `80% → 112 kg` | El `80% →` en muted regular, el `112 kg` en marino bold — el resultado en kg es lo que manda |
| % sin 1RM | `80% — falta tu 1RM de Sentadilla` | Todo en rojo del club. **Reemplaza al peso, no lo acompaña** |
| Etiqueta de planilla | `p.corp`, `barra`, `goma`, `med 9` | Tal cual, mismo tratamiento que un valor en kg: es igual de "la carga" que un número |

## 8. Control de registro

**Slideover** (bottom sheet). Se evaluaron tres variantes y se descartó la de inputs siempre
visibles: aunque sean chicos, estar siempre presentes hace que la fila se lea como grilla de
formulario **incluso vacía** — exactamente lo que hay que evitar. El slideover mantiene la fila en
modo lectura y trae la interacción solo al tocarla.

- **En reposo:** chip chico a la derecha, borde sutil, sin fondo, texto muted "+ registrar"
  (`i-lucide-plus`). Es un botón, no un input.
- **Al tocar:** `USlideover` con el nombre del ejercicio + "· prescrito 112 kg" en muted, y tres
  controles opcionales por separado: **peso** (stepper −/+, paso 0.5, prellenado con el prescrito
  porque el gesto más común es `112 → 120`), **reps** y **RPE percibido** (1–10).
- **Sin botón "Guardar":** se guarda solo. Debajo, un estado chico que no mueve el layout:
  "Guardando…" (`i-lucide-loader-circle`), "Guardado" (✓), o el error.
- **Registrado:** la fila vuelve a modo lectura y muestra un chip con fondo tenue
  "120 kg / 5 reps" + `i-lucide-pencil` para reabrir.

## 9. El RPE percibido se pide una vez por día

**Decisión de producto.** El RPE por ejercicio compite con el eje del producto doce veces por sesión,
y pedirlo tantas veces garantiza que nadie lo complete. Preguntarlo **una sola vez al cerrar el día**
preserva el dato que le importa al entrenador —comparar RPE pedido vs. sentido, que `CLAUDE.md` §1
define como el dato clave— sin convertir la rutina en una encuesta repetida.

Implementación: junto al botón "Completar día", un único selector "¿Cómo te fue hoy?" con escala
1–10, **opcional**, que no bloquea el cierre. El RPE por ejercicio se conserva como campo opcional
dentro del slideover: la columna ya existe y ya se escribe.

## 10. Mapeo a componentes Nuxt UI

| Elemento | Componente |
|---|---|
| Card de tendencia, card de día, bloque | `UCard` |
| Banner de 1RM faltante | `UAlert` con `color="warning"` |
| Badges y píldoras | `UBadge` |
| CTAs | `UButton` (default `primary` = rojo del club) |
| Control de registro | `USlideover` + steppers armados con `UButton` icon-only + valor (no hay stepper nativo) |
| RPE al cierre del día | `URadioGroup` o `UButtonGroup` segmentado |
| Comentario colapsable | Toggle simple + `UTextarea` |
| Estado vacío | Layout custom centrado |

**Iconos: solo Lucide**, y la lista de `clientBundle.icons` en `nuxt.config.ts` es explícita.
`tests/icons.test.ts` falla en los **dos** sentidos: si se usa uno que no está declarado (no se ve en
producción y el build no falla), y si queda declarado uno que la app ya no usa.

Iconos del mock: `chevron-right`, `check-circle`, `circle-dashed`, `circle`, `triangle-alert`,
`plus`, `pencil`, `loader-circle`, `message-square-plus`, `rotate-ccw`, `calendar-x`, `trending-up`,
`trending-down`, `minus`.

## 11. Datos de ejemplo

Calcos anonimizados de las planillas reales, para pruebas y mockups:

- **Ejercicios:** Pecho plano, Lagartijas pronos, Sentadilla, Peso muerto, Remo Pendlay, Dominadas,
  Estocadas, Prensa, Curl femoral, Abdominales rueda.
- **Días:** "Sesión 1 - Lunes", "Sesión 2 - Miércoles", "Sesión 3 - Viernes".
- **Semanas:** "Semana 14", "Semana 15".

> **Las planillas reales no van al repo:** tienen datos personales (la hoja "Grupos" lista apellidos
> y apodos del plantel) y `.gitignore` bloquea `*.xlsx`. Tampoco van nombres de jugadores a un chat
> de diseño.

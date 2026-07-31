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

Todo sale de los colores del club: **marino, rojo y dorado**. **No se usan verde ni ámbar** — se
probaron y no funcionan con la identidad del club.

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
| Rojo del club | `#7d2230` | CTAs, banner de atención, badge "en progreso" |
| Dorado | `#a3782e` texto · `#f6ecd3` fondo | Badge "Completada", flecha de mejora |
| Tintes de rojo | fondo `#f8e6e5` · borde `#ecc9c8` · texto `#6b1b26` · subtexto `#8a5158` | Banner "faltan tus 1RM" |
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
| Rojo del club | `#96303f` | CTAs, ring, banners, badges |
| Azul claro | `#7ea6e8` | Flecha de mejora (reemplaza al dorado) |
| Tintes de rojo | fondo `#301721` · borde `#5c2733` · texto `#f0a3b2` · icono `#e0637a` | Banner "faltan tus 1RM" |

**Por qué el rojo no es idéntico entre modos:** en claro el marino ya cumple de color estructural,
así que el rojo puede ser oscuro y contenido (`#7d2230`). En oscuro el marino se funde con el fondo,
así que el rojo asume el rol de acento de acción y necesita más viveza (`#96303f`) — pero
deliberadamente **no** un rojo saturado: se probó `#c1394f` y resultaba demasiado fuerte.

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
| `primary` | `clubRed` | CTAs, banner de atención, badge "en progreso" |
| `navy` (alias nuevo) | `navy` | Peso prescrito, ring en claro, acentos estructurales |
| `success` | `gold` | Badge "Completada", flecha de mejora |
| `warning` | `clubRed` | "Faltan tus 1RM" |
| `error` | `red` (Tailwind) | Borrar programa, sacar del plantel |
| `neutral` | `clay` | Fondos, bordes, texto |

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

### 3.5. Las cuatro divergencias claro/oscuro que el token system no resuelve

Se escriben con una clase `dark:` explícita. Son estas y ninguna más:

1. **El peso prescrito.** Claro: marino. Oscuro: el mock lo pone en el texto principal
   (`#eef0f5`), porque el marino desaparece contra el fondo. → `text-navy-500 dark:text-highlighted`.
2. **La flecha de mejora.** Claro: dorado. Oscuro: **azul claro `#7ea6e8`**, como el mock — el dorado
   no hace falta ahí. Se escribe con una clase `dark:`, no sale del alias `success`.
3. **El ring de progreso.** Claro: dorado sobre tarjeta marina. Oscuro: rojo del club sobre tarjeta
   `#1a2038`.

4. **El label de un botón/badge `solid` en oscuro.** Claro: blanco sobre el acento. Oscuro: Nuxt UI
   pone `text-inverted`, que ahí es texto **oscuro**, porque asume una paleta de acento clara (las de
   Tailwind lo son: `red-400` es rosado). Las del club no: `clubred-400` (#96303f) y `navy-400`
   (#4a5b85) siguen siendo oscuras y el label quedaba en **2.31:1** y **2.59:1**, abajo del 4.5:1 de
   WCAG AA. → `dark:text-white` para `primary`, `warning` y `navy` en `app.config.ts` (7.52:1 y
   6.72:1). **`gold` y `error` quedan afuera a propósito:** son claros de verdad y con texto oscuro
   dan 7.21:1 y 6.29:1 — ponerles blanco los rompería (2.41:1 y 2.77:1).

> ~~**Pendiente de verificar en browser:**~~ **Verificado el 2026-07-31.** `--ui-primary` resuelve a
> `<paleta>-500` en claro (`#7d2230`) y `<paleta>-400` en oscuro (`#96303f`), leído del DOM vivo con
> `getComputedStyle`. Los dos rojos del mock salen de una sola escala sin ningún `dark:`, como se
> esperaba. Lo que la convención **no** cubre es el *label* sobre ese fondo: esa es la divergencia 4.

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

# F4 — El click-through con sesión real

> **2026-08-02.** Cierra la deuda que venía abierta desde F3: `IMPLEMENTATION-F3.5.md` §6.1 decía
> *"sigue sin mirarse NINGUNA pantalla autenticada"*. Ahora sí se miraron.

---

## 1. Cómo se consiguió la sesión, y por qué importa el cómo

La deuda estaba trabada por una creencia razonable pero **falsa**: que para poblar una sesión hacía
falta `SUPABASE_SERVICE_ROLE_KEY`, que no está en `.env` y no debe estar (`CLAUDE.md` §4). Los dos
scripts que existían (`verify:setup`, `smoke:player`) sí la piden, y de ahí salía la conclusión.

**No hacía falta.** Se registraron un coach y un jugador **por la UI**, como haría un usuario:

1. `/register` con rol Entrenador → cae en `/coach/players`, que le muestra su código de invitación.
2. `/register` con rol Jugador y ese código → cae en `/player`, ya vinculado al coach.

Cero secretos, y de yapa queda ejercitado el flujo de alta y el trigger `handle_new_user`. Las
sesiones se guardan como `storageState` de Playwright y se reusan entre pasos.

> **Playwright vive FUERA del repo**, en el scratchpad, para no tocar el lockfile — mismo criterio
> que el click-through parcial de F3.5. Se usa `playwright-core` contra el Chrome ya instalado, así
> que tampoco baja un navegador.

## 2. Lo que se verificó

Todo lo de abajo está **medido del DOM vivo**, no leído del código.

### El diferencial del producto funciona

```
1RM 140 kg  ·  ejercicio al 80 %  →  la pantalla del jugador muestra:

    "80% → 112 kg · 5 reps"
```

Es la primera vez que se comprueba en un navegador la promesa central de `CLAUDE.md` §1: un plan en
porcentaje escalando a kilos personalizados.

### El registro, campo por campo

| Campo | Placeholder | Valor guardado | De dónde sale | Alto | Fuente |
|---|---|---|---|---|---|
| Peso | `112` | **vacío** | el peso prescrito | 44 px | 18 px |
| Reps | `5` | **vacío** | `parsePlannedReps` del plan | 44 px | 18 px |
| RPE percibido | `8` | **vacío** | **el `target_rpe` del coach** | 44 px | 18 px |

La variante B del diseño se cumple: **el número del plan se ve pero no se guarda solo.** Escribir
`117.5` en el campo de peso funcionó y el valor sobrevivió al recargar, o sea que el autosave llegó a
la base. El campo era un `<span>` de sólo lectura hasta F4-A.

Los 44 px y los 18 px cumplen `DESIGN-SYSTEM.md` §6 **medidos**, no calculados: arriba de los 16 px
que evitan el zoom automático de Safari en iOS.

### Contraste, en las dos puntas

| Pantalla | Elemento | Color | Fondo | Ratio |
|---|---|---|---|---|
| `/register` oscuro | link "Entrá" | `#c2707a` | `#10152a` | **5.07:1** |
| `/login` oscuro | link "Registrate" | `#c2707a` | `#10152a` | **5.07:1** |
| ambas, oscuro | CTA submit | blanco | `#96303f` | **7.52:1** |
| `/register` claro | link "Entrá" | `#7d2230` | blanco | **9.80:1** |

El 5.07 que la auditoría había **calculado** dio 5.07 **medido**. El P0 de modo oscuro está cerrado:
antes esos links estaban en 2.40:1 y en la práctica desaparecían.

Los tokens resuelven a la paleta nueva en los dos modos: claro `primary #7d2230` · `success #2f6b4f`
· `warning #b48a3f`; oscuro `primary #96303f` · `success #7ab08c` · `warning #c8a15a`.

### Lo demás

- **El shell móvil**: escudo y interruptor de tema en una barra fija arriba. El interruptor **no
  existía** en celular antes de F4-A.
- **El typeahead ya no se recorta**: el menú se monta en `<body>` (`montadoEnBody: true`) y queda
  dentro del viewport aunque el editor tenga `overflow-x-auto`.
- **`normName` anda en el navegador**: buscar `bulgara` sin tilde encuentra "Sentadilla Búlgara".
- **Los estados vacíos son correctos**: sin programa asignado, "Todavía no tenés un programa
  asignado", no una pantalla en blanco.
- **Cero errores de consola y cero `pageerror`** en todo el recorrido.

## 3. Los tres defectos que sólo aparecieron al mirar

Ninguno lo agarraba `lint`, `typecheck` ni los 450 tests.

**A. El tab activo no tenía subrayado. → Arreglado.** La clase base del link lleva
`border-transparent` y el estado activo agrega `border-primary`: **misma especificidad**, así que
ganaba la que Tailwind emitiera después en la hoja, y ganaba la transparente. Medido:
`borderBottomColor: rgba(0, 0, 0, 0)` estando activo. Se resolvió con `!border-primary`. Verificado
después del arreglo: `rgb(125, 34, 48)` a 2 px, y sólo en el tab activo.

**B. El hint del plan decía `112kg`, pegado. → Arreglado.** El espacio estaba como texto suelto entre
tags y Vue lo condensa al compilar el template. Ahora va dentro de la interpolación. Verificado:
`"plan: 112 kg"`.

**C. `USelectMenu` se anuncia como "Show popup".** Su nombre accesible sale de un `aria-label` de
Nuxt UI —**en inglés, en una app en español**— en vez del label del campo o del valor elegido. Un
lector de pantalla dice "Show popup" en lugar de "Destino". Se descubrió porque ningún selector por
nombre accesible lo encontraba. **NO está arreglado**: es un default de la librería y tocarlo pide
decidir qué debería anunciar cada uno de sus usos.

También quedó a la vista, sin arreglar: en la pantalla de asignaciones el label y el hint se pegan —
**"Prioridad extrabase 100"**.

## 4. Lo que sigue sin verificarse

- **Los 7 modales de confirmación.** El recorrido no llegó a dispararlos.
- **La colisión dorado sobre dorado**: `warning` es dorado y el nombre de bloque también. No se pudo
  comparar porque el bloque de prueba se creó sin nombre, y sin nombre no se renderiza el encabezado
  dorado (`hasHeader` es falso). Hay que repetirlo con un bloque nombrado.
- **La carrera del 409 al completar el día** y **el re-login tras cambiar la contraseña**.
- **Todo lo de `import.vue`**, que necesita una planilla real.

## 5. Datos de prueba que quedaron en el proyecto

El recorrido creó filas **en el proyecto Supabase de verdad**:

- Un coach `coach.<stamp>@coachlab.test` con su código de invitación.
- Un jugador `jugador.<stamp>@coachlab.test`, vinculado a ese coach.
- Un 1RM de 140 kg en Sentadilla, un programa "Mesociclo de prueba" con su semana, día, bloque y
  ejercicio al 80 %, y una entrada de registro de 117.5 kg.

**Conviene borrarlos.** No molestan a nadie —son de un coach que no existe— pero ensucian el plantel
si alguien mira la base. Los emails llevan `@coachlab.test`, así que se identifican de una.

# Handoff — dónde quedó F4 y qué falta

> Escrito el **2026-08-02** para que otra sesión siga sin re-derivar nada.
> Leé `CLAUDE.md` entero primero; esto es el delta, no un reemplazo.

---

## 1. El estado en una frase

Se hizo una **pasada grande de UI/UX** y quedó mergeada a `main` — pero **el F4 del roadmap
(`CLAUDE.md` §6) NO está hecho**: la vista de feedback del coach no existe.

`main` está en `d935659` y **pusheado**. Los tres gates en verde sobre `main` ya mergeado:

| Gate | Exit | |
|---|---|---|
| `pnpm lint` | 0 | 3 paquetes |
| `pnpm typecheck` | 0 | 3 paquetes |
| `pnpm test` | 0 | **450** (baseline previo 402) |

## 2. Qué se hizo (no lo rehagas)

Los 11 pedidos del dueño del repo, más lo que dos rondas de auditoría encontraron encima:

| Qué | Dónde |
|---|---|
| Barra superior fija en celular con escudo **y el interruptor de tema, que no existía en mobile** | `app/layouts/default.vue` |
| `:exact` no es prop de NuxtLink en Nuxt 3/4 → dos tabs encendidos. Resuelto con `:active-class`/`:exact-active-class` | `pages/coach/programs/[programId].vue` |
| El campo de registro pasó de `<span>` de sólo lectura a input tecleable con coma decimal | `components/player/StepperField.vue` |
| Typeahead recortado por `overflow-x-auto` → `UInputMenu` con portal a `<body>` | `components/ExerciseTypeahead.vue` |
| `warning` dejó de compartir `clubred` con `primary`; `success` estrenó `pitch` (verde botella) | `app.config.ts`, `main.css` |
| El P0 de contraste: `clubred-400` como texto daba 2.40:1 en oscuro en sus 10 usos | varios `.vue` |
| 7 confirmaciones de borrado, 3 estados de error de red, buscador en el plantel | varios |
| Transición de página + `NuxtLoadingIndicator`; 3 pantallas dejaron de encadenar sus cargas | `app.vue`, `nuxt.config.ts` |
| 41 tests nuevos | `packages/web/tests/` |

Documentos que dejó, y que responden preguntas antes de que las hagas:

- **`docs/CLICKTHROUGH-F4.md`** — el recorrido en browser con sesión real. **Leelo antes de tocar UI.**
- **`docs/PERFORMANCE-F4.md`** — por qué cambiar de vista tarda, con números medidos.
- **`docs/DESIGN-SYSTEM.md` §3.6 y §3.7** — la auditoría de color y por qué se levantó el veto al verde.
- **`docs/superpowers/specs/2026-07-31-f4b-assignment-model-design.md`** — F4-B, escrito y **sin ejecutar**.

## 3. Lo que falta, en orden

### Paso 1 — Keepalive de UptimeRobot · **lo hace el dueño del repo** · 10 min

Va primero por calendario: **Supabase pausa un proyecto free a los 7 días sin actividad de base.**

1. Cuenta gratis en uptimerobot.com
2. New Monitor → HTTP(s) → `<url-de-vercel>/health`, intervalo 5 minutos
3. Su mail para las alertas

`/health` ya existe y hace un `select 1` real, así que cuenta como actividad. Es lo último que le falta
al F4 de infraestructura.

### Paso 2 — La vista de feedback del coach · **esto es el F4 de verdad**

Hoy **el jugador puede completar un día y el coach no tiene dónde verlo.** Verificado en browser: el
día se completa, el toast dice "Tu entrenador ya lo puede ver", y esa pantalla no existe.
`pages/coach/feedback/` tiene sólo un `.gitkeep` y ninguna ruta de la API menciona feedback.

Lo que pide `CLAUDE.md` §6:

> vista coach con progreso "2/3 días" y **el RPE del día (`session_logs.perceived_rpe`) contra los
> `target_rpe` del día**, con notas

Piezas:

1. **API** — `packages/api/src/routes/coach/feedback.ts`, montada bajo el grupo que ya lleva
   `requireRole(['COACH','ADMIN'])`. Devuelve por jugador: días completados sobre el total de la
   semana vigente, y por día el `perceived_rpe` contra los `target_rpe` de sus ejercicios, más la nota.
2. **Pantallas** — `pages/coach/feedback/index.vue` (plantel con su "2/3 días") y
   `feedback/[playerId].vue` (el detalle). Ojo con la regla de nombres de Nuxt (`CLAUDE.md` §5): estas
   dos **no comparten estado**, así que van como hermanas con `index.vue`, no como padre/hijo.
3. **Tests de scoping** — un coach no ve el feedback de un plantel ajeno, y eso da **404, no 403**.

**No escribas la comparación de RPE**: `rpeDelta` ya existe en `packages/core/src/domain/` y está
testeada. La ruta trae los datos y el dominio decide.

**Corré `rbac-auditor` antes de mergear**: es una ruta nueva que toca datos de jugador.

### Paso 3 — La decisión pendiente · **sólo la puede tomar el dueño del repo**

Cómo recupera la contraseña un jugador que se la olvidó. Hoy el único camino es `pnpm set:password` a
mano. Resetear la de OTRO usuario exige la `service_role`, que `CLAUDE.md` §4 prohíbe en un request:
las tres opciones y sus riesgos están en `IMPLEMENTATION-F2.md` §5.5 B. **Preguntá, no elijas.**

### Paso 4 — Terminar el click-through

`CLICKTHROUGH-F4.md` §4 lista lo que quedó sin ver. Ahora es barato porque el andamiaje ya está
resuelto (ver §4 de este documento):

- **6 de los 7 modales** de confirmación.
- **La colisión dorado sobre dorado**: `warning` es dorado y el nombre de bloque también. No se pudo
  comparar porque el bloque de prueba quedó sin nombre — y **sin nombre no se renderiza el encabezado
  dorado** (`hasHeader` es falso). Hay que crear un bloque CON nombre y un ejercicio en % sin 1RM, para
  tener las dos cosas doradas en la misma pantalla.
- **El re-login tras cambiar la contraseña.**
- **`import.vue`**, que necesita una planilla real (y las planillas **no van al repo**: tienen datos
  personales, `.gitignore` bloquea `*.xlsx`).

### Paso 5 — F4-B, el modelo de asignación

El spec está commiteado y aprobado por el dueño del repo. Resumen: **gana la última asignada** (se
borra la resolución por prioridad), **se elimina el puesto como destino** (queda jugador / grupo
system / grupo custom), y el jugador puede volver a otra de sus rutinas con una elección que **se
resetea cuando el coach asigna algo nuevo**.

⚠ **El orden de la migración no es libre.** `position_id` vive dentro de `program_reaches_me()`, que es
`security definer` y la usan las políticas de RLS — y está **redefinida en `0005`**, no en `0003`.
**Reescribí la función primero y recién después dropeá la columna**, o toda lectura del programa del
jugador falla. Es un error que ni `typecheck` ni los tests de dominio agarran.

### Paso 6 — Borrar los datos de prueba

El dueño del repo pidió **dejarlos por ahora**. Cuando avise: son las cuentas `@coachlab.test` (un
coach y un jugador), su 1RM, el programa "Mesociclo de prueba" y una entrada de registro.

---

## 4. Cómo trabajar acá — lo que costó descubrir

### Conseguir una sesión de browser NO necesita `service_role`

Esta era la creencia que trabó el click-through desde F3.5, y **es falsa**. Los scripts existentes
(`verify:setup`, `smoke:player`) sí la piden, pero no hacen falta:

1. `/register` con rol **Entrenador** → cae en `/coach/players`, que muestra su código de invitación.
2. `/register` con rol **Jugador** + ese código → cae en `/player`, ya vinculado.

Cero secretos, y de yapa queda ejercitado el trigger `handle_new_user`.

### El andamiaje de Playwright

- **Va FUERA del repo**, en el scratchpad, para no tocar el lockfile: `npm install playwright-core`.
- Se usa `playwright-core` contra el Chrome instalado
  (`C:/Program Files/Google/Chrome/Application/chrome.exe`), así que no baja ningún navegador.
- **El modo oscuro se activa con `colorScheme: 'dark'` en el contexto**, no con la cookie
  `nuxt-color-mode` — la cookie no aplicó.
- Guardá y reusá `storageState` entre pasos, si no cada script vuelve a registrarse.

### Selectores que funcionan con Nuxt UI 3.3.7

| Componente | Selector |
|---|---|
| `USelect` | `button[role="combobox"]` |
| `USelectMenu` | `button[aria-haspopup="listbox"]` — **su nombre accesible es "Show popup"**, no su texto |
| Opciones de los dos | `getByRole('option', { name: ... })` |

> Ese `aria-label="Show popup"` es un hallazgo de accesibilidad sin arreglar: está **en inglés en una
> app en español** y no dice de qué campo se trata. Un lector de pantalla dice "Show popup" en vez de
> "Destino".

### Trampas que ya mordieron

- **`vue-tsc` sale con código 0 estando roto.** Escupe un stack trace de
  `vue-router/volar/sfc-route-blocks` que es ruido inofensivo, pero este repo tiene historial de dar
  verde sin mirar el frontend. **Antes de confiar en un typecheck verde, inyectá un error de tipos en
  un `.vue` y confirmá que sale con exit 2.** Se hizo dos veces y las dos veces el gate resultó real.
- **El server de dev tarda ~40 s en levantar** y el primer request compila todo. Un `curl` se cuelga;
  Playwright con `timeout: 240000` no.
- **`git merge -F -` no existe.** El mensaje va en un archivo. Y ojo: si el `checkout` ya corrió,
  quedás parado en la rama destino sin mergear.
- **En Bash usá heredoc (`<<'EOF'`), no here-string de PowerShell (`@'...'@`)** — el `@` termina
  pegado al asunto del commit.
- **Los gates tardan ~10 minutos en total.** Presupuestá el tiempo.

### Reglas que no se negocian

- **Ninguna operación de usuario usa `service_role`** (`CLAUDE.md` §4). Sólo migraciones, seed y
  scripts a mano.
- **Los 44 px táctiles y los contrastes WCAG AA están medidos en pantalla, no estimados.** No se
  regresan. `packages/web/tests/theme.test.ts` los fija.
- **El valor del plan en el registro se muestra en gris pero NO se guarda** si el jugador no lo toca.
  Guardarlo contamina la comparación RPE objetivo vs. percibido, que es el dato central del producto.
  Si alguien propone prellenar de verdad, **escalalo al dueño del repo**, no lo apliques.
- **Cada ícono nuevo va también a la lista de `nuxt.config.ts`** o `tests/icons.test.ts` falla — y
  falla en los dos sentidos, así que un ícono que se deja de usar también hay que sacarlo.

## 5. Deuda conocida que sigue abierta

- **`programs.current_week_id` es global al programa**, no por jugador: si el coach avanza la semana,
  la rueda de todo el plantel se reinicia junta.
- **Borrar una evaluación no revierte el 1RM** — el trigger `0018` no corre en `delete`.
- **Los 41 tests de `web` leen el fuente, no montan componentes.** Agarran una regresión en el código,
  no un componente que renderiza mal.
- **Falta el reordenamiento por drag&drop** desde F2: la ruta y el helper `reindex` existen y están
  testeados, falta el gesto.
- **`--ui-text-toned` no se sobrescribe en modo oscuro.**
- **En `assign.vue` el label y el hint se pegan**: se lee "Prioridad extrabase 100".

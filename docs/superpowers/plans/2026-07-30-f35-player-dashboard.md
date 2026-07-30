# F3.5 — Dashboard del jugador y limpieza de deuda: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el panel del jugador de formulario de registro en lector de su rutina, con un dashboard de entrada, la rutina presentada como la planilla del club, el registro opcional en un slideover, evaluaciones de fuerza que actualizan el 1RM, y la paleta del club aplicada a toda la app.

**Architecture:** Tres migraciones nuevas (`blocks.name`, `session_logs.perceived_rpe`, trigger `evaluations` → `one_rms`); dos funciones puras nuevas en `packages/core/src/domain/` con la regla del trigger duplicada como función testeable; rutas nuevas bajo `/player/*` y `/coach/*`; y las pantallas del jugador reorganizadas en `index.vue` (dashboard), `week/index.vue` (lista de días) y `week/[dayId].vue` (el día). La paleta se define como cuatro paletas propias de 11 tonos en `main.css` y se mapea a los alias de Nuxt UI en `app.config.ts`, así que repinta la app entera sin tocar componentes.

**Tech Stack:** pnpm workspaces · Nuxt 4 SSR + Vue 3 + Nuxt UI 3.3.7 + Tailwind v4 · Hono con `@hono/zod-openapi` montado en Nitro · Supabase (Postgres + Auth) con `supabase-js` y RLS · Zod · Vitest.

**Rama:** se trabaja sobre **`feature/f3`** (decisión del dueño del repo: F3 y F3.5 cierran en un solo merge). No crear una rama nueva.

---

## Documentos que hay que leer antes de empezar

| Documento | Para qué |
|---|---|
| `CLAUDE.md` | Contexto maestro. Manda sobre todo lo demás |
| `docs/superpowers/specs/2026-07-29-f35-player-dashboard-design.md` | El spec de esta fase: qué se decidió y por qué |
| `docs/DESIGN-SYSTEM.md` | **Todos los valores visuales.** El plan referencia sus secciones en vez de duplicar hexes |
| `docs/IMPLEMENTATION-F3.md` | Lo que dejó la fase anterior, incluido lo que quedó sin verificar |

## Cuatro reglas que aplican a TODOS los tasks

Se repiten acá porque romper cualquiera de ellas hace fallar el gate al final, cuando ya es caro:

1. **Los iconos van en la misma task que los usa.** `packages/web/tests/icons.test.ts` falla en los **dos** sentidos: si un `i-lucide-x` del código no está en `clientBundle.icons` de `nuxt.config.ts`, y si queda declarado uno que la app ya no usa. Después de cada task que toque un `.vue`, correr `pnpm --filter @coachlab/web test` y ajustar la lista en la dirección que haga falta.
2. **Nunca la `service_role` en una query de usuario.** Las rutas usan `c.get('db')`, que es el cliente con el JWT del actor. La secret key solo aparece en `scripts/`. `CLAUDE.md` §4.
3. **El orden nunca sale del orden de las filas.** Todo árbol se ordena por `order_index` explícito, con `sortByOrderIndex` de `@coachlab/core/domain/tree`. `CLAUDE.md` §3.
4. **Textos de UI en español (es-UY, "vos"). Código, commits e identificadores en inglés.** El registro está en `docs/DESIGN-SYSTEM.md` §2.

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0016_block_name.sql` | `blocks.name` |
| `supabase/migrations/0017_session_log_rpe.sql` | `session_logs.perceived_rpe` |
| `supabase/migrations/0018_evaluation_syncs_one_rm.sql` | Trigger evaluación → 1RM |
| `packages/core/src/types/database.ts` | Tipos generados (mudados desde `packages/web/types/`) |
| `packages/core/src/domain/evaluationTrend.ts` | `evaluationTrend` + `nextOneRmFrom` |
| `packages/core/src/domain/weekProgress.ts` | `weekProgress` |
| `packages/core/src/validators/evaluation.ts` | `evaluationSchema` |
| `packages/api/src/access/playerDashboard.ts` | Carga las tendencias y el progreso |
| `packages/api/src/access/evaluations.ts` | Lectura y escritura de evaluaciones, con scope |
| `packages/api/src/routes/player/dashboard.ts` | `GET /player/dashboard` |
| `packages/api/src/routes/player/evaluations.ts` | Evaluaciones del jugador |
| `packages/web/public/escudo-light.png` · `escudo-dark.png` | El escudo del shell |
| `packages/web/app/pages/player/index.vue` | Dashboard |
| `packages/web/app/pages/player/week/index.vue` | Lista de días |
| `packages/web/app/pages/player/week/[dayId].vue` | El día |
| `packages/web/app/components/player/ProgressRing.vue` | La rueda |
| `packages/web/app/components/player/EvaluationCard.vue` | Tarjeta de tendencia |
| `packages/web/app/components/player/BlockSection.vue` | Un bloque con su encabezado |
| `packages/web/app/components/player/LogSlideover.vue` | El control de registro |
| `packages/web/app/components/player/EvaluationsForm.vue` | Carga de evaluaciones (jugador y coach) |
| `packages/web/tests/theme.test.ts` | Que las paletas tengan los 11 tonos |
| `packages/web/tests/autosave.test.ts` | Que el cierre del día haga `flush` |
| `docs/IMPLEMENTATION-F3.5.md` | Registro de la fase |

**Se modifican:** `packages/core/src/domain/{buildPlayerDay,parseCoachSheet}.ts`, `packages/core/src/validators/{session,parsedProgram}.ts`, `packages/core/package.json`, `packages/api/src/{app.ts,access/{playerWeek,playerDay}.ts,routes/{player/week,coach/import,coach/players}.ts}`, `packages/api/src/db/*`, `packages/web/{nuxt.config.ts,app/app.config.ts,app/assets/css/main.css,app/layouts/default.vue,app/components/AppSidebar.vue,app/composables/useAuth.ts,app/pages/player/profile.vue,app/pages/coach/players/[playerId].vue,.env.example}`, `scripts/{verify-setup.mjs,smoke-player.ts}`, `package.json`, `CLAUDE.md`.

**Se borran:** `packages/api/src/access/embedded.ts` (Task 8), `packages/web/app/components/player/{DayCard,ExerciseRow}.vue` (Task 20), `packages/web/app/pages/player/week.vue` (Task 19), `packages/web/types/database.ts` (Task 7).

---

# Fase A — El bug y la deuda barata

No dependen de nada. La Task 1 es lo único que hoy pierde datos de un jugador.

### Task 1: Cerrar el día no puede perder el último registro

`useDebouncedSave` expone `flush()` y **nadie la llama**. El jugador escribe las reps, toca "Completar día" a los 200 ms, y a los 800 ms el `PUT` llega a un día ya cerrado: la ruta responde 409, se ve un error en rojo después de haber completado, y esa serie no se guardó.

Se arregla en los componentes **actuales** aunque la Task 20 los reemplace: la fase puede durar días y esto pierde datos hoy. La Task 20 arrastra el patrón.

**Files:**
- Modify: `packages/web/app/components/player/ExerciseRow.vue`
- Modify: `packages/web/app/components/player/DayCard.vue`
- Create: `packages/web/tests/autosave.test.ts`

> **Por qué el test lee el archivo en vez de montar el componente:** `packages/web` no tiene jsdom ni `@vue/test-utils` —su único test hoy es `tests/icons.test.ts`, que también lee archivos— y `useDebouncedSave` depende de los auto-imports de Nuxt (`ref`, `onScopeDispose`), así que no se puede importar desde un vitest pelado. Montar componentes es infra nueva y no es el objetivo de esta task. El test que sí se puede escribir es el que fija el cableado, en el mismo estilo que `icons.test.ts`.

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/web/tests/autosave.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * El autosave tiene 800 ms de debounce. Si el jugador escribe y cierra el día
 * antes de que venza, el PUT llega a un día ya cerrado: la ruta responde 409, el
 * jugador ve un error en rojo DESPUÉS de haber completado, y esa serie no se
 * guardó.
 *
 * `useDebouncedSave` expone `flush()` justo para eso y durante toda F3 nadie la
 * llamó. Este test fija el cableado: quien cierra el día tiene que vaciar los
 * guardados pendientes antes.
 *
 * Lee el archivo en vez de montar el componente porque packages/web no tiene
 * jsdom ni @vue/test-utils — igual que tests/icons.test.ts.
 */
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const read = (relative: string) => readFileSync(join(ROOT, relative), 'utf8')

describe('el cierre del día vacía el autosave pendiente', () => {
  it('la fila del ejercicio expone flush', () => {
    const source = read('app/components/player/ExerciseRow.vue')
    expect(source).toContain('useDebouncedSave')
    expect(source, 'sin defineExpose el padre no puede vaciar el pendiente').toContain(
      'defineExpose',
    )
    expect(source).toMatch(/defineExpose\(\{[^}]*flush/s)
  })

  it('quien cierra el día espera el flush antes del complete', () => {
    const source = read('app/components/player/DayCard.vue')
    const complete = source.indexOf("/complete")
    expect(complete, 'no se encontró la llamada a /complete').toBeGreaterThan(0)
    const before = source.slice(0, complete)
    expect(before, 'el flush tiene que ir ANTES del POST de complete').toMatch(/await[\s\S]*flush/)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
pnpm --filter @coachlab/web test
```

Esperado: **FAIL**, dos tests rojos. El primero por `expect(source).toContain('defineExpose')`, el segundo porque `DayCard.vue` no menciona `flush`.

- [ ] **Step 3: Exponer `flush` desde la fila**

En `packages/web/app/components/player/ExerciseRow.vue`, cambiar la desestructuración del composable para quedarse con `flush` y exponerlo. Reemplazar:

```ts
const { trigger, state, error } = useDebouncedSave(async () => {
```

por:

```ts
const { trigger, flush, state, error } = useDebouncedSave(async () => {
```

y agregar, inmediatamente después del bloque `const RPE_OPTIONS = [...]`:

```ts
// El padre llama a esto antes de cerrar el día: sin vaciar el pendiente, el PUT
// de la última tecla llega a un día ya cerrado y vuelve 409.
defineExpose({ flush })
```

- [ ] **Step 4: Vaciar el pendiente antes de cerrar el día**

En `packages/web/app/components/player/DayCard.vue`, agregar la recolección de refs de las filas. Después de `const busy = ref(false)`:

```ts
/**
 * Las filas del día, para poder vaciar su autosave antes de cerrar.
 *
 * `v-for` con `ref` junta las instancias en un array, y el orden no importa: se
 * vacían todas.
 */
type Flushable = { flush: () => Promise<void> }
const rows = ref<Flushable[]>([])

async function flushRows() {
  await Promise.all(rows.value.filter(Boolean).map((row) => row.flush()))
}
```

Cambiar el arranque de `complete()` para que espere el flush **antes** del `POST`:

```ts
async function complete() {
  busy.value = true
  try {
    // Antes del POST, no después: el debounce de 800 ms del autosave llegaría a
    // un día ya cerrado y la ruta lo rechazaría con 409.
    await flushRows()
    await api.post(`/api/player/days/${props.day.id}/complete`, { note: note.value || null })
```

Y en el template, agregar el `ref` al `v-for` de las filas:

```vue
      <PlayerExerciseRow
        v-for="exercise in block.exercises"
        ref="rows"
        :key="exercise.id"
        :exercise="exercise"
        :day-id="day.id"
        :disabled="day.completed"
      />
```

- [ ] **Step 5: Correr el test y verificar que pasa**

```bash
pnpm --filter @coachlab/web test
```

Esperado: **PASS**. Después:

```bash
pnpm --filter @coachlab/web typecheck
```

Esperado: exit 0. Si `rows.value` se queja del tipo, es que `ref="rows"` en un `v-for` devuelve `unknown[]`: el `Flushable[]` del Step 4 es la anotación que lo resuelve.

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/components/player/ExerciseRow.vue packages/web/app/components/player/DayCard.vue packages/web/tests/autosave.test.ts
git commit -m "fix(player): flush pending autosaves before closing the day"
```

---

### Task 2: Documentar `SUPABASE_PROJECT_ID`

`pnpm gen:types` la necesita y no aparece en ningún `.env.example`. Quien clone el repo no puede regenerar los tipos.

**Files:**
- Modify: `packages/web/.env.example`

- [ ] **Step 1: Agregar la variable con su explicación**

Al final de `packages/web/.env.example`:

```
# El ref del proyecto de Supabase: la parte <ref> de https://<ref>.supabase.co.
# La usa `pnpm gen:types` para regenerar packages/core/src/types/database.ts.
# No es un secreto — está en la URL pública del proyecto.
SUPABASE_PROJECT_ID=xxxxxxxxxxxx
```

- [ ] **Step 2: Verificar que el script la lee con ese nombre**

```bash
grep -n "SUPABASE_PROJECT_ID" package.json
```

Esperado: la línea de `gen:types` con `--project-id $SUPABASE_PROJECT_ID`. Si el nombre no coincide, mandan el `package.json` y hay que corregir el `.env.example`.

- [ ] **Step 3: Commit**

```bash
git add packages/web/.env.example
git commit -m "docs: document SUPABASE_PROJECT_ID, which gen:types needs"
```

---

### Task 3: Hacer que `pnpm lint` exista, contando primero los hallazgos

El gate de `CLAUDE.md` §5 es `pnpm lint && pnpm typecheck && pnpm test`, pero el script del root hace `pnpm -r lint` y **ningún package define `lint`**: falla con `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`. Nunca fue ejecutable.

> **Contar antes de arreglar.** Es el procedimiento que en F3 funcionó con `vue-tsc`: primero se midió (15 errores, 12 preexistentes) y con ese número se decidió. Acá igual: se instala, se cuenta, **se reporta al dueño del repo** y recién entonces se arregla. Si el ruido es inmanejable, la decisión de qué reglas apagar es suya, no de quien ejecuta el plan.

**Files:**
- Modify: `packages/web/package.json`, `package.json`
- Create: `packages/web/eslint.config.mjs`

- [ ] **Step 1: Instalar el módulo**

```bash
pnpm --filter @coachlab/web add -D @nuxt/eslint eslint
```

- [ ] **Step 2: Habilitarlo en `nuxt.config.ts`**

Agregar `'@nuxt/eslint'` al array `modules`:

```ts
  modules: ['@nuxt/ui', '@nuxt/eslint'],
```

- [ ] **Step 3: Crear la config flat**

Crear `packages/web/eslint.config.mjs`:

```js
// La config la genera @nuxt/eslint en .nuxt/eslint.config.mjs a partir del
// proyecto (Vue + TS + las convenciones de Nuxt). Acá solo se extiende.
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt()
```

- [ ] **Step 4: Agregar el script y correrlo para contar**

En `packages/web/package.json`, dentro de `scripts`:

```json
    "lint": "eslint .",
```

Después:

```bash
pnpm --filter @coachlab/web dev --help >/dev/null 2>&1 || true
pnpm --filter @coachlab/web lint 2>&1 | tail -30
```

> `eslint .` necesita `.nuxt/eslint.config.mjs`, que se genera al preparar Nuxt. Si falla con "Cannot find module './.nuxt/eslint.config.mjs'", correr primero `pnpm --filter @coachlab/web exec nuxt prepare`.

Esperado: una cuenta de errores y warnings. **Anotar el número y los códigos de regla más frecuentes.**

- [ ] **Step 5: Que `core` y `api` no rompan el script del root**

`pnpm -r lint` falla si algún package no define `lint`. Agregar a `packages/core/package.json` y `packages/api/package.json`, dentro de `scripts`:

```json
    "lint": "echo \"(sin linter propio: core y api son TS puro y los cubre typecheck)\"",
```

> Es deliberado y no un placeholder: meter ESLint en los tres packages en la misma task multiplica el ruido a contar. `core` y `api` no tienen `.vue` y `tsc --noEmit` ya los cubre. Si más adelante se quiere lint real ahí, es una task propia.

- [ ] **Step 6: Verificar el script del root**

```bash
pnpm lint
```

Esperado: corre los tres packages sin `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`. Si `@coachlab/web` reporta errores, **no arreglarlos todavía**: es el Step 7.

- [ ] **Step 7: Reportar y esperar la decisión**

Reportar al dueño del repo: cuántos errores, cuántos warnings, y las 5 reglas más frecuentes. Preguntar si se arreglan todos, si se apagan reglas, o si se deja en warning. **No avanzar a la Fase B sin esa respuesta**; sí se puede seguir con otras tasks mientras.

- [ ] **Step 8: Commit**

```bash
git add packages/web/package.json packages/web/eslint.config.mjs packages/web/nuxt.config.ts packages/core/package.json packages/api/package.json pnpm-lock.yaml
git commit -m "chore: make pnpm lint executable with @nuxt/eslint"
```

---

# Fase B — Sistema de diseño

Va antes que las pantallas para que se escriban ya con la paleta final en vez de repintarse después.

### Task 4: Las cuatro paletas del club

Cuatro paletas propias de 11 tonos en `main.css`, mapeadas a los alias de Nuxt UI en `app.config.ts`. Repinta la app entera —incluidas las ~10 pantallas del coach— sin tocar un componente.

Los valores y el razonamiento están en `docs/DESIGN-SYSTEM.md` §3. Los tres que hay que tener presentes al ejecutar:

- **`primary` es el rojo del club, no el marino.** `UButton` usa `primary` por default; con el marino ahí, cada CTA tendría que escribir `color="secondary"`.
- **`error` se queda en el rojo de Tailwind**, a propósito: "un error tiene que leerse como error aunque el club juegue de rojo".
- **La escala `neutral` (`clay`) es cálida de punta a punta**, y el modo oscuro sobrescribe las superficies con marinos en un bloque `.dark`. No se puede hacer con una sola escala: los dos modos comparten los tonos 200, 300, 400, 500, 700 y 900.

**Files:**
- Modify: `packages/web/app/assets/css/main.css`
- Modify: `packages/web/app/app.config.ts`
- Modify: `packages/web/nuxt.config.ts`
- Create: `packages/web/tests/theme.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/web/tests/theme.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Una paleta propia de Nuxt UI necesita los ONCE tonos (50…950): usa 500/600 para
 * fondos sólidos en claro, 400 en oscuro, 50/100 para fondos suaves y 900/950
 * para el modo oscuro. Con menos, algunos estados quedan sin color y no falla
 * nada: se ve mal y recién se nota en pantalla.
 *
 * Este test es el mismo patrón que tests/icons.test.ts — lee los archivos y
 * compara dos listas que tienen que coincidir.
 */
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const PALETTES = ['clubred', 'gold', 'navy', 'clay']

const css = readFileSync(join(ROOT, 'app/assets/css/main.css'), 'utf8')
const appConfig = readFileSync(join(ROOT, 'app/app.config.ts'), 'utf8')
const nuxtConfig = readFileSync(join(ROOT, 'nuxt.config.ts'), 'utf8')

describe('las paletas del club', () => {
  for (const palette of PALETTES) {
    it(`${palette} define los 11 tonos`, () => {
      const missing = SHADES.filter((shade) => !css.includes(`--color-${palette}-${shade}:`))
      expect(missing, `faltan tonos de ${palette}: ${missing.join(', ')}`).toEqual([])
    })
  }

  it('cada tono es un hex de 6 dígitos', () => {
    const declarations = [...css.matchAll(/--color-(?:clubred|gold|navy|clay)-\d+:\s*([^;]+);/g)]
    expect(declarations.length).toBe(PALETTES.length * SHADES.length)
    const bad = declarations.filter((m) => !/^#[0-9a-f]{6}$/i.test(m[1]!.trim()))
    expect(bad.map((m) => m[0]), 'hay tonos que no son un hex de 6 dígitos').toEqual([])
  })
})

describe('el mapeo de alias', () => {
  it('primary es el rojo del club, no el marino', () => {
    // Si primary fuera navy, cada CTA de la app tendría que escribir
    // color="secondary" y cualquier botón nuevo nacería del color equivocado.
    expect(appConfig).toMatch(/primary:\s*'clubred'/)
  })

  it('success es dorado y warning el rojo del club', () => {
    expect(appConfig).toMatch(/success:\s*'gold'/)
    expect(appConfig).toMatch(/warning:\s*'clubred'/)
  })

  it('error se queda en el rojo de Tailwind', () => {
    // Deliberado: un error tiene que leerse como error aunque el club juegue de
    // rojo. Ver docs/DESIGN-SYSTEM.md §3.3.
    expect(appConfig).toMatch(/error:\s*'red'/)
  })

  it('neutral es la escala cálida propia', () => {
    expect(appConfig).toMatch(/neutral:\s*'clay'/)
  })

  it('navy está registrado en los DOS lugares que hacen falta', () => {
    // app.config lo mapea a su paleta y nuxt.config lo declara como alias. Sin
    // las dos cosas no existe --ui-navy y color="navy" no anda.
    expect(appConfig).toMatch(/navy:\s*'navy'/)
    expect(nuxtConfig).toMatch(/colors:\s*\[[^\]]*'navy'/s)
  })

  it('ya no queda el TODO de la paleta pendiente', () => {
    expect(appConfig).not.toContain('TODO')
  })
})

describe('el modo oscuro sobrescribe las superficies', () => {
  it('hay un bloque .dark con las variables de superficie', () => {
    // Los dos modos comparten tonos del neutral (200, 300, 400, 500, 700, 900),
    // así que una sola escala no puede ser cálida en claro y marina en oscuro.
    expect(css).toContain('.dark {')
    for (const variable of ['--ui-bg', '--ui-bg-muted', '--ui-border', '--ui-text-muted']) {
      expect(css, `falta ${variable} en el bloque .dark`).toContain(`${variable}:`)
    }
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
pnpm --filter @coachlab/web test
```

Esperado: **FAIL**. Los tests de paletas fallan porque `main.css` hoy solo tiene los dos `@import`, y los de alias porque `app.config.ts` dice `primary: 'green'`.

- [ ] **Step 3: Definir las paletas en `main.css`**

Reemplazar el contenido completo de `packages/web/app/assets/css/main.css` por:

```css
/**
 * CSS de entrada de Nuxt UI 3.
 *
 * Sin este archivo (y sin referenciarlo en `css` de nuxt.config) los componentes
 * `U*` renderizan su markup pero ninguna clase de Tailwind existe, así que la app
 * sale sin estilos: tipografía serif del navegador y todo apilado. Se ve
 * "funcionando" en el HTML y roto en pantalla.
 *
 * Tailwind v4 y el tema de Nuxt UI vienen de las dependencias de @nuxt/ui; no
 * hace falta instalar tailwindcss por separado ni un tailwind.config.
 */
@import "tailwindcss";
@import "@nuxt/ui";

/**
 * Las paletas del club. La fuente de verdad de estos valores y de por qué son
 * estos es docs/DESIGN-SYSTEM.md §3.
 *
 * Los tonos marcados vienen del mock validado; el resto se interpola. Cada
 * paleta necesita los ONCE tonos porque Nuxt UI los usa todos: 500 para fondos
 * sólidos en claro, 400 en oscuro, 50/100 para fondos suaves, 900/950 para el
 * modo oscuro. tests/theme.test.ts lo verifica.
 */
@theme static {
  /* Rojo del club — `primary` y `warning`.
     El 500 y el 400 son los dos rojos del mock: Nuxt UI usa el 500 como acento
     sólido en claro y el 400 en oscuro, así que la diferencia deliberada entre
     modos sale de la escala sola, sin una sola clase `dark:`. */
  --color-clubred-50:  #fdf4f3;
  --color-clubred-100: #f8e6e5;  /* fondo del banner de atención */
  --color-clubred-200: #ecc9c8;  /* borde del banner */
  --color-clubred-300: #c2707a;
  --color-clubred-400: #96303f;  /* acento sólido en OSCURO */
  --color-clubred-500: #7d2230;  /* acento sólido en CLARO */
  --color-clubred-600: #6b1b26;  /* texto sobre el tinte */
  --color-clubred-700: #5a1620;
  --color-clubred-800: #4a1219;
  --color-clubred-900: #3d0f15;
  --color-clubred-950: #24080c;

  /* Dorado — `success`: badge "Completada" y la flecha de mejora. */
  --color-gold-50:  #fdf9f0;
  --color-gold-100: #f6ecd3;  /* fondo del badge "Completada" */
  --color-gold-200: #ecd9ab;
  --color-gold-300: #dcc07d;
  --color-gold-400: #c8a15a;  /* ring de progreso sobre marino */
  --color-gold-500: #b48a3f;
  --color-gold-600: #a3782e;  /* texto dorado */
  --color-gold-700: #856026;
  --color-gold-800: #6b4d20;
  --color-gold-900: #573f1c;
  --color-gold-950: #32230f;

  /* Marino — alias `navy`, registrado en nuxt.config. Estructura: peso prescrito,
     tarjeta del ring, acentos. NO es `primary`: ver DESIGN-SYSTEM §3.3. */
  --color-navy-50:  #eef1f5;
  --color-navy-100: #dde3ed;
  --color-navy-200: #bcc6da;
  --color-navy-300: #8f9dba;
  --color-navy-400: #4a5b85;
  --color-navy-500: #1a2744;  /* el marino del club */
  --color-navy-600: #16203a;
  --color-navy-700: #121a2f;
  --color-navy-800: #0e1526;
  --color-navy-900: #0b101d;
  --color-navy-950: #070a13;

  /* Neutral cálido — `neutral`. Da el modo claro entero: cinco de estos tonos
     caen exactos en valores del mock. El modo oscuro NO sale de acá (ver el
     bloque .dark de abajo). */
  --color-clay-50:  #f5f2ec;  /* fondo de página */
  --color-clay-100: #efe9dc;  /* fondo de bloque */
  --color-clay-200: #e4ded2;  /* borde de card */
  --color-clay-300: #d9d0be;  /* borde de chip */
  --color-clay-400: #b3aa9c;
  --color-clay-500: #6f6a63;  /* texto atenuado */
  --color-clay-600: #585349;
  --color-clay-700: #43403a;
  --color-clay-800: #302d29;
  --color-clay-900: #1a1a1a;  /* texto principal */
  --color-clay-950: #111010;
}

/**
 * Modo oscuro: las superficies son MARINAS, no cálidas.
 *
 * No se puede resolver con la escala de `clay`: Nuxt UI consume los tonos 200,
 * 300, 400, 500, 700 y 900 en los DOS modos (verificado en
 * @nuxt/ui/dist/runtime/index.css), así que una escala que cambiara de familia a
 * mitad de camino saldría del color equivocado en uno de los dos.
 *
 * Se sobrescriben las variables de superficie con los valores del mock. Los tonos
 * de `clay` que el modo oscuro usaría quedan pisados; los de texto acentuado y
 * los alias de color siguen saliendo de sus escalas.
 */
.dark {
  --ui-bg:              #10152a;  /* fondo de página */
  --ui-bg-muted:        #1a2038;  /* tarjeta */
  --ui-bg-elevated:     #1a2038;
  --ui-bg-accented:     #242c4a;  /* header de bloque, chips */
  --ui-border:          #2b3350;
  --ui-border-muted:    #242c4a;
  --ui-border-accented: #3a4266;
  --ui-text:            #eef0f5;
  --ui-text-muted:      #a4acc7;
  --ui-text-dimmed:     #8f97b3;
}
```

- [ ] **Step 4: Mapear los alias en `app.config.ts`**

Reemplazar el bloque `colors` de `packages/web/app/app.config.ts` (dejando el comentario de cabecera del archivo, que explica el mecanismo) por:

```ts
export default defineAppConfig({
  ui: {
    // Las paletas están en app/assets/css/main.css y los valores documentados en
    // docs/DESIGN-SYSTEM.md §3. tests/theme.test.ts verifica este mapeo.
    colors: {
      // El rojo del club, NO el marino: UButton y UBadge usan `primary` por
      // default, así que con el marino acá cada CTA de la app tendría que
      // escribir color="secondary" y cualquier botón nuevo nacería mal.
      primary: 'clubred',
      neutral: 'clay',

      // El alias propio, registrado además en nuxt.config → ui.theme.colors. Sin
      // ESTAS DOS COSAS juntas no existe `--ui-navy` y `color="navy"` no anda.
      navy: 'navy',

      success: 'gold',
      warning: 'clubred',

      // El único que NO va a la paleta del club, a propósito: un error tiene que
      // leerse como error aunque el club juegue de rojo. En el panel del coach
      // conviven "Guardar" en borgoña y "Eliminar" en el rojo más brillante de
      // Tailwind, y el más brillante lee como más alarmante — que es lo correcto
      // para lo destructivo.
      error: 'red',
    },
  },
})
```

- [ ] **Step 5: Registrar el alias `navy` en `nuxt.config.ts`**

Agregar el bloque `ui` al `defineNuxtConfig`, después de `css`:

```ts
  ui: {
    // Registrar un alias propio es lo que genera --ui-navy y las clases
    // text-navy-500 / bg-navy-500. Los seis de la lista default de Nuxt UI hay
    // que repetirlos: la opción reemplaza, no extiende.
    theme: {
      colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'navy'],
    },
  },
```

- [ ] **Step 6: Correr el test y verificar que pasa**

```bash
pnpm --filter @coachlab/web test
```

Esperado: **PASS**, todos los describes en verde.

- [ ] **Step 7: Verificar en el browser que la paleta llegó de verdad**

Ningún test ve un color renderizado. Levantar el dev server y mirar:

```bash
pnpm dev
```

Abrir `/login` y comprobar, en los dos modos (el toggle está en el sidebar):

1. El botón primario es **borgoña**, no verde.
2. El fondo de página en claro es **cálido** (`#f5f2ec`), no gris azulado.
3. En oscuro el fondo es **marino** (`#10152a`), no gris.
4. **El punto que no se puede verificar leyendo archivos:** que el rojo del botón en oscuro sea `#96303f` y en claro `#7d2230`. Depende de que `--ui-primary` resuelva a `-500` en claro y `-400` en oscuro, que es la convención documentada de Nuxt UI v3 pero la inyecta un plugin en runtime. Confirmarlo con el inspector: `getComputedStyle(document.documentElement).getPropertyValue('--ui-primary')`.
   - Si **no** se cumple, la salida es sobrescribir `--ui-primary` en `:root` y `.dark` en `main.css` igual que las superficies. Anotarlo en `docs/IMPLEMENTATION-F3.5.md`.

- [ ] **Step 8: Commit**

```bash
git add packages/web/app/assets/css/main.css packages/web/app/app.config.ts packages/web/nuxt.config.ts packages/web/tests/theme.test.ts
git commit -m "feat(ui): apply the club palette across the app"
```

---

### Task 5: El escudo en el shell

Marca de agua en la esquina superior derecha, en `layouts/default.vue` una sola vez y no por pantalla. La variante es `two-tone`, elegida bajando las tres candidatas a 34 px reales y mirándolas sobre los dos fondos — la evidencia está en `docs/DESIGN-SYSTEM.md` §4.

**Files:**
- Create: `packages/web/public/escudo-light.png`, `packages/web/public/escudo-dark.png`
- Modify: `packages/web/app/layouts/default.vue`
- Modify: `packages/web/tests/theme.test.ts`

- [ ] **Step 1: Copiar los dos assets**

`packages/web/public/` no existe todavía; Nuxt sirve su contenido desde la raíz del sitio.

```bash
mkdir -p packages/web/public
cp escudos/escudo-two-tone-light@128.png packages/web/public/escudo-light.png
cp escudos/escudo-two-tone-dark@128.png  packages/web/public/escudo-dark.png
```

> **Por qué el `@128` y no el `@256`:** a 34 px de ancho el @128 ya da 3,7× de densidad —de sobra para cualquier pantalla— y pesa la cuarta parte (~30 KB contra ~78 KB).

- [ ] **Step 2: Agregar el test que falla**

Al final de `packages/web/tests/theme.test.ts`:

```ts
describe('el escudo del club', () => {
  it('los dos assets están en public/', () => {
    // El nombre dice el MODO en el que se usa, no el color del arte:
    // escudo-light.png es el de fondos claros (two-tone-light).
    for (const file of ['public/escudo-light.png', 'public/escudo-dark.png']) {
      expect(existsSync(join(ROOT, file)), `falta ${file}`).toBe(true)
    }
  })

  it('el shell lo muestra en los dos modos', () => {
    const layout = readFileSync(join(ROOT, 'app/layouts/default.vue'), 'utf8')
    expect(layout).toContain('/escudo-light.png')
    expect(layout).toContain('/escudo-dark.png')
  })
})
```

Y extender el import de `node:fs` de la cabecera del archivo:

```ts
import { existsSync, readFileSync } from 'node:fs'
```

- [ ] **Step 3: Correr el test y verificar que falla**

```bash
pnpm --filter @coachlab/web test
```

Esperado: **FAIL** en "el shell lo muestra en los dos modos" (el de los assets ya pasa por el Step 1).

- [ ] **Step 4: Ponerlo en el layout**

Reemplazar `packages/web/app/layouts/default.vue` por:

```vue
<template>
  <div class="min-h-screen">
    <AppSidebar />

    <!--
      El escudo del club, una sola vez para toda la app.
      Va en el shell y no por pantalla (docs/DESIGN-SYSTEM.md §4). Dos <img> con
      una clase `dark:` en vez de un solo src reactivo: el arte es distinto en cada
      modo (interior claro contra relleno rojo), no es el mismo logo recoloreado.
      `pointer-events-none` porque es decoración: no debe robar clicks.
    -->
    <img
      src="/escudo-light.png"
      alt=""
      aria-hidden="true"
      class="pointer-events-none fixed right-1.5 top-1.5 z-20 w-[34px] dark:hidden"
    >
    <img
      src="/escudo-dark.png"
      alt=""
      aria-hidden="true"
      class="pointer-events-none fixed right-1.5 top-1.5 z-20 hidden w-[34px] dark:block"
    >

    <main class="pb-16 md:pb-0 md:pl-60">
      <!-- pt-10 y no pt-4: el escudo ocupa la esquina y el título no puede quedar
           pegado abajo suyo (DESIGN-SYSTEM §4). -->
      <div class="p-4 pt-10 md:p-8 md:pt-10">
        <slot />
      </div>
    </main>
  </div>
</template>
```

- [ ] **Step 5: Correr el test y verificar que pasa**

```bash
pnpm --filter @coachlab/web test && pnpm --filter @coachlab/web typecheck
```

Esperado: **PASS** y exit 0.

- [ ] **Step 6: Verificar en el browser**

Con `pnpm dev`, entrar a cualquier pantalla logueada y comprobar en los dos modos:

1. El escudo está arriba a la derecha, chico, sin taparle nada al título.
2. Al cambiar de modo **cambia el arte**, no solo el color.
3. A 380 px de ancho sigue sin superponerse al contenido.

- [ ] **Step 7: Commit**

```bash
git add packages/web/public packages/web/app/layouts/default.vue packages/web/tests/theme.test.ts
git commit -m "feat(ui): put the club crest in the app shell"
```

---

# Fase C — Tipos compartidos

Los tipos generados viven en `packages/web/types/database.ts`, así que el cliente de Supabase de la API **no está tipado**: PostgREST devuelve un objeto para una relación many-to-one pero TS la infiere como array, y de ahí sale `firstOf` y todas las normalizaciones array-vs-objeto.

Va temprano para que simplifique lo que viene después, no tarde para que sea un riesgo.

> **Esta fase es la candidata a cortarse si la fase se estira.** Es un refactor transversal que no habilita ninguna pantalla. La Task 6 sola ya vale (arregla `gen:types` y deja los tipos donde los dos packages los ven); las Tasks 7 y 8 son la ganancia de limpieza. Si la Task 7 destapa una cascada de errores de tipos, la salida documentada está en su Step 5.

### Task 6: Mudar los tipos generados a `@coachlab/core`

**Files:**
- Create: `packages/core/src/types/database.ts` (mudado)
- Delete: `packages/web/types/database.ts`
- Modify: `packages/core/package.json`, `package.json`, `packages/web/app/plugins/supabase.ts`

> **Un archivo generado en `core` no viola la regla de `CLAUDE.md` §5** ("core sin dependencias de Supabase ni de Vue"): `database.ts` es puro `type` y no tiene un solo `import`. Lo que la regla prohíbe es que `core` dependa del *runtime* de Supabase, y esto no lo hace.

- [ ] **Step 1: Mover el archivo preservando el historial**

```bash
mkdir -p packages/core/src/types
git mv packages/web/types/database.ts packages/core/src/types/database.ts
```

- [ ] **Step 2: Exportar el subpath desde `core`**

En `packages/core/package.json`, agregar la línea al mapa `exports`:

```json
  "exports": {
    "./domain/*": "./src/domain/*.ts",
    "./validators/*": "./src/validators/*.ts",
    "./access/*": "./src/access/*.ts",
    "./types/*": "./src/types/*.ts"
  },
```

- [ ] **Step 3: Apuntar `gen:types` al lugar nuevo**

En el `package.json` del root, cambiar el script:

```json
    "gen:types": "supabase gen types typescript --project-id $SUPABASE_PROJECT_ID --schema public > packages/core/src/types/database.ts",
```

- [ ] **Step 4: Actualizar el único consumidor actual**

En `packages/web/app/plugins/supabase.ts`, cambiar la línea 8:

```ts
import type { Database } from '@coachlab/core/types/database'
```

- [ ] **Step 5: Verificar que no quedó ninguna referencia al lugar viejo**

```bash
grep -rn "types/database" packages --include=*.ts --include=*.vue --include=*.json | grep -v node_modules
```

Esperado: solo el `exports` de `packages/core/package.json`, el import del plugin, y el script del root. **Si aparece algo en `tsconfig.json`, `openapi-ts.config.ts` o `nuxt.config.ts`, corregirlo también.** Después:

```bash
ls packages/web/types 2>/dev/null || echo "(el directorio quedó vacío, se puede borrar)"
```

- [ ] **Step 6: Verificar**

```bash
pnpm typecheck
```

Esperado: exit 0 en los tres packages. Si `@coachlab/core/types/database` no resuelve, es que el `exports` del Step 2 quedó mal escrito.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types/database.ts packages/core/package.json package.json packages/web/app/plugins/supabase.ts
git rm -r --cached packages/web/types 2>/dev/null || true
git commit -m "refactor: move the generated database types into @coachlab/core"
```

---

### Task 7: Tipar los clientes de Supabase de la API

**Files:**
- Modify: `packages/api/src/db/client.ts`

- [ ] **Step 1: Tipar las tres factories**

En `packages/api/src/db/client.ts`, agregar el import:

```ts
import type { Database } from '@coachlab/core/types/database'
```

y cambiar los tres tipos de retorno de `SupabaseClient` a `SupabaseClient<Database>`, más los genéricos de las tres llamadas:

```ts
export function createUserClient(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
```

```ts
export function createAnonClient(): SupabaseClient<Database> {
  return createClient<Database>(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
```

```ts
export function createRequestClient(cookies: CookieMethodsServer): SupabaseClient<Database> {
  return createServerClient<Database>(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_ANON_KEY'),
    { cookies },
  )
}
```

Y actualizar el comentario del módulo agregando, después del párrafo de la `service_role`:

```
 * Los tres clientes van tipados con `Database` (los tipos generados viven en
 * @coachlab/core/types/database desde F3.5). Eso hace que PostgREST infiera bien
 * la forma de los embeds —objeto para many-to-one, array para one-to-many— y es
 * lo que permitió borrar el helper `firstOf`.
```

- [ ] **Step 2: Propagar el tipo donde se declara el `db` del contexto**

```bash
grep -rn "SupabaseClient" packages/api/src --include=*.ts | grep -v "db/client.ts"
```

Cada archivo que declare `db: SupabaseClient` pasa a `db: SupabaseClient<Database>`, con el import de `Database`. Son las firmas de `packages/api/src/access/*.ts`, `packages/api/src/middleware/auth.ts` (la variable `db` de `AuthVariables`) y `packages/api/src/routes/player/profile.ts` (el parámetro de `readProfile`).

- [ ] **Step 3: Correr el typecheck para ver el tamaño real del cambio**

```bash
pnpm --filter @coachlab/api typecheck
```

Esperado: **errores**. Son la razón de ser de la task: donde antes había un `as` que mentía sobre la forma del embed, ahora TS sabe la forma verdadera y marca la diferencia. Anotar cuántos son.

- [ ] **Step 4: Arreglar los errores quitando los casts que ya no hacen falta**

Los casts de la forma `as { program_id: string } | { program_id: string }[]` sobran: con el cliente tipado, `db.from('days').select('id, weeks(program_id)')` ya devuelve `weeks` con la forma correcta. Borrar el cast y dejar que TS infiera. **No agregar `as unknown as`** para silenciar: si un tipo no cierra, el select está mal escrito o el tipo generado está viejo (correr `pnpm gen:types`).

- [ ] **Step 5: Si la cascada no cierra en ~30 minutos, la salida documentada**

Revertir solo esta task y quedarse con la 6:

```bash
git checkout -- packages/api/src
```

Anotar en `docs/IMPLEMENTATION-F3.5.md` cuántos errores aparecieron y de qué clase, y **saltar la Task 8** (depende de esta). El resto del plan no depende de ninguna de las dos.

- [ ] **Step 6: Verificar**

```bash
pnpm typecheck && pnpm test
```

Esperado: exit 0 y los 332 tests del baseline en verde.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src
git commit -m "refactor(api): type the Supabase clients with the generated Database"
```

---

### Task 8: Borrar `firstOf`

Solo si la Task 7 cerró. Ocho llamadas en tres archivos.

**Files:**
- Modify: `packages/api/src/access/playerWeek.ts` (5 llamadas), `packages/api/src/access/playerDay.ts` (2), `packages/api/src/routes/player/profile.ts` (1)
- Delete: `packages/api/src/access/embedded.ts`

- [ ] **Step 1: Listar las llamadas**

```bash
grep -rn "firstOf" packages/api/src
```

Esperado: 8 usos más los 3 imports más la definición.

- [ ] **Step 2: Reemplazar una por una**

Patrón: `firstOf(x)?.campo` pasa a `x?.campo` cuando el embed es many-to-one (que es el caso de los ocho). Ejemplo, en `playerWeek.ts` línea ~169:

```ts
        exerciseName: be.exercises?.name ?? 'Ejercicio',
```

Y en `playerDay.ts` línea ~36:

```ts
  const dayProgramId = day.weeks?.program_id
```

Después de cada archivo, correr `pnpm --filter @coachlab/api typecheck` para confirmar que el embed era efectivamente many-to-one. **Si TS insiste en que es un array, el embed ES uno-a-muchos y ahí `firstOf` no era ruido: era necesario.** En ese caso dejar un `[0]` explícito con un comentario, no volver a `firstOf`.

- [ ] **Step 3: Borrar los tipos locales que existían solo para los casts**

En `playerWeek.ts`, los alias `Named`, `Normalized`, `WeekNamed`, `DayNamed` y las uniones `| X[]` dentro de `ExerciseRow`, `BlockRow`, `DayRow`, `LogRow` y `EntryRow` existían para describir la ambigüedad. Con el cliente tipado, los tipos de fila salen del `Database`. Borrar los que queden sin usar — `pnpm typecheck` los marca como no usados si el `tsconfig` tiene `noUnusedLocals`; si no, verificar con:

```bash
grep -n "Named\|Normalized" packages/api/src/access/playerWeek.ts
```

- [ ] **Step 4: Borrar el helper**

```bash
git rm packages/api/src/access/embedded.ts
grep -rn "embedded" packages/api/src scripts || echo "(sin referencias)"
```

- [ ] **Step 5: Verificar**

```bash
pnpm typecheck && pnpm test
```

Esperado: exit 0 y todo verde.

- [ ] **Step 6: Verificar contra la base, que es lo único que ve los selects**

```bash
pnpm smoke:player
```

Esperado: **22/22**. Este paso no es opcional: los strings de select anidados no los ve el typecheck ni los tests de `app.request()`. Si un embed quedó mal, se ve acá y en ningún otro lado.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src
git commit -m "refactor(api): drop firstOf now that the embeds are typed"
```

---

# Fase D — Migraciones

Tres, una por concepto. **Nunca editar una migración ya aplicada** (`CLAUDE.md` §5): se agrega una nueva y se regeneran los tipos.

### Task 9: `blocks.name` — rescatar el nombre del bloque del import

El parser **ya tiene el nombre en la mano** cuando crea el bloque y lo descarta. Es lo que hace que la rutina se lea como la planilla ("CIRCUITO CALENTAMIENTO", "Fuerza tren inferior", "C 1").

**Files:**
- Create: `supabase/migrations/0016_block_name.sql`
- Modify: `packages/core/src/domain/parseCoachSheet.ts`, `packages/core/src/domain/parseCoachSheet.test.ts`
- Modify: `packages/core/src/validators/parsedProgram.ts`
- Modify: `packages/core/src/domain/buildPlayerDay.ts`
- Modify: `packages/api/src/routes/coach/import.ts`
- Modify: `packages/api/src/access/playerWeek.ts`
- Modify: `packages/api/src/routes/player/week.ts`

- [ ] **Step 1: Escribir el test del parser que falla**

Agregar al final de `packages/core/src/domain/parseCoachSheet.test.ts`:

```ts
describe('el nombre del bloque', () => {
  /**
   * La columna B de la fila del bloque trae su nombre y el parser lo tenía en la
   * mano desde F2, pero lo descartaba: los programas importados quedaban con
   * bloques anónimos y la rutina no se podía leer como la planilla.
   */
  const grid = [
    ['', '', 'kilos', 'repet', 'S'],
    ['', 'SESION 1 - LUNES', '', '', ''],
    ['bloque 1', 'CIRCUITO CALENTAMIENTO', '3 VUELTAS', '', ''],
    ['', 'Lagartijas pronos', 'p.corp', '10', ''],
    ['', 'C 1', '2 vueltas', '', ''],
    ['', 'Pecho plano', '100', '6', ''],
  ]

  it('lo toma de la columna B, tal como lo escribió el coach', () => {
    const program = parseCoachSheet(grid, 'Fuerza 1')
    const blocks = program.weeks[0]!.days[0]!.blocks
    expect(blocks).toHaveLength(2)
    expect(blocks[0]!.name).toBe('CIRCUITO CALENTAMIENTO')
    expect(blocks[1]!.name).toBe('C 1')
  })

  it('el bloque implícito, el que se abre sin fila de bloque, no tiene nombre', () => {
    const noBlockRow = [
      ['', '', 'kilos', 'repet'],
      ['', 'SESION 1 - LUNES', '', ''],
      ['', 'Pecho plano', '100', '6'],
    ]
    const program = parseCoachSheet(noBlockRow, 'Fuerza 1')
    expect(program.weeks[0]!.days[0]!.blocks[0]!.name).toBeNull()
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
pnpm --filter @coachlab/core test -- parseCoachSheet
```

Esperado: **FAIL** con `Property 'name' does not exist` o `expected undefined to be 'CIRCUITO CALENTAMIENTO'`.

- [ ] **Step 3: Agregar `name` al schema del import**

En `packages/core/src/validators/parsedProgram.ts`, dentro de `parsedBlockSchema`:

```ts
export const parsedBlockSchema = z
  .object({
    type: z.enum(['SINGLE', 'CIRCUIT']),
    /**
     * El nombre que el coach le puso al bloque en la columna B de la planilla
     * ("CIRCUITO CALENTAMIENTO", "C 1"). Nullable: un bloque implícito —el que se
     * abre porque aparecieron ejercicios sin fila de bloque— no tiene ninguno.
     */
    name: z.string().trim().min(1).max(60).nullable(),
    rounds: z.number().int().min(1).max(20).nullable(),
    exercises: z.array(parsedExerciseSchema).max(40),
  })
```

- [ ] **Step 4: Que el parser lo conserve**

En `packages/core/src/domain/parseCoachSheet.ts`, en el bloque `--- ¿arranca un bloque? ---`, reemplazar la asignación de `block`:

```ts
        // El nombre está en la columna B de esta misma fila y hasta F3.5 se
        // descartaba. `label` ya lo tiene resuelto arriba.
        const blockName = label ? label.slice(0, 60) : null
        block = roundsHere
          ? { type: 'CIRCUIT', name: blockName, rounds: Number(roundsHere[1]), exercises: [] }
          : { type: 'SINGLE', name: blockName, rounds: null, exercises: [] }
        day.blocks.push(block)
        continue
```

Y en el bloque implícito de más abajo (`if (!block) {`):

```ts
      if (!block) {
        // Bloque implícito: aparecieron ejercicios sin fila de bloque, así que no
        // hay nombre que rescatar.
        block = { type: 'SINGLE', name: null, rounds: null, exercises: [] }
        day.blocks.push(block)
      }
```

- [ ] **Step 5: Correr y verificar que pasa**

```bash
pnpm --filter @coachlab/core test -- parseCoachSheet
```

Esperado: **PASS**.

- [ ] **Step 6: Escribir la migración**

Crear `supabase/migrations/0016_block_name.sql`:

```sql
-- El import venía descartando el nombre del bloque.
--
-- La columna B de la fila del bloque trae su nombre ("CIRCUITO CALENTAMIENTO",
-- "Fuerza tren inferior", "C 1") y parseCoachSheet lo tenía en la mano al crear
-- el ParsedBlock, pero no lo guardaba: blocks era (id, day_id, type, rounds,
-- order_index). El resultado es que la rutina del jugador no se podía leer como
-- la planilla, que es lo que F3.5 vino a arreglar.
--
-- Nullable a propósito: los bloques ya importados no tienen nombre, y un bloque
-- implícito —el que el parser abre cuando aparecen ejercicios sin fila de
-- bloque— tampoco. Un CIRCUIT sigue pudiendo rotularse solo por sus vueltas.

alter table public.blocks add column name text;

-- El largo va como CHECK además de en Zod (CLAUDE.md §5: Zod da el mensaje
-- lindo, la base da la garantía). btrim para que un nombre de espacios no cuente
-- como nombre.
alter table public.blocks
  add constraint blocks_name_len check (
    name is null or length(btrim(name)) between 1 and 60
  );
```

- [ ] **Step 7: Aplicarla y regenerar los tipos**

```bash
pnpm db:push
pnpm gen:types
git diff --stat packages/core/src/types/database.ts
```

Esperado: el diff de los tipos muestra `name: string | null` en `blocks`. Si `gen:types` falla, falta `SUPABASE_PROJECT_ID` en el entorno (Task 2 la documenta, pero hay que exportarla).

- [ ] **Step 8: Escribirlo desde el import**

En `packages/api/src/routes/coach/import.ts`, en el `insert` de `blocks`:

```ts
            .insert({
              day_id: createdDay.id,
              type: block.type,
              name: block.name,
              rounds: block.type === 'CIRCUIT' ? block.rounds : null,
              order_index: blockIndex,
            })
```

- [ ] **Step 9: Que llegue hasta la pantalla del jugador**

Tres archivos, en orden de dependencia.

En `packages/core/src/domain/buildPlayerDay.ts`, agregar `name` a `PlannedBlock`:

```ts
export type PlannedBlock = {
  id: string
  type: 'SINGLE' | 'CIRCUIT'
  /** El nombre de la planilla. Null en los bloques importados antes de F3.5. */
  name: string | null
  rounds: number | null
  exercises: PlannedExercise[]
}
```

> `PlayerBlock` es `Omit<PlannedBlock, 'exercises'> & {...}`, así que hereda `name` sin cambios. El `...block` del `map` ya lo propaga.

Borrar del comentario de cabecera de `PlannedExercise` la frase "Tampoco hay nombre de bloque: `blocks` es (id, day_id, type, rounds, order_index)", que queda mintiendo.

En `packages/api/src/access/playerWeek.ts`, agregar la columna al select de `loadTree` y al objeto que arma:

```ts
      `id, name, order_index,
       blocks (
         id, type, name, rounds, order_index,
         block_exercises (
```

```ts
    blocks: sortByOrderIndex(day.blocks ?? []).map((block) => ({
      id: block.id,
      type: block.type === 'CIRCUIT' ? ('CIRCUIT' as const) : ('SINGLE' as const),
      name: block.name,
      rounds: block.rounds,
```

> Si la Task 8 no se hizo, agregar también `name: string | null` al tipo local `BlockRow` del mismo archivo.

En `packages/api/src/routes/player/week.ts`, agregar el campo al schema OpenAPI `PlayerBlock`:

```ts
const PlayerBlock = z
  .object({
    id: z.string(),
    type: z.enum(['SINGLE', 'CIRCUIT']),
    name: z.string().nullable(),
    rounds: z.number().nullable(),
    exercises: z.array(PlayerExercise),
  })
  .openapi('PlayerBlock')
```

- [ ] **Step 10: Regenerar el cliente del frontend**

```bash
pnpm dump:openapi && pnpm --filter @coachlab/web generate:api
```

Esperado: `packages/web/generated/` cambia y `PlayerBlock` ahora tiene `name`. **No editar `generated/` a mano** (`CLAUDE.md` §5).

- [ ] **Step 11: Verificar**

```bash
pnpm typecheck && pnpm test
```

Esperado: exit 0 y todo verde. Los tests de `import.test.ts` pueden fallar si construyen un `ParsedBlock` literal sin `name`: agregarles `name: null`.

- [ ] **Step 12: Commit**

```bash
git add supabase/migrations/0016_block_name.sql packages/core packages/api packages/web/generated
git commit -m "feat(import): keep the block name the spreadsheet already had"
```

---

### Task 10: `session_logs.perceived_rpe` — el RPE del día

El RPE percibido pasa de una vez por ejercicio a **una vez por día** (spec §2.1), y no tiene dónde vivir: `session_logs` es `(id, player_id, day_id, note, completed_at, updated_at)`.

**Files:**
- Create: `supabase/migrations/0017_session_log_rpe.sql`
- Modify: `packages/core/src/validators/session.ts`, `packages/core/src/validators/session.test.ts`
- Modify: `packages/api/src/routes/player/week.ts`

- [ ] **Step 1: Escribir el test del validador que falla**

Agregar al final de `packages/core/src/validators/session.test.ts`:

```ts
describe('el cierre del día', () => {
  /**
   * El RPE del día es OPCIONAL y no bloquea cerrar: es la decisión de producto de
   * pedirlo una vez en vez de doce (spec de F3.5 §2.1). Si fuera obligatorio,
   * sería la misma encuesta que se vino a sacar.
   */
  it('acepta cerrar sin nada', () => {
    expect(completeDaySchema.safeParse({}).success).toBe(true)
  })

  it('acepta la nota y el RPE juntos', () => {
    const result = completeDaySchema.safeParse({ note: 'Pesado el circuito', perceivedRpe: 8 })
    expect(result.success).toBe(true)
  })

  it('acepta medio punto, como la columna', () => {
    expect(completeDaySchema.safeParse({ perceivedRpe: 7.5 }).success).toBe(true)
  })

  it('rechaza fuera de 1 a 10', () => {
    expect(completeDaySchema.safeParse({ perceivedRpe: 0 }).success).toBe(false)
    expect(completeDaySchema.safeParse({ perceivedRpe: 11 }).success).toBe(false)
  })

  it('null significa "no lo contesté", y es válido', () => {
    expect(completeDaySchema.safeParse({ perceivedRpe: null }).success).toBe(true)
  })
})
```

Y agregar `completeDaySchema` al import de la cabecera del archivo de test.

- [ ] **Step 2: Correr y verificar que falla**

```bash
pnpm --filter @coachlab/core test -- session
```

Esperado: **FAIL** con `completeDaySchema is not defined`.

- [ ] **Step 3: Agregar el schema**

En `packages/core/src/validators/session.ts`, después de `dayNoteSchema`:

```ts
/**
 * Lo que se manda al cerrar el día: la nota y el RPE percibido.
 *
 * El RPE pasó de una vez por ejercicio a una vez por día (spec de F3.5 §2.1):
 * doce preguntas por sesión garantizan que nadie las conteste, una sola es un
 * toque. Los dos campos son opcionales y NO bloquean el cierre — si fueran
 * obligatorios volvería a ser la encuesta que se vino a sacar.
 *
 * Espeja el CHECK de session_logs.perceived_rpe (migración 0017): numeric(3,1)
 * entre 1 y 10, igual que exercise_entries.rpe.
 */
export const completeDaySchema = dayNoteSchema.extend({
  perceivedRpe: z
    .number()
    .min(1, 'El RPE va de 1 a 10')
    .max(10, 'El RPE va de 1 a 10')
    .nullish(),
})

export type CompleteDayInput = z.infer<typeof completeDaySchema>
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
pnpm --filter @coachlab/core test -- session
```

Esperado: **PASS**.

- [ ] **Step 5: Escribir la migración**

Crear `supabase/migrations/0017_session_log_rpe.sql`:

```sql
-- El RPE percibido pasa de una vez por ejercicio a una vez por día.
--
-- CLAUDE.md §1 define comparar RPE objetivo vs. percibido como el dato clave del
-- producto, y F4 es esa pantalla. F3.5 no lo saca: lo pide UNA vez al cerrar el
-- día en lugar de doce veces por sesión, porque pedirlo doce veces garantiza que
-- nadie lo complete (spec de F3.5 §2.1).
--
-- session_logs no tenía dónde guardarlo: era (id, player_id, day_id, note,
-- completed_at, updated_at). El RPE por ejercicio sigue existiendo en
-- exercise_entries.rpe como campo opcional del slideover; lo que cambia es cuál
-- de los dos se le pide al jugador.
--
-- Nullable porque es opcional y no bloquea cerrar el día. El rango espeja el de
-- exercise_entries.rpe: numeric(3,1) entre 1 y 10, medio punto incluido.

alter table public.session_logs
  add column perceived_rpe numeric(3, 1);

alter table public.session_logs
  add constraint session_logs_perceived_rpe_range check (
    perceived_rpe is null or perceived_rpe between 1 and 10
  );
```

- [ ] **Step 6: Aplicar y regenerar tipos**

```bash
pnpm db:push && pnpm gen:types
```

Esperado: `session_logs` en los tipos ahora tiene `perceived_rpe: number | null`.

- [ ] **Step 7: Aceptarlo en la ruta de cierre**

En `packages/api/src/routes/player/week.ts`: cambiar el import,

```ts
import { completeDaySchema, exerciseEntrySchema } from '@coachlab/core/validators/session'
```

el body de la ruta de complete,

```ts
      body: { content: { 'application/json': { schema: completeDaySchema } } },
```

y su handler:

```ts
    const actor = c.get('actor')!
    const { dayId } = c.req.valid('param')
    const { note, perceivedRpe } = c.req.valid('json')
    const db = c.get('db')

    await assertOwnedDay(db, { id: actor.id, positionId: actor.positionId }, dayId)
    const log = await ensureSessionLog(db, actor.id, dayId)

    const { data, error } = await db
      .from('session_logs')
      .update({
        note: note ?? null,
        perceived_rpe: perceivedRpe ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', log.id)
      .select('id')
      .maybeSingle()
    assertRow(data, error)
```

Y agregar `perceivedRpe` al schema `PlayerDay` para que la pantalla pueda prellenarlo al reabrir:

```ts
    note: z.string().nullable(),
    perceivedRpe: z.number().nullable(),
    completed: z.boolean(),
```

- [ ] **Step 8: Devolverlo desde la capa de acceso**

En `packages/api/src/access/playerWeek.ts`, `dayNotesFor` hoy devuelve solo la nota. Renombrarla y ampliarla:

```ts
/** Lo que el jugador dejó en un día: la nota y el RPE, para prellenar el cierre. */
export async function dayClosingsFor(
  db: SupabaseClient<Database>,
  playerId: string,
  dayIds: readonly string[],
): Promise<Map<string, { note: string | null; perceivedRpe: number | null }>> {
  if (dayIds.length === 0) return new Map()

  const { data, error } = await db
    .from('session_logs')
    .select('day_id, note, perceived_rpe')
    .eq('player_id', playerId)
    .in('day_id', [...dayIds])
  if (error) throw new Error(error.message)

  return new Map(
    (data ?? []).map((row) => [row.day_id, { note: row.note, perceivedRpe: row.perceived_rpe }]),
  )
}
```

> Si la Task 7 no se hizo, la firma es `db: SupabaseClient` sin genérico y hay que castear `row.day_id as string`.

Y en `routes/player/week.ts`, el handler del GET:

```ts
    const closings = await dayClosingsFor(
      db,
      actor.id,
      week.days.map((day) => day.id),
    )
    const completed = new Set(week.completedDayIds)
```

```ts
          days: week.days.map((day) => ({
            ...day,
            note: closings.get(day.id)?.note ?? null,
            perceivedRpe: closings.get(day.id)?.perceivedRpe ?? null,
            completed: completed.has(day.id),
          })),
```

Actualizar el import (`dayClosingsFor` en vez de `dayNotesFor`) y buscar otros consumidores:

```bash
grep -rn "dayNotesFor" packages scripts | grep -v node_modules
```

- [ ] **Step 9: Verificar**

```bash
pnpm dump:openapi && pnpm --filter @coachlab/web generate:api && pnpm typecheck && pnpm test
```

Esperado: exit 0 y todo verde.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0017_session_log_rpe.sql packages/core packages/api packages/web/generated
git commit -m "feat(player): ask the perceived RPE once per day instead of per exercise"
```

---

### Task 11: El trigger que sincroniza el 1RM con la evaluación

Hoy `evaluations` y `one_rms` son dos tablas sin ninguna relación. El jugador carga un test de sentadilla y su rutina sigue calculando con el 1RM viejo — o peor, le muestra "falta tu 1RM de Sentadilla" al lado del test que acaba de cargar.

**Files:**
- Create: `supabase/migrations/0018_evaluation_syncs_one_rm.sql`

> **Va como trigger y no en la ruta**, y la razón es de arquitectura: las evaluaciones las escriben **dos roles por caminos distintos** —el jugador desde su perfil, el coach desde la ficha del plantel, y en lote en una instancia de testeo—. Un trigger lo garantiza una vez; en las rutas habría que acordarse en cada una, y la próxima ruta nacería sin la regla. `CLAUDE.md` §4: la capa 1 es la única que un bug de aplicación no puede saltear. La misma regla existe además como función pura (`nextOneRmFrom`, Task 12) para poder testearla sin base.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/0018_evaluation_syncs_one_rm.sql`:

```sql
-- Una evaluación nueva actualiza el 1RM vigente.
--
-- evaluations y one_rms venían sin ninguna relación: CLAUDE.md §3 las describe
-- como "historial de tests" y "el 1RM vigente", y nada las conectaba. Eso es
-- visible para el jugador y se lee como un bug — el dashboard le muestra
-- "Sentadilla 140 kg" como su último test mientras la rutina le calcula los kg
-- con el valor viejo, o le pone el banner "falta tu 1RM de Sentadilla" al lado de
-- un test que acaba de cargar.
--
-- Modelo: la evaluación es el EVENTO, el 1RM es la PROYECCIÓN.
--
-- Dos precisiones que son las que evitan que la regla haga daño:
--
--   1. Solo pisa el 1RM si esta evaluación es la MÁS RECIENTE del par
--      (jugador, ejercicio). Cargar un test viejo que faltaba no arruina el 1RM
--      vigente. El desempate por created_at cubre dos tests el mismo día.
--   2. Un test más bajo BAJA el 1RM. Es "el 1RM vigente", no "el récord": si hoy
--      levantás 155 donde antes 160, tus porcentajes tienen que salir de 155.
--      Después se puede editar a mano y ahí gana el último que escribe, la misma
--      regla que el perfil (spec de F3 §3.2).
--
-- NO es security definer, a propósito. Corre con los privilegios del que inserta,
-- así que el insert en one_rms pasa por RLS igual que cualquier otro. Y puede:
-- one_rms_write (migración 0011) admite exactamente el mismo conjunto de
-- escritores que evaluations_write (0003) — el jugador, su coach y el admin. Con
-- security definer el trigger escribiría como owner salteando RLS, que es más
-- poder del necesario para nada.
--
--   Riesgo conocido: si esas dos políticas divergen en el futuro, el trigger
--   empieza a fallar con 42501 y rompe el insert de la evaluación. Falla ruidoso,
--   no silencioso, que es lo que se quiere.

create or replace function public.sync_one_rm_from_evaluation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- ¿Hay alguna evaluación posterior del mismo par? Entonces esta no manda.
  if exists (
    select 1
    from public.evaluations e
    where e.player_id = new.player_id
      and e.exercise_id = new.exercise_id
      and e.id <> new.id
      and (
        e.tested_on > new.tested_on
        or (e.tested_on = new.tested_on and e.created_at > new.created_at)
      )
  ) then
    return new;
  end if;

  insert into public.one_rms (player_id, exercise_id, kg, updated_at)
  values (new.player_id, new.exercise_id, new.kg, now())
  on conflict (player_id, exercise_id)
  do update set kg = excluded.kg, updated_at = excluded.updated_at;

  return new;
end;
$$;

-- Hygiene: una función de trigger no se llama nunca directo, así que nadie
-- necesita EXECUTE sobre ella. `from public, anon` y no solo `from anon`:
-- Postgres otorga EXECUTE a PUBLIC al crear una función, y revocar solo a anon
-- deja ese grant en pie (lección de IMPLEMENTATION-F2.md §4.2, donde la forma
-- incompleta se copió tres veces).
revoke execute on function public.sync_one_rm_from_evaluation() from public, anon;

-- `of kg, tested_on` en el update: cambiar otra columna no tiene por qué
-- recalcular nada.
create trigger evaluations_sync_one_rm
  after insert or update of kg, tested_on on public.evaluations
  for each row execute function public.sync_one_rm_from_evaluation();
```

- [ ] **Step 2: Aplicarla**

```bash
pnpm db:push
```

Esperado: `Applying migration 0018_evaluation_syncs_one_rm.sql...` sin error. `gen:types` **no** hace falta: un trigger no cambia la forma de ninguna tabla.

- [ ] **Step 3: Probarla a mano contra la base antes de confiar**

El check automatizado va en la Task 24, pero conviene verificarla ya. En el SQL editor de Supabase, con el id de un jugador de prueba y un ejercicio del catálogo:

```sql
-- 1. Un test nuevo crea el 1RM
insert into public.evaluations (player_id, exercise_id, kg, tested_on)
values ('<player-uuid>', '<exercise-uuid>', 140, '2026-07-01');
select kg from public.one_rms where player_id = '<player-uuid>' and exercise_id = '<exercise-uuid>';
-- espera 140.0

-- 2. Un test posterior lo pisa, incluso si es MÁS BAJO
insert into public.evaluations (player_id, exercise_id, kg, tested_on)
values ('<player-uuid>', '<exercise-uuid>', 132, '2026-07-15');
-- espera 132.0

-- 3. Un test VIEJO no lo pisa
insert into public.evaluations (player_id, exercise_id, kg, tested_on)
values ('<player-uuid>', '<exercise-uuid>', 100, '2026-06-01');
-- sigue esperando 132.0

-- limpieza
delete from public.evaluations where player_id = '<player-uuid>';
delete from public.one_rms   where player_id = '<player-uuid>';
```

Los tres resultados tienen que dar lo esperado. **El tercero es el que importa**: si da 100, la condición del `exists` está mal.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0018_evaluation_syncs_one_rm.sql
git commit -m "feat(db): sync the current 1RM from the latest evaluation"
```

---

# Fase E — Dominio puro

Sin Supabase, sin Hono, sin Vue, sin `process.env`. Es lo que se testea primero (`CLAUDE.md` §5).

### Task 12: `evaluationTrend` y `nextOneRmFrom`

Los cinco casos de tendencia del mock, y la regla del trigger de la Task 11 como función testeable.

**Files:**
- Create: `packages/core/src/domain/evaluationTrend.ts`
- Create: `packages/core/src/domain/evaluationTrend.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `packages/core/src/domain/evaluationTrend.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { evaluationTrend, nextOneRmFrom, type Evaluation } from './evaluationTrend'

const ev = (kg: number, testedOn: string): Evaluation => ({ kg, testedOn })

describe('evaluationTrend', () => {
  it('sin evaluaciones no hay nada que comparar', () => {
    expect(evaluationTrend([])).toEqual({
      latest: null,
      previous: null,
      deltaKg: null,
      direction: 'none',
    })
  })

  it('con una sola no hay contra qué comparar', () => {
    const trend = evaluationTrend([ev(70, '2026-07-12')])
    expect(trend.latest).toEqual(ev(70, '2026-07-12'))
    expect(trend.previous).toBeNull()
    expect(trend.deltaKg).toBeNull()
    expect(trend.direction).toBe('first')
  })

  it('subió', () => {
    const trend = evaluationTrend([ev(132, '2026-06-01'), ev(140, '2026-07-12')])
    expect(trend.latest!.kg).toBe(140)
    expect(trend.previous!.kg).toBe(132)
    expect(trend.deltaKg).toBe(8)
    expect(trend.direction).toBe('up')
  })

  it('bajó — y el delta es negativo, no absoluto', () => {
    const trend = evaluationTrend([ev(160, '2026-06-01'), ev(155, '2026-07-12')])
    expect(trend.deltaKg).toBe(-5)
    expect(trend.direction).toBe('down')
  })

  it('igual', () => {
    const trend = evaluationTrend([ev(100, '2026-06-01'), ev(100, '2026-07-12')])
    expect(trend.deltaKg).toBe(0)
    expect(trend.direction).toBe('flat')
  })

  it('ordena por fecha, no confía en el orden que le llega', () => {
    // CLAUDE.md §3: el orden nunca sale del orden en que vuelven las filas.
    const trend = evaluationTrend([ev(140, '2026-07-12'), ev(120, '2026-05-01'), ev(132, '2026-06-01')])
    expect(trend.latest!.kg).toBe(140)
    expect(trend.previous!.kg).toBe(132)
  })

  it('no arrastra ruido de punto flotante', () => {
    // 102.5 - 100.2 en float da 2.3000000000000114.
    expect(evaluationTrend([ev(100.2, '2026-06-01'), ev(102.5, '2026-07-01')]).deltaKg).toBe(2.3)
  })

  it('con dos el mismo día, el último del array gana el desempate', () => {
    // Espeja el desempate del trigger 0018, que usa created_at.
    const trend = evaluationTrend([ev(150, '2026-07-12'), ev(152, '2026-07-12')])
    expect(trend.latest!.kg).toBe(152)
    expect(trend.previous!.kg).toBe(150)
  })
})

describe('nextOneRmFrom', () => {
  /**
   * Es la regla del trigger 0018 expresada como función pura. El trigger es la
   * garantía; esto es la especificación testeable, y en particular lo que permite
   * verificar en milisegundos que un test VIEJO no pisa el 1RM vigente.
   */
  it('sin evaluaciones no hay 1RM', () => {
    expect(nextOneRmFrom([])).toBeNull()
  })

  it('es el kg de la evaluación más reciente', () => {
    expect(nextOneRmFrom([ev(132, '2026-06-01'), ev(140, '2026-07-12')])).toBe(140)
  })

  it('un test más bajo BAJA el 1RM — es el vigente, no el récord', () => {
    expect(nextOneRmFrom([ev(160, '2026-06-01'), ev(155, '2026-07-12')])).toBe(155)
  })

  it('cargar un test viejo NO cambia el 1RM vigente', () => {
    const before = nextOneRmFrom([ev(132, '2026-07-15')])
    const after = nextOneRmFrom([ev(132, '2026-07-15'), ev(100, '2026-06-01')])
    expect(after).toBe(before)
    expect(after).toBe(132)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
pnpm --filter @coachlab/core test -- evaluationTrend
```

Esperado: **FAIL** — `Failed to resolve import "./evaluationTrend"`.

- [ ] **Step 3: Escribir la implementación**

Crear `packages/core/src/domain/evaluationTrend.ts`:

```ts
/**
 * Tendencia de los tests de fuerza del jugador.
 *
 * Qué se compara lo decidió el spec de F3.5 §2.2: **la última medición contra la
 * anterior**. No contra la mejor histórica (eso es récord personal, no tendencia)
 * ni contra hace N semanas (obliga a elegir N sin datos para hacerlo).
 *
 * El riesgo de esa elección —"un mal día se lee como retroceso"— lo desactiva una
 * regla de color y no un cambio de algoritmo: **"bajó" nunca es rojo**, va en
 * muted (docs/DESIGN-SYSTEM.md §3.2). Por eso `direction` describe el hecho y no
 * lo juzga: la vista decide cómo pintarlo.
 */

/** Una evaluación, ya aplanada por la capa de acceso. `testedOn` es `YYYY-MM-DD`. */
export type Evaluation = {
  kg: number
  testedOn: string
}

export type TrendDirection = 'up' | 'down' | 'flat' | 'first' | 'none'

export type Trend = {
  latest: Evaluation | null
  previous: Evaluation | null
  /** Positivo si subió, negativo si bajó. Null cuando no hay con qué comparar. */
  deltaKg: number | null
  direction: TrendDirection
}

/**
 * Ordena de más vieja a más reciente.
 *
 * `testedOn` es `YYYY-MM-DD`, así que comparar los strings ordena por fecha sin
 * construir un Date. El desempate del mismo día es el ORDEN DE LLEGADA, que
 * espeja el `created_at` del trigger 0018: `sort` de JS es estable, así que la
 * última del array gana.
 */
function chronological(evaluations: readonly Evaluation[]): Evaluation[] {
  return [...evaluations].sort((a, b) => (a.testedOn < b.testedOn ? -1 : a.testedOn > b.testedOn ? 1 : 0))
}

/** Redondea a un decimal: la columna es numeric(5,1) y el float arrastra ruido. */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function evaluationTrend(evaluations: readonly Evaluation[]): Trend {
  const sorted = chronological(evaluations)
  const latest = sorted[sorted.length - 1] ?? null
  const previous = sorted.length >= 2 ? (sorted[sorted.length - 2] ?? null) : null

  if (!latest) return { latest: null, previous: null, deltaKg: null, direction: 'none' }
  if (!previous) return { latest, previous: null, deltaKg: null, direction: 'first' }

  const deltaKg = round1(latest.kg - previous.kg)
  return {
    latest,
    previous,
    deltaKg,
    direction: deltaKg > 0 ? 'up' : deltaKg < 0 ? 'down' : 'flat',
  }
}

/**
 * El 1RM vigente que sale de un historial de evaluaciones.
 *
 * Es la regla del trigger `sync_one_rm_from_evaluation` (migración 0018) escrita
 * como función pura. El trigger es la garantía —lo aplica sin importar por qué
 * ruta entró la evaluación—; esto es la especificación testeable, y lo que permite
 * verificar en milisegundos que cargar un test viejo NO pisa el 1RM vigente.
 */
export function nextOneRmFrom(evaluations: readonly Evaluation[]): number | null {
  return evaluationTrend(evaluations).latest?.kg ?? null
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
pnpm --filter @coachlab/core test -- evaluationTrend
```

Esperado: **PASS**, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/evaluationTrend.ts packages/core/src/domain/evaluationTrend.test.ts
git commit -m "feat(domain): add evaluation trend and the derived current 1RM"
```

---

### Task 13: `weekProgress`

Los números de la rueda "2/3 rutinas de esta semana".

**Files:**
- Create: `packages/core/src/domain/weekProgress.ts`
- Create: `packages/core/src/domain/weekProgress.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `packages/core/src/domain/weekProgress.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { weekProgress } from './weekProgress'

describe('weekProgress', () => {
  it('cuenta los días completados sobre el total', () => {
    expect(weekProgress(['a', 'b'], 3)).toEqual({ completed: 2, total: 3, ratio: 2 / 3 })
  })

  it('la semana sin empezar', () => {
    expect(weekProgress([], 3)).toEqual({ completed: 0, total: 3, ratio: 0 })
  })

  it('la semana entera', () => {
    expect(weekProgress(['a', 'b', 'c'], 3)).toEqual({ completed: 3, total: 3, ratio: 1 })
  })

  it('sin días no divide por cero', () => {
    // Pasa de verdad: un programa recién creado, sin días todavía.
    expect(weekProgress([], 0)).toEqual({ completed: 0, total: 0, ratio: 0 })
  })

  it('no cuenta dos veces el mismo día', () => {
    expect(weekProgress(['a', 'a', 'b'], 3).completed).toBe(2)
  })

  it('nunca pasa de 1 aunque lleguen más completados que días', () => {
    // Defensivo: un día borrado del programa cuyo session_log quedó vivo.
    expect(weekProgress(['a', 'b', 'c', 'd'], 3)).toEqual({ completed: 3, total: 3, ratio: 1 })
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
pnpm --filter @coachlab/core test -- weekProgress
```

Esperado: **FAIL** — no resuelve el import.

- [ ] **Step 3: Escribir la implementación**

Crear `packages/core/src/domain/weekProgress.ts`:

```ts
/**
 * El progreso de la semana del jugador: "2/3 rutinas de esta semana".
 *
 * Deriva de session_logs.completed_at, que ya existía desde F0. No hay checkbox
 * por ejercicio y esto no lo inventa: cuenta DÍAS CERRADOS, que es lo único que
 * el jugador afirmó explícitamente.
 *
 * Ojo con lo que este número NO dice: la semana vigente sale de
 * programs.current_week_id, que es global al programa y no por jugador. Si el
 * coach avanza la semana, el progreso de todo el plantel se reinicia junto. Es lo
 * que definió el modelo de F0 y alcanza para un plantel que entrena junto
 * (deuda anotada en el spec de F3.5 §12).
 */
export type WeekProgress = {
  completed: number
  total: number
  /** 0..1, listo para el conic-gradient de la rueda. 0 cuando no hay días. */
  ratio: number
}

export function weekProgress(
  completedDayIds: readonly string[],
  totalDays: number,
): WeekProgress {
  const total = Math.max(0, Math.trunc(totalDays))
  // Set porque un day_id repetido no es un día más. Y el clamp por si quedó un
  // session_log de un día que ya no está en la semana.
  const completed = Math.min(new Set(completedDayIds).size, total)

  return { completed, total, ratio: total === 0 ? 0 : completed / total }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
pnpm --filter @coachlab/core test -- weekProgress
```

Esperado: **PASS**, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/weekProgress.ts packages/core/src/domain/weekProgress.test.ts
git commit -m "feat(domain): add the week progress used by the player's ring"
```

---

### Task 14: `evaluationSchema`

**Files:**
- Create: `packages/core/src/validators/evaluation.ts`
- Create: `packages/core/src/validators/evaluation.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `packages/core/src/validators/evaluation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { evaluationSchema } from './evaluation'

const EXERCISE = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
const today = () => new Date().toISOString().slice(0, 10)

describe('evaluationSchema', () => {
  it('acepta lo mínimo: ejercicio y kg', () => {
    expect(evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 140 }).success).toBe(true)
  })

  it('acepta medio kilo, como la columna numeric(5,1)', () => {
    expect(evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 142.5 }).success).toBe(true)
  })

  it('exige un ejercicio del catálogo, no un nombre libre', () => {
    // ensure_exercise rechaza a PLAYER a propósito (migraciones 0012/0014): el
    // jugador ELIGE del catálogo, no lo escribe.
    expect(evaluationSchema.safeParse({ exerciseId: 'Sentadilla', kg: 140 }).success).toBe(false)
  })

  it('rechaza 0 y negativos: espeja el check (kg > 0)', () => {
    expect(evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 0 }).success).toBe(false)
    expect(evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: -5 }).success).toBe(false)
  })

  it('rechaza un peso que es un error de tipeo', () => {
    expect(evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 5000 }).success).toBe(false)
  })

  it('acepta la fecha de hoy', () => {
    expect(evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 140, testedOn: today() }).success).toBe(true)
  })

  it('acepta una fecha pasada: se cargan tests de una instancia anterior', () => {
    expect(
      evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 140, testedOn: '2026-01-15' }).success,
    ).toBe(true)
  })

  it('rechaza una fecha futura', () => {
    expect(
      evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 140, testedOn: '2099-01-01' }).success,
    ).toBe(false)
  })

  it('rechaza una fecha que no tiene forma de fecha', () => {
    expect(
      evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 140, testedOn: '15/01/2026' }).success,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
pnpm --filter @coachlab/core test -- evaluation
```

Esperado: **FAIL** — no resuelve `./evaluation`.

- [ ] **Step 3: Escribir el schema**

Crear `packages/core/src/validators/evaluation.ts`:

```ts
import { z } from 'zod'

/**
 * Una evaluación de fuerza: el test de un ejercicio en una fecha.
 *
 * La cargan el jugador y su coach por rutas distintas —el coach convoca a una
 * instancia de testeo y así va más rápido— y `evaluations_write` (migración 0003)
 * ya permite las dos puntas sin ningún cambio de RLS.
 *
 * Espeja los CHECK de la tabla (CLAUDE.md §5: Zod da el mensaje lindo, la base da
 * la garantía):
 *
 *   kg        numeric(5,1) not null check (kg > 0)
 *   tested_on date         not null default current_date
 *
 * El tope de 500 kg es más estricto que la columna a propósito, igual que en
 * exerciseEntrySchema: arriba de eso es un error de tipeo, no un levantamiento.
 */
export const evaluationSchema = z.object({
  // El id y no el nombre: ensure_exercise rechaza a PLAYER a propósito
  // (migraciones 0012/0014), así que el jugador elige del catálogo.
  exerciseId: z.string().uuid('Elegí un ejercicio'),
  kg: z.number().positive('Tiene que ser mayor a 0').max(500, 'Revisá el peso'),
  /**
   * Opcional: sin fecha, la base pone `current_date`. Se acepta una fecha pasada
   * porque se cargan tests de una instancia anterior, pero no una futura.
   *
   * La comparación es contra la fecha UTC. Uruguay es UTC-3, o sea que la fecha
   * UTC nunca va ATRÁS de la local: el "hoy" del jugador nunca se rechaza por
   * futuro. Si el club alguna vez juega en UTC+X, esto hay que revisarlo.
   */
  testedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va como AAAA-MM-DD')
    .refine((value) => value <= new Date().toISOString().slice(0, 10), 'Todavía no llegó esa fecha')
    .optional(),
})

export type EvaluationInput = z.infer<typeof evaluationSchema>
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
pnpm --filter @coachlab/core test -- evaluation
```

Esperado: **PASS**, 9 tests.

- [ ] **Step 5: Verificar el gate completo de la fase**

```bash
pnpm typecheck && pnpm test
```

Esperado: exit 0 y el total de tests subido en ~27 sobre el baseline de 332.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/validators/evaluation.ts packages/core/src/validators/evaluation.test.ts
git commit -m "feat(validators): add the strength evaluation schema"
```

---

# Fase F — API

> **Nota sobre los tests de rutas de este repo.** Los tests de `packages/api/src/routes/` **no mockean la base**: verifican los guards (sin sesión → 401) y que la ruta esté declarada en el spec OpenAPI con sus respuestas. Es lo que hacen `week.test.ts` y `profile.test.ts` hoy. El scoping real —que un coach no vea plantel ajeno— lo verifica `verify:setup` contra la base (Task 24), que es el único nivel donde RLS existe. **No inventar un harness de mocks nuevo**: sería infra que nadie más usa y daría una falsa sensación de cobertura.

### Task 15: Evaluaciones del jugador

**Files:**
- Create: `packages/api/src/access/evaluations.ts`
- Create: `packages/api/src/routes/player/evaluations.ts`
- Create: `packages/api/src/routes/player/evaluations.test.ts`
- Modify: `packages/api/src/app.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/api/src/routes/player/evaluations.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { app } from '../../app'

const EVALUATION = '9c858901-8a57-4791-81fe-4c455b099bc9'

describe('rutas de evaluaciones del jugador sin sesión', () => {
  const cases: [string, RequestInit | undefined][] = [
    ['/api/player/evaluations', undefined],
    ['/api/player/evaluations', { method: 'POST', body: '{}' }],
    [`/api/player/evaluations/${EVALUATION}`, { method: 'DELETE' }],
  ]

  for (const [path, init] of cases) {
    it(`${init?.method ?? 'GET'} ${path} → 401`, async () => {
      const res = await app.request(path, { ...init, headers: { 'content-type': 'application/json' } })
      expect(res.status).toBe(401)
    })
  }
})

describe('spec de las evaluaciones del jugador', () => {
  it('declara las rutas', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(spec.paths).toHaveProperty('/api/player/evaluations')
    expect(spec.paths).toHaveProperty('/api/player/evaluations/{evaluationId}')
  })

  it('el POST declara el 404 de recurso ajeno o inexistente', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>
    }
    expect(spec.paths['/api/player/evaluations']!.post!.responses).toHaveProperty('404')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
pnpm --filter @coachlab/api test -- evaluations
```

Esperado: **FAIL** — las rutas dan 404 en vez de 401 (no existen) y el spec no las tiene.

- [ ] **Step 3: Escribir la capa de acceso**

Crear `packages/api/src/access/evaluations.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@coachlab/core/types/database'
import {
  evaluationTrend,
  type Evaluation,
  type TrendDirection,
} from '@coachlab/core/domain/evaluationTrend'
import { NotFoundError } from '@coachlab/core/access/rbac'

/** Una evaluación como la ve la pantalla. */
export type EvaluationRecord = {
  id: string
  exerciseId: string
  exerciseName: string
  kg: number
  testedOn: string
}

/** Un ejercicio con su tendencia, que es la tarjeta del dashboard. */
export type ExerciseTrend = {
  exerciseId: string
  exerciseName: string
  latestKg: number | null
  latestTestedOn: string | null
  previousKg: number | null
  deltaKg: number | null
  direction: TrendDirection
}

/**
 * Las evaluaciones de un jugador, más recientes primero.
 *
 * El scoping lo hace RLS: `evaluations_select` deja al jugador ver las suyas y al
 * coach las de su plantel. Este helper no agrega un `coach_id` a mano porque la
 * política ya lo cubre y duplicarlo acá daría dos fuentes de verdad.
 */
export async function evaluationsFor(
  db: SupabaseClient<Database>,
  playerId: string,
): Promise<EvaluationRecord[]> {
  const { data, error } = await db
    .from('evaluations')
    .select('id, exercise_id, kg, tested_on, exercises!inner(name)')
    .eq('player_id', playerId)
    .order('tested_on', { ascending: false })
  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id: row.id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercises?.name ?? '—',
    kg: row.kg,
    testedOn: row.tested_on,
  }))
}

/**
 * Las evaluaciones agrupadas por ejercicio, con su tendencia resuelta.
 *
 * La decisión de qué se compara vive en `evaluationTrend` (función pura), no acá:
 * esta función solo agrupa. Ordena los ejercicios por su test más reciente, así
 * que el dashboard muestra primero lo que el jugador acaba de medir.
 */
export function trendsFrom(records: readonly EvaluationRecord[]): ExerciseTrend[] {
  const byExercise = new Map<string, { name: string; evaluations: Evaluation[] }>()

  for (const record of records) {
    const group = byExercise.get(record.exerciseId)
    const evaluation: Evaluation = { kg: record.kg, testedOn: record.testedOn }
    if (group) group.evaluations.push(evaluation)
    else byExercise.set(record.exerciseId, { name: record.exerciseName, evaluations: [evaluation] })
  }

  const trends: ExerciseTrend[] = []
  for (const [exerciseId, group] of byExercise) {
    const trend = evaluationTrend(group.evaluations)
    trends.push({
      exerciseId,
      exerciseName: group.name,
      latestKg: trend.latest?.kg ?? null,
      latestTestedOn: trend.latest?.testedOn ?? null,
      previousKg: trend.previous?.kg ?? null,
      deltaKg: trend.deltaKg,
      direction: trend.direction,
    })
  }

  trends.sort((a, b) => (b.latestTestedOn ?? '').localeCompare(a.latestTestedOn ?? ''))
  return trends
}

/**
 * Que el jugador sea del plantel del coach. Recurso ajeno → 404, nunca 403
 * (CLAUDE.md §4 capa 4: no revelar existencia).
 *
 * Mismo pre-chequeo que ya hacen las rutas del 1RM del coach: RLS alcanzaría sola
 * —`evaluations_write` incluye `is_my_player`—, pero sin esto un jugador ajeno
 * devolvería un error de RLS como 500 poco informativo en vez de un 404.
 */
export async function assertMyPlayer(
  db: SupabaseClient<Database>,
  coachId: string,
  playerId: string,
): Promise<void> {
  const { data, error } = await db
    .from('profiles')
    .select('id')
    .eq('id', playerId)
    .eq('coach_id', coachId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new NotFoundError()
}
```

> Si la Task 7 no se hizo, cambiar las tres firmas `SupabaseClient<Database>` por `SupabaseClient`, borrar el import de `Database`, y usar `firstOf(row.exercises)?.name` en `evaluationsFor`.

- [ ] **Step 4: Escribir la ruta**

Crear `packages/api/src/routes/player/evaluations.ts`:

```ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { evaluationSchema } from '@coachlab/core/validators/evaluation'
import { evaluationsFor } from '../../access/evaluations'
import type { AuthVariables } from '../../middleware/auth'
import { assertRow } from '../coach/_scope'
import { ErrorResponse } from '../schemas'

const EvaluationIdParam = z.object({
  evaluationId: z.string().uuid().openapi({ param: { name: 'evaluationId', in: 'path' } }),
})

export const Evaluation = z
  .object({
    id: z.string(),
    exerciseId: z.string(),
    exerciseName: z.string(),
    kg: z.number(),
    testedOn: z.string(),
  })
  .openapi('Evaluation')

const EvaluationsResponse = z
  .object({ ok: z.literal(true), evaluations: z.array(Evaluation) })
  .openapi('PlayerEvaluationsResponse')

const errors = {
  401: {
    description: 'Sin sesión o rol equivocado',
    content: { 'application/json': { schema: ErrorResponse } },
  },
  404: {
    description: 'No existe o no es tuyo',
    content: { 'application/json': { schema: ErrorResponse } },
  },
}

export const playerEvaluations = new OpenAPIHono<{ Variables: AuthVariables }>()

playerEvaluations.openapi(
  createRoute({
    method: 'get',
    path: '/player/evaluations',
    summary: 'Mis tests de fuerza',
    responses: {
      200: {
        description: 'Mis evaluaciones',
        content: { 'application/json': { schema: EvaluationsResponse } },
      },
      401: errors[401],
    },
  }),
  async (c) => {
    const evaluations = await evaluationsFor(c.get('db'), c.get('actor')!.id)
    return c.json({ ok: true as const, evaluations }, 200)
  },
)

playerEvaluations.openapi(
  createRoute({
    method: 'post',
    path: '/player/evaluations',
    summary: 'Cargar un test de fuerza propio',
    request: { body: { content: { 'application/json': { schema: evaluationSchema } } } },
    responses: {
      200: {
        description: 'Cargada, con el 1RM ya sincronizado',
        content: { 'application/json': { schema: EvaluationsResponse } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const input = c.req.valid('json')
    const db = c.get('db')

    // El 1RM NO se toca acá: lo sincroniza el trigger de la migración 0018. Es a
    // propósito — las evaluaciones entran por esta ruta y por la del coach, y una
    // regla duplicada en dos rutas es una regla que la tercera se va a olvidar.
    const { data, error } = await db
      .from('evaluations')
      .insert({
        player_id: actor.id,
        exercise_id: input.exerciseId,
        kg: input.kg,
        // Sin fecha, la base pone current_date.
        ...(input.testedOn ? { tested_on: input.testedOn } : {}),
      })
      .select('id')
      .maybeSingle()
    assertRow(data, error)

    return c.json({ ok: true as const, evaluations: await evaluationsFor(db, actor.id) }, 200)
  },
)

playerEvaluations.openapi(
  createRoute({
    method: 'delete',
    path: '/player/evaluations/{evaluationId}',
    summary: 'Borrar uno de mis tests',
    request: { params: EvaluationIdParam },
    responses: {
      200: {
        description: 'Borrada',
        content: { 'application/json': { schema: EvaluationsResponse } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { evaluationId } = c.req.valid('param')
    const db = c.get('db')

    const { data, error } = await db
      .from('evaluations')
      .delete()
      .eq('id', evaluationId)
      .eq('player_id', actor.id)
      .select('id')
      .maybeSingle()
    assertRow(data, error)

    // Ojo: borrar la evaluación NO revierte el 1RM. El trigger 0018 corre en
    // insert y update, no en delete, así que el 1RM queda con el último valor
    // sincronizado. Es aceptable —el 1RM es editable a mano— y está anotado como
    // deuda en docs/IMPLEMENTATION-F3.5.md.
    return c.json({ ok: true as const, evaluations: await evaluationsFor(db, actor.id) }, 200)
  },
)
```

- [ ] **Step 5: Montarla**

En `packages/api/src/app.ts`, agregar el import y la ruta:

```ts
import { playerEvaluations } from './routes/player/evaluations'
```

```ts
app.route('/', playerWeek)
app.route('/', playerProfile)
app.route('/', playerEvaluations)
```

- [ ] **Step 6: Correr y verificar que pasa**

```bash
pnpm --filter @coachlab/api test -- evaluations
```

Esperado: **PASS**, 5 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/access/evaluations.ts packages/api/src/routes/player/evaluations.ts packages/api/src/routes/player/evaluations.test.ts packages/api/src/app.ts
git commit -m "feat(api): add the player's strength evaluation routes"
```

---

### Task 16: Evaluaciones del coach

El coach convoca a una instancia de testeo y carga las de todo el plantel, que es más rápido que uno por uno.

**Files:**
- Modify: `packages/api/src/routes/coach/players.ts`
- Modify: `packages/api/src/routes/coach/players.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `packages/api/src/routes/coach/players.test.ts`:

```ts
describe('evaluaciones del plantel', () => {
  const PLAYER = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

  it('sin sesión no se listan', async () => {
    const res = await app.request(`/api/coach/players/${PLAYER}/evaluations`)
    expect(res.status).toBe(401)
  })

  it('sin sesión no se cargan', async () => {
    const res = await app.request(`/api/coach/players/${PLAYER}/evaluations`, {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(401)
  })

  it('el spec declara las dos rutas y el 404 de plantel ajeno', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>
    }
    const path = spec.paths['/api/coach/players/{playerId}/evaluations']
    expect(path).toBeDefined()
    expect(path!.get).toBeDefined()
    expect(path!.post!.responses).toHaveProperty('404')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
pnpm --filter @coachlab/api test -- players
```

Esperado: **FAIL** — 404 en vez de 401 y el spec sin la ruta.

- [ ] **Step 3: Agregar las dos rutas**

En `packages/api/src/routes/coach/players.ts`, agregar los imports:

```ts
import { evaluationSchema } from '@coachlab/core/validators/evaluation'
import { assertMyPlayer, evaluationsFor } from '../../access/evaluations'
import { Evaluation } from '../player/evaluations'
```

y al final del archivo:

```ts
// --- evaluaciones del plantel ------------------------------------------------

const PlayerEvaluationsResponse = z
  .object({ ok: z.literal(true), evaluations: z.array(Evaluation) })
  .openapi('CoachPlayerEvaluationsResponse')

players.openapi(
  createRoute({
    method: 'get',
    path: '/coach/players/{playerId}/evaluations',
    summary: 'Los tests de fuerza de un jugador de mi plantel',
    request: { params: PlayerIdParam },
    responses: {
      200: {
        description: 'Sus evaluaciones',
        content: { 'application/json': { schema: PlayerEvaluationsResponse } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { playerId } = c.req.valid('param')
    const db = c.get('db')

    await assertMyPlayer(db, actor.id, playerId)
    return c.json({ ok: true as const, evaluations: await evaluationsFor(db, playerId) }, 200)
  },
)

players.openapi(
  createRoute({
    method: 'post',
    path: '/coach/players/{playerId}/evaluations',
    summary: 'Cargar un test de un jugador de mi plantel',
    request: {
      params: PlayerIdParam,
      body: { content: { 'application/json': { schema: evaluationSchema } } },
    },
    responses: {
      200: {
        description: 'Cargada, con el 1RM del jugador ya sincronizado',
        content: { 'application/json': { schema: PlayerEvaluationsResponse } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { playerId } = c.req.valid('param')
    const input = c.req.valid('json')
    const db = c.get('db')

    // Pre-chequeo antes del insert: `evaluations_write` (0003) ya incluye
    // is_my_player, así que RLS alcanzaría sola, pero sin esto un jugador ajeno
    // devolvería un error de RLS como 500 en vez de un 404 (CLAUDE.md §4 capa 4).
    await assertMyPlayer(db, actor.id, playerId)

    // El 1RM del jugador lo sincroniza el trigger 0018, igual que por la ruta del
    // jugador. Por eso la regla vive en la base y no acá.
    const { data, error } = await db
      .from('evaluations')
      .insert({
        player_id: playerId,
        exercise_id: input.exerciseId,
        kg: input.kg,
        ...(input.testedOn ? { tested_on: input.testedOn } : {}),
      })
      .select('id')
      .maybeSingle()
    assertRow(data, error)

    return c.json({ ok: true as const, evaluations: await evaluationsFor(db, playerId) }, 200)
  },
)
```

> **Verificar dos nombres antes de pegar:** que el param schema del archivo se llame `PlayerIdParam` y que el objeto de respuestas de error se llame `errors`. Si tienen otro nombre en `players.ts`, usar el que está — no renombrar lo existente en esta task.

- [ ] **Step 4: Correr y verificar que pasa**

```bash
pnpm --filter @coachlab/api test -- players
```

Esperado: **PASS**.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/coach/players.ts packages/api/src/routes/coach/players.test.ts
git commit -m "feat(api): let the coach load evaluations for their squad"
```

---

### Task 17: `GET /player/dashboard`

**Files:**
- Create: `packages/api/src/access/playerDashboard.ts`
- Create: `packages/api/src/routes/player/dashboard.ts`
- Create: `packages/api/src/routes/player/dashboard.test.ts`
- Modify: `packages/api/src/app.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/api/src/routes/player/dashboard.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { app } from '../../app'

describe('el dashboard del jugador', () => {
  it('sin sesión → 401', async () => {
    const res = await app.request('/api/player/dashboard')
    expect(res.status).toBe(401)
  })

  it('el spec lo declara', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(spec.paths).toHaveProperty('/api/player/dashboard')
  })

  it('el spec declara el progreso y las tendencias', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> }
    }
    const schema = spec.components.schemas.PlayerDashboardResponse
    expect(schema?.properties).toHaveProperty('progress')
    expect(schema?.properties).toHaveProperty('trends')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
pnpm --filter @coachlab/api test -- dashboard
```

Esperado: **FAIL** — 404 en vez de 401.

- [ ] **Step 3: Escribir la capa de acceso**

Crear `packages/api/src/access/playerDashboard.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@coachlab/core/types/database'
import { sortByOrderIndex } from '@coachlab/core/domain/tree'
import { weekProgress, type WeekProgress } from '@coachlab/core/domain/weekProgress'
import { activeProgramIdFor } from './assignments'
import { evaluationsFor, trendsFrom, type ExerciseTrend } from './evaluations'

export type PlayerDashboard = {
  programName: string | null
  weekName: string | null
  progress: WeekProgress
  trends: ExerciseTrend[]
}

/**
 * Lo que el jugador ve al entrar: cuánto de la semana hizo y cómo viene en sus
 * tests.
 *
 * **No usa `playerWeekFor`** a propósito: esa función arma el árbol entero de la
 * semana con cargas calculadas e historial, y el dashboard solo necesita CONTAR
 * los días. Tres queries chicas en vez de la construcción completa.
 */
export async function playerDashboardFor(
  db: SupabaseClient<Database>,
  player: { id: string; positionId: string | null },
): Promise<PlayerDashboard> {
  const trends = trendsFrom(await evaluationsFor(db, player.id))
  const empty: PlayerDashboard = {
    programName: null,
    weekName: null,
    progress: weekProgress([], 0),
    trends,
  }

  const programId = await activeProgramIdFor(db, player)
  if (!programId) return empty

  // `weeks!weeks_program_id_fkey` NO es opcional: hay dos caminos FK entre
  // programs y weeks (weeks.program_id y programs.current_week_id) y PostgREST
  // devuelve 500 "more than one relationship was found" si no se desambigua. Es
  // el bug de IMPLEMENTATION-F2.md §4.3, y solo lo agarra un request real.
  const { data: program, error: programError } = await db
    .from('programs')
    .select('id, name, current_week_id, weeks!weeks_program_id_fkey(id, name, order_index)')
    .eq('id', programId)
    .maybeSingle()
  if (programError) throw new Error(programError.message)
  if (!program) return empty

  const weeks = sortByOrderIndex(program.weeks ?? [])
  const week = weeks.find((w) => w.id === program.current_week_id) ?? weeks[0]
  if (!week) return { ...empty, programName: program.name }

  const { data: days, error: daysError } = await db.from('days').select('id').eq('week_id', week.id)
  if (daysError) throw new Error(daysError.message)
  const dayIds = (days ?? []).map((day) => day.id)

  if (dayIds.length === 0) {
    return { programName: program.name, weekName: week.name, progress: weekProgress([], 0), trends }
  }

  const { data: logs, error: logsError } = await db
    .from('session_logs')
    .select('day_id')
    .eq('player_id', player.id)
    .not('completed_at', 'is', null)
    .in('day_id', dayIds)
  if (logsError) throw new Error(logsError.message)

  return {
    programName: program.name,
    weekName: week.name,
    progress: weekProgress(
      (logs ?? []).map((log) => log.day_id),
      dayIds.length,
    ),
    trends,
  }
}
```

- [ ] **Step 4: Escribir la ruta**

Crear `packages/api/src/routes/player/dashboard.ts`:

```ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { playerDashboardFor } from '../../access/playerDashboard'
import type { AuthVariables } from '../../middleware/auth'
import { ErrorResponse } from '../schemas'

const ExerciseTrend = z
  .object({
    exerciseId: z.string(),
    exerciseName: z.string(),
    latestKg: z.number().nullable(),
    latestTestedOn: z.string().nullable(),
    previousKg: z.number().nullable(),
    deltaKg: z.number().nullable(),
    direction: z.enum(['up', 'down', 'flat', 'first', 'none']),
  })
  .openapi('ExerciseTrend')

const DashboardResponse = z
  .object({
    ok: z.literal(true),
    programName: z.string().nullable(),
    weekName: z.string().nullable(),
    progress: z.object({
      completed: z.number(),
      total: z.number(),
      ratio: z.number(),
    }),
    trends: z.array(ExerciseTrend),
  })
  .openapi('PlayerDashboardResponse')

export const playerDashboard = new OpenAPIHono<{ Variables: AuthVariables }>()

playerDashboard.openapi(
  createRoute({
    method: 'get',
    path: '/player/dashboard',
    summary: 'Mi progreso de la semana y la tendencia de mis tests',
    responses: {
      200: {
        description: 'El dashboard',
        content: { 'application/json': { schema: DashboardResponse } },
      },
      401: {
        description: 'Sin sesión o rol equivocado',
        content: { 'application/json': { schema: ErrorResponse } },
      },
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const dashboard = await playerDashboardFor(c.get('db'), {
      id: actor.id,
      positionId: actor.positionId,
    })
    return c.json({ ok: true as const, ...dashboard }, 200)
  },
)
```

- [ ] **Step 5: Montarla**

En `packages/api/src/app.ts`:

```ts
import { playerDashboard } from './routes/player/dashboard'
```

```ts
app.route('/', playerDashboard)
```

- [ ] **Step 6: Correr y verificar que pasa**

```bash
pnpm --filter @coachlab/api test -- dashboard
```

Esperado: **PASS**, 3 tests.

- [ ] **Step 7: Regenerar el cliente y verificar el gate**

```bash
pnpm dump:openapi && pnpm --filter @coachlab/web generate:api && pnpm typecheck && pnpm test
```

Esperado: exit 0 y todo verde. `packages/web/generated/` ahora tiene `PlayerDashboardResponse`, `ExerciseTrend` y `Evaluation`.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/access/playerDashboard.ts packages/api/src/routes/player/dashboard.ts packages/api/src/routes/player/dashboard.test.ts packages/api/src/app.ts packages/web/generated
git commit -m "feat(api): add the player dashboard endpoint"
```

---

# Fase G — Pantallas

Los valores visuales (tamaños, jerarquía, copy, tratamiento de cada forma de carga) están en `docs/DESIGN-SYSTEM.md` §5 a §9. **Leer esas secciones antes de esta fase**; el plan no los duplica para que no haya dos fuentes de verdad.

**Recordatorio de la regla 1:** cada task que agregue un `i-lucide-*` lo agrega también a `clientBundle.icons` de `nuxt.config.ts`, y si deja de usar uno lo saca. `pnpm --filter @coachlab/web test` lo verifica en los dos sentidos.

### Task 18: El dashboard

**Files:**
- Create: `packages/web/app/pages/player/index.vue`
- Create: `packages/web/app/components/player/ProgressRing.vue`
- Create: `packages/web/app/components/player/EvaluationCard.vue`
- Modify: `packages/web/app/composables/useAuth.ts`
- Modify: `packages/web/app/components/AppSidebar.vue`
- Modify: `packages/web/nuxt.config.ts`

- [ ] **Step 1: La rueda de progreso**

Crear `packages/web/app/components/player/ProgressRing.vue`:

```vue
<script setup lang="ts">
/**
 * "2/3 rutinas de esta semana".
 *
 * conic-gradient y no un SVG: son dos divs y un gradiente, sin viewBox ni
 * cálculo de circunferencia. El agujero del medio es un círculo del color de la
 * tarjeta encima, que es el truco clásico y funciona en los dos modos porque el
 * color sale del token.
 */
const props = defineProps<{ completed: number; total: number; ratio: number }>()

const degrees = computed(() => Math.round(props.ratio * 360))
</script>

<template>
  <div class="flex flex-col items-center gap-1.5 rounded-xl bg-navy-500 p-4">
    <div
      class="flex size-30 items-center justify-center rounded-full"
      :style="{
        background: `conic-gradient(var(--color-gold-400) 0deg ${degrees}deg, rgba(255,255,255,.18) ${degrees}deg 360deg)`,
      }"
    >
      <div class="flex size-23 items-center justify-center rounded-full bg-navy-500">
        <span class="text-2xl font-bold text-white">{{ completed }}/{{ total }}</span>
      </div>
    </div>
    <p class="text-xs text-navy-200">rutinas de esta semana</p>
  </div>
</template>
```

> **La tarjeta es marina en los dos modos**, a propósito: en el mock el ring vive sobre marino en claro y sobre la tarjeta oscura en oscuro, pero el marino sobre `#10152a` sigue leyéndose y ahorra un `dark:` que no aporta. Si al mirarlo se pierde, la corrección es `dark:bg-[--ui-bg-muted]` en el contenedor **y** en el círculo del agujero.

- [ ] **Step 2: La tarjeta de tendencia**

Crear `packages/web/app/components/player/EvaluationCard.vue`:

```vue
<script setup lang="ts">
import type { ExerciseTrend } from '~~/generated'

/**
 * Un ejercicio con su tendencia. Los cinco casos son todos los que existen:
 * subió, igual, bajó, primera evaluación, y sin evaluaciones.
 *
 * REGLA QUE NO SE NEGOCIA (docs/DESIGN-SYSTEM.md §3.2): **"bajó" nunca es rojo.**
 * Va en muted. Bajar en un test no es un error del jugador ni algo que la UI deba
 * castigar visualmente.
 */
const props = defineProps<{ trend: ExerciseTrend }>()

const ICON = {
  up: 'i-lucide-trending-up',
  down: 'i-lucide-trending-down',
  flat: 'i-lucide-minus',
} as const

const icon = computed(() => ICON[props.trend.direction as keyof typeof ICON] ?? null)

// Dorado en claro, azul claro en oscuro (el dorado no hace falta ahí). El resto
// de las direcciones, muted.
const deltaClass = computed(() =>
  props.trend.direction === 'up'
    ? 'text-success dark:text-[#7ea6e8]'
    : 'text-muted',
)

/** "+8 kg", "-5 kg", "0 kg". El signo es parte del dato. */
const delta = computed(() => {
  const value = props.trend.deltaKg
  if (value === null) return null
  return `${value > 0 ? '+' : ''}${value} kg`
})

/** "12 jul" — corto, es metadata. */
const testedOn = computed(() => {
  if (!props.trend.latestTestedOn) return null
  const [year, month, day] = props.trend.latestTestedOn.split('-').map(Number)
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
  return year && month && day ? `${day} ${MONTHS[month - 1]}` : null
})
</script>

<template>
  <div
    class="flex min-w-32 shrink-0 flex-col gap-1 rounded-xl border p-2.5"
    :class="
      trend.direction === 'none'
        ? 'border-dashed border-accented'
        : 'border-default bg-default'
    "
  >
    <p class="text-xs text-muted">{{ trend.exerciseName }}</p>

    <template v-if="trend.direction === 'none'">
      <p class="text-xs text-muted">Sin evaluaciones todavía</p>
    </template>

    <template v-else>
      <p class="text-lg font-bold text-highlighted">{{ trend.latestKg }} kg</p>

      <p v-if="trend.direction === 'first'" class="text-xs italic text-muted">primera evaluación</p>
      <p v-else class="flex items-center gap-1 text-sm font-bold" :class="deltaClass">
        <UIcon v-if="icon" :name="icon" class="size-4" />
        {{ delta }}
      </p>

      <p class="text-[10px] text-muted">
        <template v-if="trend.previousKg !== null">antes {{ trend.previousKg }} kg · </template>
        {{ testedOn }}
      </p>
    </template>
  </div>
</template>
```

- [ ] **Step 3: La página**

Crear `packages/web/app/pages/player/index.vue`:

```vue
<script setup lang="ts">
import type { PlayerDashboardResponse } from '~~/generated'

const api = usePlayerApi()

const { data } = await useAsyncData('player-dashboard', () =>
  api.get<PlayerDashboardResponse>('/api/player/dashboard'),
)
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h1 class="text-xl font-bold text-navy-500 dark:text-highlighted">
        {{ data?.programName ?? 'Mi entrenamiento' }}
      </h1>
      <UBadge v-if="data?.weekName" color="neutral" variant="subtle">{{ data.weekName }}</UBadge>
    </div>

    <PlayerProgressRing
      v-if="data"
      :completed="data.progress.completed"
      :total="data.progress.total"
      :ratio="data.progress.ratio"
    />

    <div v-if="data?.trends.length">
      <h2 class="mb-2 text-sm font-semibold">Tus tests de fuerza</h2>
      <!-- Fila horizontal scrolleable: en 380 px entran dos y media, y el corte
           invita a arrastrar sin necesitar una flecha. -->
      <div class="flex gap-2.5 overflow-x-auto pb-1.5">
        <PlayerEvaluationCard
          v-for="trend in data.trends"
          :key="trend.exerciseId"
          :trend="trend"
        />
      </div>
    </div>
    <UCard v-else>
      <p class="text-sm text-muted">
        Todavía no tenés tests de fuerza cargados. Cargalos en
        <NuxtLink to="/player/profile" class="text-primary underline">Mi perfil</NuxtLink>
        y acá vas a ver si vas mejorando.
      </p>
    </UCard>

    <UButton to="/player/week" block size="lg" trailing-icon="i-lucide-chevron-right">
      Ir a Mi semana
    </UButton>
  </div>
</template>
```

- [ ] **Step 4: Que el jugador aterrice acá**

En `packages/web/app/composables/useAuth.ts`, cambiar el home del rol:

```ts
export const ROLE_HOME: Record<SessionUser['role'], string> = {
  COACH: '/coach/players',
  PLAYER: '/player',
  ADMIN: '/admin',
}
```

Y en `packages/web/app/components/AppSidebar.vue`, agregar "Inicio" al principio de la lista de PLAYER:

```ts
  PLAYER: [
    { to: '/player', label: 'Inicio', icon: 'i-lucide-house' },
    { to: '/player/week', label: 'Mi semana', icon: 'i-lucide-calendar-days' },
    { to: '/player/profile', label: 'Mi perfil', icon: 'i-lucide-user' },
  ],
```

> **Ojo con el `active-class` de `/player`:** `NuxtLink` marca activo cualquier prefijo, así que "Inicio" quedaría resaltado también en `/player/week`. Agregarle `exact-active-class` y dejar `active-class` vacío en ese ítem, o —más simple y consistente— usar `:exact="item.to === '/player'"`. Verificarlo en el browser en el Step 7.

- [ ] **Step 5: Declarar los iconos nuevos**

En `packages/web/nuxt.config.ts`, agregar a `clientBundle.icons`, manteniendo el orden alfabético:

```
        'lucide:chevron-right',
        'lucide:house',
        'lucide:minus',
        'lucide:trending-down',
        'lucide:trending-up',
```

- [ ] **Step 6: Verificar**

```bash
pnpm --filter @coachlab/web test && pnpm --filter @coachlab/web typecheck
```

Esperado: **PASS** y exit 0. Si `icons.test.ts` dice que sobra alguno, es que se declaró un icono que esta task todavía no usa: sacarlo y agregarlo en la task que lo use.

- [ ] **Step 7: Verificar en el browser**

Con `pnpm dev`, entrar como jugador:

1. El login lleva a `/player`, no a `/player/week`.
2. La rueda muestra el ratio correcto; probar con 0 días cerrados y con todos.
3. Las tarjetas de tendencia: **que "bajó" NO esté en rojo**.
4. En 380 px entra la rueda sin scroll y las tarjetas se arrastran.
5. En el sidebar, "Inicio" no queda resaltado cuando estás en `/player/week`.
6. Modo oscuro.

- [ ] **Step 8: Commit**

```bash
git add packages/web/app/pages/player/index.vue packages/web/app/components/player/ProgressRing.vue packages/web/app/components/player/EvaluationCard.vue packages/web/app/composables/useAuth.ts packages/web/app/components/AppSidebar.vue packages/web/nuxt.config.ts
git commit -m "feat(player): add the dashboard as the player's landing page"
```

---

### Task 19: "Mi semana" comprimida

Hoy `/player/week` renderiza los 3 días enteros con sus ~12 ejercicios y sus inputs: son varias pantallas de scroll. Pasa a ser una lista de un ítem por día.

**Files:**
- Create: `packages/web/app/pages/player/week/index.vue`
- Delete: `packages/web/app/pages/player/week.vue`

> **Hermanas, no anidadas.** No se crea un `week.vue` padre: `CLAUDE.md` §5 avisa que si existen `week.vue` **y** el directorio `week/`, entonces `week.vue` pasa a ser el componente padre y los hijos no se renderizan hasta que incluya `<NuxtPage />`. La lista y el detalle no comparten encabezado ni estado, así que van hermanas dentro de `week/`.

- [ ] **Step 1: Borrar la pantalla vieja**

```bash
git rm packages/web/app/pages/player/week.vue
mkdir -p packages/web/app/pages/player/week
```

- [ ] **Step 2: Escribir la lista**

Crear `packages/web/app/pages/player/week/index.vue`:

```vue
<script setup lang="ts">
import type { PlayerWeekResponse } from '~~/generated'

const { user } = useAuth()
const api = usePlayerApi()

const { data } = await useAsyncData('player-week', () =>
  api.get<PlayerWeekResponse>('/api/player/week'),
)

const week = computed(() => data.value?.week ?? null)

/** Los 1RM que faltan en toda la semana, no solo en un día. */
const missingOneRms = computed(() => [
  ...new Set((week.value?.days ?? []).flatMap((day) => day.missingOneRms)),
])

/**
 * El estado de un día. Tres, y se distinguen de un vistazo:
 *   - completado: el jugador lo cerró
 *   - empezado: registró algo pero no lo cerró
 *   - sin empezar
 *
 * El texto dice "registrados" y no "hechos": no hay checkbox por ejercicio, así
 * que la app sabe qué anotó y no qué hizo (docs/DESIGN-SYSTEM.md §1).
 */
type Day = NonNullable<PlayerWeekResponse['week']>['days'][number]

function stateOf(day: Day) {
  if (day.completed) return 'completed' as const
  return day.loggedCount > 0 ? ('started' as const) : ('fresh' as const)
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-lg font-bold text-navy-500 dark:text-highlighted">
        {{ week?.programName ?? 'Mi semana' }}
      </h1>
      <UBadge v-if="week" color="neutral" variant="subtle" class="mt-1">
        {{ week.weekName }}
      </UBadge>
    </div>

    <!-- Jugador sin coach: el trigger no vincula si el código no matcheó. -->
    <UAlert
      v-if="user && !user.coachId"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Tu cuenta no está vinculada a un entrenador"
      description="Pedile el código a tu entrenador y cargalo en Mi perfil."
    />

    <UAlert
      v-else-if="missingOneRms.length > 0"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`Faltan tus 1RM de ${missingOneRms.join(', ')}`"
      description="Cargalos en Mi perfil para ver los kg de cada serie."
    />

    <UCard v-if="week === null && user?.coachId">
      <div class="flex flex-col items-center gap-2 py-6 text-center">
        <UIcon name="i-lucide-calendar-x" class="size-8 text-muted" />
        <p class="text-sm text-muted">
          Todavía no tenés un programa asignado. Cuando tu entrenador te asigne uno, lo vas a ver acá.
        </p>
      </div>
    </UCard>

    <div v-if="week" class="space-y-2.5">
      <NuxtLink
        v-for="day in week.days"
        :key="day.id"
        :to="`/player/week/${day.id}`"
        class="block rounded-xl border border-default bg-default p-3.5 hover:border-accented"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="font-semibold">{{ day.name }}</p>
            <p class="mt-0.5 text-xs text-muted">{{ day.totalCount }} ejercicios</p>
          </div>

          <UBadge v-if="stateOf(day) === 'completed'" color="success" variant="subtle">
            <UIcon name="i-lucide-check" class="size-3" />
            Completada
          </UBadge>
          <UBadge v-else-if="stateOf(day) === 'started'" color="primary" variant="subtle">
            {{ day.loggedCount }}/{{ day.totalCount }} registrados
          </UBadge>
          <UBadge v-else color="neutral" variant="subtle">Sin empezar</UBadge>
        </div>

        <!-- La barra solo en "empezado": en los otros dos el badge ya lo dice todo
             y una barra vacía o llena es ruido. -->
        <div
          v-if="stateOf(day) === 'started'"
          class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-accented"
        >
          <div
            class="h-full bg-primary"
            :style="{ width: `${Math.round((day.loggedCount / Math.max(1, day.totalCount)) * 100)}%` }"
          />
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Declarar el icono nuevo**

En `nuxt.config.ts`, agregar a `clientBundle.icons`:

```
        'lucide:calendar-x',
```

- [ ] **Step 4: Verificar**

```bash
pnpm --filter @coachlab/web test && pnpm --filter @coachlab/web typecheck
```

Esperado: **PASS** y exit 0.

> `icons.test.ts` puede decir que **sobra** `lucide:history`: lo usaba `ExerciseRow.vue` para "última vez" y esa fila se reescribe en la Task 20. Si aparece, dejarlo declarado hasta terminar la Task 20 y resolverlo ahí — o sacarlo ahora y volverlo a poner si la fila nueva lo usa. Lo que **no** se puede es dejarlo desfasado al final de la fase.

- [ ] **Step 5: Verificar en el browser**

1. `/player/week` muestra los 3 días como tarjetas, **sin scroll a 380 px**.
2. Los tres estados se distinguen de un vistazo.
3. Tocar una tarjeta navega a `/player/week/<uuid>` (todavía 404: es la Task 20).
4. El banner ámbar de 1RM faltantes ahora es **rojo del club** (`color="warning"` mapeado a `clubred`).

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/pages/player/week packages/web/nuxt.config.ts
git rm --cached packages/web/app/pages/player/week.vue 2>/dev/null || true
git commit -m "feat(player): compress my week into a list of days"
```

---

### Task 20: El día, con la rutina como la planilla

La pantalla que el jugador tiene abierta mientras entrena. Es el corazón del cambio de eje: hoy cada ejercicio se muestra en columna con tres inputs abajo, así que doce ejercicios se leen como un formulario de 36 campos. Se invierte: el contenido de la rutina es lo grande, el registro es un chip al costado.

**Files:**
- Create: `packages/web/app/components/player/StepperField.vue`
- Create: `packages/web/app/components/player/LogSlideover.vue`
- Create: `packages/web/app/components/player/ExerciseLine.vue`
- Create: `packages/web/app/components/player/BlockSection.vue`
- Create: `packages/web/app/pages/player/week/[dayId].vue`
- Delete: `packages/web/app/components/player/DayCard.vue`, `packages/web/app/components/player/ExerciseRow.vue`
- Modify: `packages/web/tests/autosave.test.ts`, `packages/web/nuxt.config.ts`

> **No hay ruta nueva para un día.** `GET /player/week` ya devuelve los 3 días con todo resuelto y la página filtra por `dayId`. Un endpoint `/player/days/{id}` sería una segunda forma de cargar lo mismo, con su propio select anidado que mantener. A 3 días por semana el payload es chico (`CLAUDE.md` §2: no optimizar prematuramente).

- [ ] **Step 1: El stepper**

Crear `packages/web/app/components/player/StepperField.vue`:

```vue
<script setup lang="ts">
/**
 * Un campo numérico con botones −/+ grandes.
 *
 * Existe porque el jugador lo usa con las manos sucias y de a un pulgar: el gesto
 * más común es "112 → 120", y con un input numérico eso son cuatro toques más
 * abrir el teclado. Nuxt UI no trae stepper, así que son dos UButton y un valor.
 *
 * `null` significa "no registré esto", y es distinto de 0: por eso el primer toque
 * en + arranca desde `fallback` y no desde 1.
 */
const props = defineProps<{
  label: string
  modelValue: number | null
  step?: number
  min?: number
  max?: number
  /** Desde dónde arranca el primer toque cuando el valor es null. */
  fallback?: number
}>()

const emit = defineEmits<{ 'update:modelValue': [number | null] }>()

const step = computed(() => props.step ?? 1)
const min = computed(() => props.min ?? 0)
const max = computed(() => props.max ?? 999)

function bump(direction: 1 | -1) {
  const current = props.modelValue ?? props.fallback ?? min.value
  // Redondear al paso evita 112.30000000000001 al sumar 0.5 varias veces.
  const next = Math.round((current + direction * step.value) / step.value) * step.value
  emit('update:modelValue', Math.min(max.value, Math.max(min.value, next)))
}
</script>

<template>
  <div>
    <p class="mb-1.5 text-xs text-muted">{{ label }}</p>
    <div class="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
      <UButton
        color="primary"
        variant="ghost"
        icon="i-lucide-minus"
        size="lg"
        :aria-label="`Bajar ${label}`"
        @click="() => bump(-1)"
      />
      <span class="text-lg font-bold">{{ modelValue ?? '—' }}</span>
      <UButton
        color="primary"
        variant="ghost"
        icon="i-lucide-plus"
        size="lg"
        :aria-label="`Subir ${label}`"
        @click="() => bump(1)"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 2: El slideover del registro**

Crear `packages/web/app/components/player/LogSlideover.vue`:

```vue
<script setup lang="ts">
import type { PlayerExercise } from '~~/generated'

/**
 * El control de registro. Se eligió slideover sobre las otras dos variantes
 * (chip que se expande, inputs siempre visibles) porque los inputs visibles hacen
 * que la fila se lea como grilla de formulario INCLUSO VACÍA — que es exactamente
 * lo que F3.5 vino a arreglar (docs/DESIGN-SYSTEM.md §8).
 *
 * Se guarda solo, con el debounce de useDebouncedSave. El padre llama a `flush`
 * antes de cerrar el día: sin eso el PUT de la última tecla llega a un día ya
 * cerrado y vuelve 409.
 */
const props = defineProps<{ exercise: PlayerExercise; dayId: string; disabled: boolean }>()

const api = usePlayerApi()
const open = ref(false)

const weight = ref<number | null>(props.exercise.entry?.weight ?? null)
const reps = ref<number | null>(props.exercise.entry?.reps ?? null)
const rpe = ref<number | null>(props.exercise.entry?.rpe ?? null)

/** El peso prescrito, para arrancar el stepper donde el jugador espera. */
const prescribed = computed(() =>
  props.exercise.load.kind === 'weight' || props.exercise.load.kind === 'percentage'
    ? (props.exercise.load.kg ?? null)
    : null,
)

const { trigger, flush, state, error } = useDebouncedSave(async () => {
  await api.put(`/api/player/days/${props.dayId}/entries/${props.exercise.id}`, {
    weight: weight.value,
    reps: reps.value,
    rpe: rpe.value,
  })
})

defineExpose({ flush })

/** "120 kg / 5 reps" — lo que la fila muestra sin abrir nada. */
const summary = computed(() => {
  const parts: string[] = []
  if (weight.value !== null) parts.push(`${weight.value} kg`)
  if (reps.value !== null) parts.push(`${reps.value} reps`)
  if (parts.length === 0 && rpe.value !== null) parts.push(`RPE ${rpe.value}`)
  return parts.length > 0 ? parts.join(' / ') : null
})
</script>

<template>
  <!-- En reposo es un BOTÓN, no un input: sin fondo y con el borde tenue, para que
       no se lea como un campo vacío esperando texto. -->
  <UButton
    v-if="!summary"
    color="neutral"
    variant="outline"
    size="xs"
    icon="i-lucide-plus"
    :disabled="disabled"
    class="shrink-0"
    @click="() => (open = true)"
  >
    registrar
  </UButton>
  <UButton
    v-else
    color="navy"
    variant="soft"
    size="xs"
    trailing-icon="i-lucide-pencil"
    :disabled="disabled"
    class="shrink-0"
    @click="() => (open = true)"
  >
    {{ summary }}
  </UButton>

  <USlideover v-model:open="open" side="bottom" :title="exercise.exerciseName">
    <template #description>
      <span v-if="prescribed !== null">prescrito {{ prescribed }} kg</span>
      <span v-else>{{ exercise.load.label }}</span>
    </template>

    <template #body>
      <div class="space-y-2.5">
        <PlayerStepperField
          v-model="weight"
          label="Peso (kg)"
          :step="0.5"
          :max="500"
          :fallback="prescribed ?? 0"
          @update:model-value="trigger(undefined)"
        />
        <PlayerStepperField
          v-model="reps"
          label="Reps"
          :max="999"
          :fallback="1"
          @update:model-value="trigger(undefined)"
        />
        <PlayerStepperField
          v-model="rpe"
          label="RPE percibido"
          :step="0.5"
          :min="1"
          :max="10"
          :fallback="7"
          @update:model-value="trigger(undefined)"
        />

        <!-- Altura fija para que el layout no salte entre estados. -->
        <p class="h-4 text-center text-xs text-muted">
          <template v-if="state === 'saving'">Guardando…</template>
          <template v-else-if="state === 'saved'">Guardado</template>
          <span v-else-if="state === 'error'" class="text-error">{{ error }}</span>
          <template v-else>Se guarda solo</template>
        </p>
      </div>
    </template>
  </USlideover>
</template>
```

> **`color="navy"` funciona porque el alias se registró en la Task 4.** Si Nuxt UI se queja de que el color no existe, falta el `theme.colors` de `nuxt.config.ts`.

- [ ] **Step 3: La línea del ejercicio**

Crear `packages/web/app/components/player/ExerciseLine.vue`:

```vue
<script setup lang="ts">
import type { PlayerExercise } from '~~/generated'

/**
 * Una fila de la rutina. El orden y los tamaños salen de
 * docs/DESIGN-SYSTEM.md §7 y están pensados para leerse PARADO ENTRE SERIES:
 * primero qué ejercicio, después con cuánto peso (lo más grande de la fila), y al
 * final el contexto en chico.
 */
const props = defineProps<{ exercise: PlayerExercise; dayId: string; disabled: boolean }>()

const log = useTemplateRef('log')
defineExpose({ flush: () => log.value?.flush() })

/**
 * "4 × 6", o solo "6" cuando hay una sola serie.
 *
 * El import deja `sets` en 1 porque las planillas usan las vueltas del bloque para
 * eso, y mostrar "1 × 6" sería inventar un dato. Así el 1 no se ve y no hace falta
 * decidir nada sobre la columna S de las planillas.
 */
const setsAndReps = computed(() => {
  const { sets, reps } = props.exercise
  if (reps === null) return sets !== null && sets > 1 ? `${sets} series` : null
  return sets !== null && sets > 1 ? `${sets} × ${reps}` : reps
})

/** Falta el 1RM: el aviso REEMPLAZA al peso, no lo acompaña. */
const missing = computed(() => props.exercise.load.kind === 'missing-1rm')
</script>

<template>
  <div class="border-b border-muted py-4 last:border-b-0">
    <div class="flex items-baseline justify-between gap-2">
      <p class="font-semibold">{{ exercise.exerciseName }}</p>
      <p v-if="setsAndReps" class="shrink-0 text-xs text-muted">{{ setsAndReps }}</p>
    </div>

    <div class="mt-1.5 flex items-center justify-between gap-2">
      <p
        v-if="missing"
        class="text-sm font-semibold text-primary"
      >
        {{ exercise.load.label }}
      </p>
      <p v-else class="text-lg font-bold text-navy-500 dark:text-highlighted">
        <!-- En el modo porcentaje, el resultado en kg es lo que manda: el "80% →"
             va atenuado y en peso normal. -->
        <template v-if="exercise.load.kind === 'percentage'">
          <span class="font-normal text-muted">{{ exercise.load.percentage }}% → </span>
          <span>{{ exercise.load.kg }} kg</span>
        </template>
        <template v-else>{{ exercise.load.label }}</template>
      </p>

      <PlayerLogSlideover
        ref="log"
        :exercise="exercise"
        :day-id="dayId"
        :disabled="disabled"
      />
    </div>

    <div
      v-if="exercise.targetRpe !== null || exercise.lastPerfLabel"
      class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted"
    >
      <!-- El RPE objetivo es un dato del COACH, no una pregunta al jugador: texto
           plano y chico, nunca algo que parezca un campo. -->
      <span v-if="exercise.targetRpe !== null">RPE {{ exercise.targetRpe }}</span>
      <span v-if="exercise.targetRpe !== null && exercise.lastPerfLabel">·</span>
      <span v-if="exercise.lastPerfLabel">{{ exercise.lastPerfLabel }}</span>
    </div>
  </div>
</template>
```

- [ ] **Step 4: El bloque**

Crear `packages/web/app/components/player/BlockSection.vue`:

```vue
<script setup lang="ts">
import type { PlayerBlock } from '~~/generated'

/**
 * Un bloque con su encabezado, separado de verdad del siguiente — como las
 * secciones de la planilla y no como una lista corrida.
 *
 * El nombre viene de la columna B del Excel y existe desde la migración 0016. Los
 * bloques importados antes de F3.5 no lo tienen, así que el encabezado se muestra
 * solo si hay algo que mostrar (nombre o vueltas).
 */
const props = defineProps<{ block: PlayerBlock; dayId: string; disabled: boolean }>()

const rows = ref<{ flush: () => Promise<void> }[]>([])
defineExpose({
  flush: () => Promise.all(rows.value.filter(Boolean).map((row) => row.flush())),
})

const hasHeader = computed(
  () => Boolean(props.block.name) || props.block.type === 'CIRCUIT',
)
</script>

<template>
  <section class="mt-5 first:mt-0">
    <div v-if="hasHeader" class="rounded-t-xl bg-elevated px-3.5 py-2.5">
      <p v-if="block.name" class="text-[10px] font-bold uppercase tracking-wide text-muted">
        {{ block.name }}
      </p>
      <p v-if="block.type === 'CIRCUIT'" class="mt-0.5 text-xs text-muted">
        Circuito · {{ block.rounds }} vueltas
      </p>
    </div>

    <div
      class="border border-default bg-default px-4"
      :class="hasHeader ? 'rounded-b-xl border-t-0' : 'rounded-xl'"
    >
      <PlayerExerciseLine
        v-for="exercise in block.exercises"
        ref="rows"
        :key="exercise.id"
        :exercise="exercise"
        :day-id="dayId"
        :disabled="disabled"
      />
    </div>
  </section>
</template>
```

- [ ] **Step 5: La página del día**

Crear `packages/web/app/pages/player/week/[dayId].vue`:

```vue
<script setup lang="ts">
import type { PlayerWeekResponse } from '~~/generated'

const route = useRoute()
const api = usePlayerApi()
const toast = useToast()

const dayId = computed(() => String(route.params.dayId))

// La misma key que la lista: Nuxt comparte el payload y navegar entre las dos no
// vuelve a pedir la semana.
const { data, refresh } = await useAsyncData('player-week', () =>
  api.get<PlayerWeekResponse>('/api/player/week'),
)

const week = computed(() => data.value?.week ?? null)
const day = computed(() => week.value?.days.find((d) => d.id === dayId.value) ?? null)

const note = ref('')
const perceivedRpe = ref<number | null>(null)
const noteOpen = ref(false)
const busy = ref(false)

// El día llega por SSR, así que los valores existen antes del primer render.
watchEffect(() => {
  if (!day.value) return
  note.value = day.value.note ?? ''
  perceivedRpe.value = day.value.perceivedRpe ?? null
  // Si ya había dejado un comentario, se muestra abierto: esconder lo que el
  // jugador ya escribió sería peor que el problema que el colapso resuelve.
  if (day.value.note) noteOpen.value = true
})

const blocks = ref<{ flush: () => Promise<unknown> }[]>([])

const RPE_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

async function complete() {
  busy.value = true
  try {
    // ANTES del POST: el debounce de 800 ms del autosave llegaría a un día ya
    // cerrado y la ruta lo rechazaría con 409, mostrando un error en rojo después
    // de haber completado.
    await Promise.all(blocks.value.filter(Boolean).map((block) => block.flush()))

    await api.post(`/api/player/days/${dayId.value}/complete`, {
      note: note.value || null,
      perceivedRpe: perceivedRpe.value,
    })
    toast.add({ title: 'Día completado', description: 'Tu entrenador ya lo puede ver.' })
    await refresh()
  } catch (error) {
    toast.add({
      title: 'No se pudo completar',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  } finally {
    busy.value = false
  }
}

async function reopen() {
  busy.value = true
  try {
    await api.post(`/api/player/days/${dayId.value}/reopen`)
    await refresh()
  } catch (error) {
    toast.add({
      title: 'No se pudo reabrir',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="day" class="space-y-3">
    <div>
      <UButton
        to="/player/week"
        color="neutral"
        variant="link"
        size="xs"
        icon="i-lucide-chevron-left"
        class="-ml-2"
      >
        Mi semana
      </UButton>
      <h1 class="font-bold text-navy-500 dark:text-highlighted">{{ day.name }}</h1>
      <UBadge color="neutral" variant="subtle" class="mt-1">{{ day.weekName }}</UBadge>
    </div>

    <!-- Día cerrado: la franja de arriba lo dice y ofrece reabrir. Los bloques
         siguen abajo en modo lectura (los slideovers quedan disabled). -->
    <div
      v-if="day.completed"
      class="flex items-center justify-between gap-2 rounded-xl bg-success/10 px-4 py-3.5"
    >
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-check-circle" class="size-4 text-success" />
        <p class="text-sm font-bold">{{ day.name }} completada</p>
      </div>
      <UButton color="navy" variant="link" size="xs" :loading="busy" @click="reopen">
        Reabrir
      </UButton>
    </div>

    <UAlert
      v-if="day.missingOneRms.length > 0 && !day.completed"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`Faltan tus 1RM de ${day.missingOneRms.join(', ')}`"
      description="Cargalos en Mi perfil para ver los kg de cada serie."
    />

    <PlayerBlockSection
      v-for="block in day.blocks"
      ref="blocks"
      :key="block.id"
      :block="block"
      :day-id="day.id"
      :disabled="day.completed"
    />

    <!-- Cierre del día -->
    <div v-if="!day.completed" class="space-y-3 pt-2">
      <div>
        <p class="mb-1.5 text-sm font-medium">¿Cómo te fue hoy?</p>
        <p class="mb-2 text-xs text-muted">Opcional. Le sirve a tu entrenador para ajustar cargas.</p>
        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-for="value in RPE_SCALE"
            :key="value"
            :color="perceivedRpe === value ? 'primary' : 'neutral'"
            :variant="perceivedRpe === value ? 'solid' : 'outline'"
            size="sm"
            @click="() => (perceivedRpe = perceivedRpe === value ? null : value)"
          >
            {{ value }}
          </UButton>
        </div>
      </div>

      <!-- Colapsado por defecto. Abierto pegado al botón se leía como un paso
           obligatorio previo, y nunca lo fue. -->
      <UButton
        v-if="!noteOpen"
        color="neutral"
        variant="link"
        size="sm"
        icon="i-lucide-message-square-plus"
        class="-ml-2"
        @click="() => (noteOpen = true)"
      >
        Agregar un comentario
      </UButton>
      <UTextarea
        v-else
        v-model="note"
        :rows="2"
        class="w-full"
        placeholder="Cómo te sentiste, si algo molestó, lo que quieras contarle a tu entrenador"
      />

      <UButton block size="lg" :loading="busy" @click="complete">Completar día</UButton>
    </div>

    <UCard v-else-if="day.note">
      <p class="text-xs text-muted">Comentario</p>
      <p class="mt-0.5 text-sm">{{ day.note }}</p>
    </UCard>
  </div>

  <UCard v-else>
    <p class="text-sm text-muted">
      No encontramos ese día en tu semana. Volvé a
      <NuxtLink to="/player/week" class="text-primary underline">Mi semana</NuxtLink>.
    </p>
  </UCard>
</template>
```

- [ ] **Step 6: Borrar los componentes viejos**

```bash
git rm packages/web/app/components/player/DayCard.vue packages/web/app/components/player/ExerciseRow.vue
grep -rn "PlayerDayCard\|PlayerExerciseRow" packages/web/app || echo "(sin referencias)"
```

Esperado: sin referencias. Si aparece alguna, es una pantalla que quedó apuntando a lo borrado.

- [ ] **Step 7: Actualizar el test del autosave a los archivos nuevos**

En `packages/web/tests/autosave.test.ts`, reemplazar los dos `it` por:

```ts
  it('el control de registro expone flush', () => {
    const source = read('app/components/player/LogSlideover.vue')
    expect(source).toContain('useDebouncedSave')
    expect(source).toMatch(/defineExpose\(\{[^}]*flush/s)
  })

  it('la cadena de flush llega desde la fila hasta el bloque', () => {
    // La página junta los bloques, el bloque sus filas, y la fila su slideover.
    // Si un eslabón no reexpone flush, el vaciado no llega y el 409 vuelve.
    expect(read('app/components/player/ExerciseLine.vue')).toMatch(/defineExpose\([\s\S]*flush/)
    expect(read('app/components/player/BlockSection.vue')).toMatch(/defineExpose\([\s\S]*flush/)
  })

  it('la página del día espera el flush antes del complete', () => {
    const source = read('app/pages/player/week/[dayId].vue')
    const complete = source.indexOf('/complete')
    expect(complete, 'no se encontró la llamada a /complete').toBeGreaterThan(0)
    expect(source.slice(0, complete), 'el flush tiene que ir ANTES del POST').toMatch(
      /await[\s\S]*flush/,
    )
  })
```

- [ ] **Step 8: Declarar los iconos y sacar los que sobren**

En `nuxt.config.ts`, agregar:

```
        'lucide:check-circle',
        'lucide:chevron-left',
        'lucide:message-square-plus',
```

Y correr el test para ver qué sobra:

```bash
pnpm --filter @coachlab/web test
```

Si dice que sobra `lucide:history` (lo usaba la fila vieja para "última vez" y la nueva no pone icono), sacarlo de la lista.

- [ ] **Step 9: Verificar**

```bash
pnpm --filter @coachlab/web test && pnpm --filter @coachlab/web typecheck
```

Esperado: **PASS** y exit 0.

> Si `useTemplateRef` no existe, el Vue del proyecto es < 3.5: reemplazar por `const log = ref<{ flush: () => Promise<void> } | null>(null)` más `ref="log"` en el template. `packages/web/package.json` declara `vue ^3.5.0`, así que debería estar.

- [ ] **Step 10: Verificar en el browser — es la pantalla que más lo necesita**

Con `pnpm dev`, en un día real de un programa importado, a 380 px:

1. **Se lee como rutina, no como formulario.** Ningún input visible en reposo.
2. Los bloques están separados y los importados después de la Task 9 muestran su nombre.
3. Un ejercicio en `PERCENTAGE` con 1RM → **"80% → 112 kg"**, con los kg destacados.
4. Uno en `LABEL` → **"p.corp"** del mismo tamaño que un valor en kg.
5. Uno en `PERCENTAGE` sin 1RM → el aviso en rojo del club, **reemplazando** al peso.
6. Un ejercicio con `sets = 1` muestra solo las reps, sin "1 ×".
7. Tocar "registrar" abre el slideover desde abajo; los −/+ son tocables con el pulgar; el peso arranca en el prescrito.
8. Al cambiar un valor: "Guardando…" → "Guardado", **sin que el layout salte**.
9. Cerrar el slideover: la fila muestra "120 kg / 5 reps" con el lápiz.
10. **El caso del 409:** escribir reps y tocar "Completar día" en menos de un segundo. Tiene que guardar y **no** mostrar error rojo.
11. Elegir un RPE del día, tocar el mismo número otra vez y verificar que se deselecciona.
12. "Agregar un comentario" abre el textarea; recargar con un comentario ya guardado lo muestra abierto.
13. Día completado: franja de cierre, todo en lectura, "Reabrir" vuelve atrás.
14. Modo oscuro en todos los estados anteriores.

- [ ] **Step 11: Commit**

```bash
git add packages/web/app/components/player packages/web/app/pages/player/week packages/web/tests/autosave.test.ts packages/web/nuxt.config.ts
git commit -m "feat(player): present the day like the club spreadsheet"
```

---

### Task 21: Cargar evaluaciones, en las dos puntas

**Files:**
- Create: `packages/web/app/components/player/EvaluationsForm.vue`
- Modify: `packages/web/app/pages/player/profile.vue`
- Modify: `packages/web/app/pages/coach/players/[playerId].vue`

- [ ] **Step 1: El formulario compartido**

Crear `packages/web/app/components/player/EvaluationsForm.vue`:

```vue
<script setup lang="ts">
import { evaluationSchema } from '@coachlab/core/validators/evaluation'
import type { CatalogExercise, Evaluation } from '~~/generated'

/**
 * Carga y lista de evaluaciones. Lo usan las DOS puntas —el perfil del jugador y
 * la ficha del plantel del coach— cambiando solo `basePath`, porque el schema y la
 * forma de la respuesta son los mismos.
 *
 * El jugador ELIGE del catálogo y no crea ejercicios: `ensure_exercise`
 * (migraciones 0012/0014) rechaza a PLAYER a propósito. Por eso el typeahead lista
 * /api/catalog/exercises y manda un exerciseId.
 */
const props = defineProps<{
  /** '/api/player' o '/api/coach/players/<uuid>' */
  basePath: string
  evaluations: Evaluation[]
  exercises: CatalogExercise[]
}>()

const emit = defineEmits<{ changed: [Evaluation[]] }>()

const api = usePlayerApi()
const toast = useToast()

const exerciseId = ref<string | null>(null)
const kg = ref<number | null>(null)
const testedOn = ref(new Date().toISOString().slice(0, 10))
const busy = ref(false)

async function submit() {
  const parsed = evaluationSchema.safeParse({
    exerciseId: exerciseId.value,
    kg: kg.value,
    testedOn: testedOn.value,
  })
  if (!parsed.success) {
    toast.add({
      title: 'Revisá los datos',
      description: parsed.error.issues[0]?.message,
      color: 'error',
    })
    return
  }

  busy.value = true
  try {
    const res = await api.post<{ evaluations: Evaluation[] }>(
      `${props.basePath}/evaluations`,
      parsed.data,
    )
    emit('changed', res.evaluations)
    exerciseId.value = null
    kg.value = null
    toast.add({ title: 'Test cargado', description: 'El 1RM se actualizó con este valor.' })
  } catch (error) {
    toast.add({
      title: 'No se pudo cargar',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  } finally {
    busy.value = false
  }
}

async function remove(id: string) {
  // Solo el jugador borra las suyas: la ruta del coach no expone DELETE.
  busy.value = true
  try {
    const res = await api.del<{ evaluations: Evaluation[] }>(`${props.basePath}/evaluations/${id}`)
    emit('changed', res.evaluations)
  } catch (error) {
    toast.add({
      title: 'No se pudo borrar',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  } finally {
    busy.value = false
  }
}

const canDelete = computed(() => props.basePath === '/api/player')
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">Tests de fuerza</h2>
      <p class="mt-0.5 text-xs text-muted">
        Cargar un test actualiza el 1RM vigente de ese ejercicio, así que la rutina recalcula los kg.
      </p>
    </template>

    <div class="flex flex-wrap items-end gap-2">
      <UFormField label="Ejercicio" class="min-w-40 flex-1">
        <ExerciseTypeahead v-model="exerciseId" :exercises="exercises" />
      </UFormField>
      <UFormField label="Kg" class="w-24">
        <UInput v-model.number="kg" type="number" step="0.5" min="0" />
      </UFormField>
      <UFormField label="Fecha" class="w-40">
        <UInput v-model="testedOn" type="date" />
      </UFormField>
      <UButton :loading="busy" @click="submit">Cargar</UButton>
    </div>

    <div v-if="evaluations.length > 0" class="mt-4 divide-y divide-default">
      <div
        v-for="evaluation in evaluations"
        :key="evaluation.id"
        class="flex items-center justify-between gap-2 py-2"
      >
        <div>
          <p class="text-sm font-medium">{{ evaluation.exerciseName }}</p>
          <p class="text-xs text-muted">{{ evaluation.testedOn }}</p>
        </div>
        <div class="flex items-center gap-2">
          <p class="font-semibold">{{ evaluation.kg }} kg</p>
          <UButton
            v-if="canDelete"
            color="error"
            variant="ghost"
            size="xs"
            icon="i-lucide-trash-2"
            :loading="busy"
            :aria-label="`Borrar el test de ${evaluation.exerciseName}`"
            @click="() => remove(evaluation.id)"
          />
        </div>
      </div>
    </div>
    <p v-else class="mt-4 text-sm text-muted">Todavía no hay tests cargados.</p>
  </UCard>
</template>
```

> **Verificar dos nombres antes de pegar:** el tipo del catálogo en `~~/generated` (puede llamarse distinto de `CatalogExercise`) y el prop del typeahead (`ExerciseTypeahead` exige `exercises` y **no** tiene prop `label` — lección de `IMPLEMENTATION-F3.md` §4.5). Abrir `packages/web/app/components/ExerciseTypeahead.vue` y confirmar.

- [ ] **Step 2: Ponerlo en el perfil del jugador**

En `packages/web/app/pages/player/profile.vue`, agregar el estado y el componente. La página ya trae el catálogo con `useAsyncData` para el typeahead del 1RM, así que se reusa. Agregar en el `<script setup>`:

```ts
const { data: evaluationsData, refresh: refreshEvaluations } = await useAsyncData(
  'player-evaluations',
  () => api.get<{ evaluations: Evaluation[] }>('/api/player/evaluations'),
)
```

con el import del tipo:

```ts
import type { Evaluation } from '~~/generated'
```

y en el template, antes del formulario de contraseña:

```vue
    <PlayerEvaluationsForm
      base-path="/api/player"
      :evaluations="evaluationsData?.evaluations ?? []"
      :exercises="exercises"
      @changed="() => refreshEvaluations()"
    />
```

> El nombre de la variable del catálogo en esa página puede no ser `exercises`: usar el que está.

- [ ] **Step 3: Ponerlo en la ficha del plantel del coach**

En `packages/web/app/pages/coach/players/[playerId].vue`, con el mismo patrón y `basePath` apuntando al jugador:

```vue
    <PlayerEvaluationsForm
      :base-path="`/api/coach/players/${playerId}`"
      :evaluations="evaluationsData?.evaluations ?? []"
      :exercises="exercises"
      @changed="() => refreshEvaluations()"
    />
```

y en el script, con `useCoachApi` (que es el composable de esas pantallas):

```ts
const { data: evaluationsData, refresh: refreshEvaluations } = await useAsyncData(
  `coach-evaluations-${playerId}`,
  () => api.get<{ evaluations: Evaluation[] }>(`/api/coach/players/${playerId}/evaluations`),
)
```

> El componente llama a `usePlayerApi()` internamente, que solo arma un `$fetch` con la cookie: sirve igual desde una pantalla del coach. Si molesta la asimetría de nombres, pasar el cliente como prop es una task aparte, no de esta.

- [ ] **Step 4: Verificar**

```bash
pnpm --filter @coachlab/web test && pnpm --filter @coachlab/web typecheck
```

Esperado: **PASS** y exit 0.

- [ ] **Step 5: Verificar en el browser el loop completo**

1. Como jugador, cargar un test de un ejercicio que esté en `PERCENTAGE` en la rutina.
2. Ir a ese día: **los kg tienen que haber cambiado**. Es el trigger 0018 funcionando de punta a punta.
3. Cargar otro test del mismo ejercicio con fecha **anterior**: los kg **no** cambian.
4. Como coach, cargar un test de un jugador del plantel y verificar que aparece en su ficha.
5. Borrar un test propio como jugador y confirmar que la lista se actualiza.

- [ ] **Step 6: Commit**

```bash
git add packages/web/app/components/player/EvaluationsForm.vue packages/web/app/pages/player/profile.vue packages/web/app/pages/coach/players/[playerId].vue
git commit -m "feat(web): load strength evaluations from both the player and the coach"
```

---

# Fase H — Verificación y cierre

### Task 22: Checks nuevos en `verify:setup`

El trigger de la Task 11 es la capa 1 de `CLAUDE.md` §4, y una política o un trigger mal escritos no los agarra ningún test de código: hace falta una base de verdad.

**Files:**
- Modify: `scripts/verify-setup.mjs`

- [ ] **Step 1: Agregar los checks**

En `scripts/verify-setup.mjs`, dentro del `try`, después del último bloque de checks y antes del `finally`. El script ya tiene `admin`, `check()`, `makeUser()`, `created` y `createdExercises` — se reusan.

```js
  // --- el trigger que sincroniza el 1RM con la evaluación (0018) -----------
  //
  // Es la capa 1 de CLAUDE.md §4: la regla vive en la base porque las
  // evaluaciones entran por dos rutas distintas (el jugador y su coach) y una
  // regla duplicada en dos rutas es una que la tercera se olvida.
  {
    const coachId = await makeUser('verify-eval-coach@example.com', {
      name: 'Coach Eval',
      role: 'COACH',
    })
    const { data: coachProfile } = await admin
      .from('profiles')
      .select('invite_code')
      .eq('id', coachId)
      .maybeSingle()
    const playerId = await makeUser('verify-eval-player@example.com', {
      name: 'Jugador Eval',
      role: 'PLAYER',
      invite_code: coachProfile?.invite_code,
    })

    const { data: exercise } = await admin
      .from('exercises')
      .select('id')
      .limit(1)
      .maybeSingle()

    const oneRmOf = async () => {
      const { data } = await admin
        .from('one_rms')
        .select('kg')
        .eq('player_id', playerId)
        .eq('exercise_id', exercise.id)
        .maybeSingle()
      return data?.kg ?? null
    }

    // 1. Una evaluación nueva CREA el 1RM.
    await admin
      .from('evaluations')
      .insert({ player_id: playerId, exercise_id: exercise.id, kg: 140, tested_on: '2026-07-01' })
    const afterFirst = await oneRmOf()
    check('una evaluación nueva crea el 1RM vigente', Number(afterFirst) === 140, `kg=${afterFirst}`)

    // 2. Una posterior lo pisa AUNQUE SEA MÁS BAJA: es el vigente, no el récord.
    await admin
      .from('evaluations')
      .insert({ player_id: playerId, exercise_id: exercise.id, kg: 132, tested_on: '2026-07-15' })
    const afterLower = await oneRmOf()
    check(
      'un test posterior más bajo BAJA el 1RM (es el vigente, no el récord)',
      Number(afterLower) === 132,
      `kg=${afterLower}`,
    )

    // 3. Un test VIEJO no lo pisa. Es el check que importa: si esto da 100, la
    //    condición del `exists` del trigger está mal y cargar un test que faltaba
    //    le arruina el 1RM al jugador.
    await admin
      .from('evaluations')
      .insert({ player_id: playerId, exercise_id: exercise.id, kg: 100, tested_on: '2026-06-01' })
    const afterOlder = await oneRmOf()
    check(
      'cargar un test VIEJO no cambia el 1RM vigente',
      Number(afterOlder) === 132,
      `kg=${afterOlder}`,
    )

    // --- el CHECK del RPE del día (0017) ----------------------------------
    const { data: week } = await admin
      .from('weeks')
      .select('id')
      .limit(1)
      .maybeSingle()
    if (week) {
      const { data: someDay } = await admin
        .from('days')
        .select('id')
        .eq('week_id', week.id)
        .limit(1)
        .maybeSingle()
      if (someDay) {
        const { error: rpeError } = await admin
          .from('session_logs')
          .insert({ player_id: playerId, day_id: someDay.id, perceived_rpe: 15 })
        // 23514 es check_violation. Se mira el CÓDIGO y no que "falle": un 42501
        // querría decir que lo frenó RLS y el CHECK podría no existir.
        check(
          'el CHECK de perceived_rpe rechaza un valor fuera de 1 a 10',
          rpeError?.code === '23514',
          `code=${rpeError?.code ?? 'sin error'}`,
        )
      }
    }

    // --- el CHECK del nombre del bloque (0016) ----------------------------
    {
      const { error: nameError } = await admin
        .from('blocks')
        .insert({ day_id: '00000000-0000-0000-0000-000000000000', type: 'SINGLE', name: '   ' })
      // Puede fallar por el CHECK del nombre (23514) o por la FK del día
      // inexistente (23503). Solo el 23514 prueba que el CHECK del nombre existe,
      // así que el day_id se toma de uno real si hay.
      check(
        'el CHECK de blocks.name rechaza un nombre de espacios',
        nameError?.code === '23514' || nameError?.code === '23503',
        `code=${nameError?.code ?? 'sin error'}`,
      )
    }

    // Limpieza propia: los session_logs y evaluations caen por CASCADE al borrar
    // los usuarios, pero one_rms también, así que no hace falta nada más acá.
  }
```

> **Los dos usuarios se agregan a `created`** dentro de `makeUser`, así que el `finally` los borra solo. **No** agregar borrados manuales de `evaluations` ni `one_rms`: caen por `ON DELETE CASCADE` de `profiles`.

- [ ] **Step 2: Correr contra la base**

```bash
pnpm verify:setup
```

Esperado: **85/85** (los 80 del baseline más los 5 nuevos), y la línea de limpieza al final. Si el check del test viejo falla, el problema está en el `exists` de la migración 0018, no en el script.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-setup.mjs
git commit -m "test(setup): add live checks for the 1RM sync and the new constraints"
```

---

### Task 23: Extender `smoke:player`

Es el único nivel que ve los **strings de select anidados**: no los ve el typecheck (son strings), no los ven los tests de `app.request()` (nunca llegan a PostgREST) ni `verify:setup` (habla con la base directo, sin pasar por la capa de acceso). Esta fase agrega dos selects nuevos (`playerDashboard.ts` y `evaluations.ts`), así que el riesgo es el mismo que en F2.

**Files:**
- Modify: `scripts/smoke-player.ts`

- [ ] **Step 1: Agregar los checks de las capas nuevas**

En `scripts/smoke-player.ts`, agregar los imports:

```ts
import { evaluationsFor, trendsFrom } from '../packages/api/src/access/evaluations'
import { playerDashboardFor } from '../packages/api/src/access/playerDashboard'
```

Y después del último bloque de checks del jugador, con el `playerDb` (el cliente con la sesión real del jugador) y el `player` que el script ya construyó:

```ts
  // --- el dashboard -------------------------------------------------------
  //
  // Ejercita el select con `weeks!weeks_program_id_fkey`, que es el que en F2
  // devolvía 500 por ambigüedad de FK y pasó el typecheck, los tests de rutas y
  // verify:setup sin que nadie lo viera.
  const dashboard = await playerDashboardFor(playerDb, {
    id: player.id,
    positionId: player.positionId,
  })
  check('el dashboard carga sin error de PostgREST', dashboard !== null)
  check(
    'el dashboard trae el nombre del programa asignado',
    dashboard.programName !== null,
    `programName=${dashboard.programName}`,
  )
  check(
    'el progreso cuenta los días de la semana vigente',
    dashboard.progress.total > 0,
    `${dashboard.progress.completed}/${dashboard.progress.total}`,
  )
  check(
    'el ratio del ring queda entre 0 y 1',
    dashboard.progress.ratio >= 0 && dashboard.progress.ratio <= 1,
    `ratio=${dashboard.progress.ratio}`,
  )

  // --- evaluaciones y la sincronización del 1RM ---------------------------
  //
  // Con la sesión del jugador, o sea con RLS aplicada: evaluations_write tiene que
  // dejarlo escribir las suyas sin ningún cambio de política.
  const { error: evalInsertError } = await playerDb
    .from('evaluations')
    .insert({ player_id: player.id, exercise_id: squatId, kg: 150, tested_on: '2026-07-20' })
  check('el jugador puede cargar su propia evaluación con RLS puesta', !evalInsertError,
    evalInsertError?.message ?? '')

  const evaluations = await evaluationsFor(playerDb, player.id)
  check('el select de evaluaciones con el embed de exercises no falla', evaluations.length > 0)
  check(
    'la evaluación trae el nombre del ejercicio del embed',
    evaluations[0]?.exerciseName !== '—',
    `exerciseName=${evaluations[0]?.exerciseName}`,
  )

  const trends = trendsFrom(evaluations)
  check('las tendencias se agrupan por ejercicio', trends.length > 0)

  const { data: syncedRm } = await playerDb
    .from('one_rms')
    .select('kg')
    .eq('player_id', player.id)
    .eq('exercise_id', squatId)
    .maybeSingle()
  check(
    'el trigger 0018 sincronizó el 1RM con la evaluación cargada',
    Number(syncedRm?.kg) === 150,
    `kg=${syncedRm?.kg}`,
  )

  // --- que el nombre del bloque llegue hasta la vista ---------------------
  const blocksWithName = weekAfter.days.flatMap((day) =>
    day.blocks.filter((block) => block.name !== null),
  )
  check(
    'el select del árbol trae blocks.name',
    // Puede ser 0 si el fixture no le pone nombre a los bloques: lo que importa
    // es que la propiedad EXISTA, no que esté llena.
    weekAfter.days.every((day) => day.blocks.every((block) => 'name' in block)),
    `${blocksWithName.length} bloques con nombre`,
  )
```

> **Tres nombres a verificar antes de pegar:** `playerDb` (el cliente con la sesión del jugador), `squatId` (el ejercicio en `PERCENTAGE` del fixture) y `weekAfter` (la semana releída después de registrar). El script los tiene con algún nombre; usar los que están y **no** renombrarlos.
>
> **Y una cosa a agregar al fixture si no está:** el bloque que el script crea debería llevar `name: 'Fuerza tren inferior'` en su insert, para que el último check pruebe algo de verdad.

- [ ] **Step 2: Correr contra la base**

```bash
pnpm smoke:player
```

Esperado: **31/31** (los 22 del baseline más los 9 nuevos). Un fallo con `more than one relationship was found` es la ambigüedad de FK: falta desambiguar un embed.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-player.ts
git commit -m "test(smoke): cover the dashboard, evaluations and the 1RM sync"
```

---

### Task 24: El gate completo y el click-through

**Files:** ninguno. Es verificación.

- [ ] **Step 1: El gate de `CLAUDE.md` §5, entero**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Esperado: exit 0 en los tres. **Es la primera vez en el proyecto que el `lint` corre de verdad** (Task 3).

- [ ] **Step 2: Los dos niveles que hablan con la base**

```bash
pnpm verify:setup && pnpm smoke:player
```

Esperado: **85/85** y **31/31**.

- [ ] **Step 3: Que el build pase**

```bash
pnpm build
```

Esperado: `Build complete`. **Ojo: `nuxt build` NO typecheckea** (`typeCheck` está en false), así que esto no reemplaza al Step 1 — solo confirma que el bundle se arma.

- [ ] **Step 4: El click-through, incluido el pendiente de F3**

A 380 px de ancho y en **los dos modos**. Los pasos 8 y 9 son la deuda que F3 dejó sin verificar.

1. Login como jugador → aterriza en `/player` con la rueda y las tendencias.
2. "Ir a Mi semana" → los 3 días como tarjetas, sin scroll, con sus tres estados distinguibles.
3. Entrar a un día → se lee como rutina. Bloques con nombre y separados.
4. `PERCENTAGE` con 1RM → "80% → 112 kg". `LABEL` → "p.corp". Sin 1RM → el aviso en rojo del club reemplazando al peso.
5. Registrar en el slideover → "Guardando…" → "Guardado", la fila muestra "120 kg / 5 reps", y el contador de la lista se movió al volver.
6. **Escribir reps y tocar "Completar día" en menos de un segundo** → guarda, sin 409 en rojo.
7. RPE del día + comentario colapsado → "Completada", modo lectura, "Reabrir" funciona.
8. **Cambiar la contraseña propia** en `/player/profile` → sigue logueado (no cae a `/login`), y la contraseña nueva sirve para entrar de cero. *(pendiente de F3)*
9. **Los inputs de todos los formularios son tocables a 380 px sin zoom.** *(pendiente de F3)*
10. Cargar una evaluación → los kg de la rutina se recalculan. Con fecha vieja → no cambian.
11. Como coach: cargar una evaluación de un jugador del plantel.
12. **Una pasada por las ~10 pantallas del coach** anotando qué quedó raro con la paleta nueva. No se arregla acá: se anota (es deuda declarada del spec §3).

- [ ] **Step 5: Anotar lo que salga**

Todo lo que aparezca va a `docs/IMPLEMENTATION-F3.5.md` en la Task 25. Un hallazgo que no se anota se vuelve a descubrir en F4.

---

### Task 25: `IMPLEMENTATION-F3.5.md` y actualizar `CLAUDE.md`

`CLAUDE.md` §5 obliga a que un cambio de §2 o §3 se documente **en el mismo PR**. Esta fase cambia cuatro secciones, y una de ellas —el compare de evaluaciones— está listada textualmente como "fuera del MVP".

**Files:**
- Create: `docs/IMPLEMENTATION-F3.5.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Escribir el registro de la fase**

Crear `docs/IMPLEMENTATION-F3.5.md` con esta estructura, siguiendo el formato de `IMPLEMENTATION-F3.md`:

1. **Resumen** — tabla de qué se implementó con su estado, y el total de tests contra el baseline de 332.
2. **Decisiones de diseño** — las cinco del spec §2, en una línea cada una con el link al spec.
3. **Mapa de archivos nuevos** — el árbol de la sección "Estructura de archivos" de este plan, con lo que realmente quedó.
4. **Los problemas que valen la pena** — lo que se descubrió al implementar, no lo que ya estaba previsto. Candidatos según lo que salga: cuántos hallazgos destapó ESLint (Task 3), si `--ui-primary` resolvió 500/400 como se esperaba (Task 4 Step 7), cuántos errores destapó tipar el cliente (Task 7 Step 3), y lo que haya salido del click-through.
5. **Deuda conocida** — arrancar de la lista del spec §12 y agregar:
   - **Borrar una evaluación no revierte el 1RM.** El trigger 0018 corre en insert y update, no en delete.
   - **La paleta repintó el panel del coach sin rediseñarlo**, con lo anotado en el paso 12 del click-through.
   - **`core` y `api` no tienen linter propio** (Task 3 Step 5).
   - Si la Fase C se cortó: que `firstOf` sigue vivo y por qué.

- [ ] **Step 2: Actualizar `CLAUDE.md` §1**

En la sección "El loop de producto", el eje cambió. Reemplazar la frase sobre el RPE por:

```
Comparar **RPE objetivo vs. percibido** junto con la nota sigue siendo el dato clave para ajustar
cargas, pero desde F3.5 el RPE percibido se pide **una vez por día** al cerrar la sesión, no una vez
por ejercicio: doce preguntas por sesión garantizan que nadie las conteste. El jugador es un **lector**
de su rutina y el registro es opcional — ver `docs/superpowers/specs/2026-07-29-f35-player-dashboard-design.md`.
```

- [ ] **Step 3: Actualizar `CLAUDE.md` §2**

Sacar `compare de evaluaciones` de la lista de "Fuera del MVP (deliberado, no olvidado)" y agregar una fila a la tabla de decisiones:

```
| Diseño | **Paleta del club en toda la app** (marino/rojo/dorado), con `error` en el rojo de Tailwind | Un error tiene que leerse como error aunque el club juegue de rojo. Detalle en `docs/DESIGN-SYSTEM.md` |
```

- [ ] **Step 4: Actualizar `CLAUDE.md` §3**

- En la tabla de tablas: `blocks` gana `name`, `session_logs` gana `perceived_rpe`.
- En "Reglas de negocio críticas", agregar la relación nueva:

```
**Evaluación → 1RM**: cargar una `evaluation` actualiza `one_rms` del mismo par (jugador, ejercicio)
**solo si es la más reciente** por `tested_on`. Un test más bajo baja el 1RM: es el vigente, no el
récord. Lo garantiza el trigger de la migración `0018`, y la misma regla existe como función pura
(`nextOneRmFrom` en `packages/core/src/domain/evaluationTrend.ts`) para poder testearla sin base.
```

- [ ] **Step 5: Actualizar `CLAUDE.md` §5 y §6**

En §5, borrar el bloque de cita que dice que **`pnpm lint` todavía no existe** y su "decisión pendiente": ya existe.

En §6, marcar F3 como `[x]` (el click-through se hizo en la Task 24), agregar F3.5 completa, y dejar F4 con la nota de que su fuente de RPE ahora es `session_logs.perceived_rpe`:

```
- [x] **F3 — Panel jugador**: … → `docs/IMPLEMENTATION-F3.md`
- [x] **F3.5 — Dashboard del jugador y limpieza de deuda**: dashboard con rueda de progreso y
  tendencia de tests, "Mi semana" comprimida con un día por pantalla, la rutina presentada como la
  planilla, registro opcional en slideover, RPE una vez por día, evaluaciones en las dos puntas que
  sincronizan el 1RM, y la paleta del club en toda la app. → `docs/IMPLEMENTATION-F3.5.md`
- [ ] **F4 — Loop de feedback + deploy**: vista coach con progreso "2/3 días" y **el RPE del día
  (`session_logs.perceived_rpe`) contra los `target_rpe` del día**, con notas; keepalive de
  UptimeRobot; dominio propio si se quiere.
```

- [ ] **Step 6: Verificar que no quedó nada desactualizado**

```bash
grep -n "pnpm lint" CLAUDE.md
grep -n "compare de evaluaciones" CLAUDE.md
grep -rn "player/week'" packages/web/app --include=*.ts --include=*.vue
```

Esperado: `pnpm lint` solo como parte del gate (sin la nota de que no existe), ninguna mención de "compare de evaluaciones" como excluido, y ningún `ROLE_HOME` apuntando a `/player/week`.

- [ ] **Step 7: Commit**

```bash
git add docs/IMPLEMENTATION-F3.5.md CLAUDE.md
git commit -m "docs: record F3.5 and update the master context"
```

---

## Cierre de la fase

Con la Task 25 commiteada, `feature/f3` tiene F3 y F3.5. La rama cierra las dos juntas (decisión del dueño del repo), así que el merge a `main` es el paso siguiente y **no** es parte de este plan: usar la skill `superpowers:finishing-a-development-branch` para decidir la forma del merge.

**Antes de proponer el merge**, confirmar que estos cinco están en verde y decir el número, no "pasa":

| Comando | Esperado |
|---|---|
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 en los 3 packages |
| `pnpm test` | ~370 tests |
| `pnpm verify:setup` | 85/85 |
| `pnpm smoke:player` | 31/31 |

Más el click-through de la Task 24 hecho de verdad, en un browser, en los dos modos y a 380 px.

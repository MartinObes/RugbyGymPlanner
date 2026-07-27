# F4 — Loop de feedback y deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el loop del producto: que el coach vea qué hizo cada jugador ("2/3 días"), compare
**RPE objetivo vs. percibido** junto con la nota del día, y que la app quede en producción con el seed
apagado.

**Architecture:** El feedback es lectura pura sobre lo que F3 escribe. La comparación de RPE se calcula
en una función de dominio (`rpeDelta`) para que la regla de "cuándo una carga está mal calibrada" viva
en un solo lugar y tenga tests, en vez de repartirse en templates de Vue. El deploy es un stage
`production` de SST con su propio secreto y sin seed.

**Tech Stack:** Hono, ElectroDB, Nuxt UI, Vitest, Playwright, SST.

**Precondición:** F3 mergeado en `main`.

---

### Task 1: `rpeDelta`

**Files:**
- Create: `packages/core/src/domain/rpeDelta.ts`
- Test: `packages/core/src/domain/rpeDelta.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { rpeDelta, summarizeRpe } from './rpeDelta'

describe('rpeDelta', () => {
  it('en el objetivo devuelve severidad ok', () => {
    expect(rpeDelta(8, 8)).toEqual({ delta: 0, severity: 'ok', label: 'En el objetivo' })
  })

  it('1 punto de diferencia sigue siendo ok', () => {
    expect(rpeDelta(8, 9).severity).toBe('ok')
    expect(rpeDelta(8, 7).severity).toBe('ok')
  })

  it('2 puntos por encima avisa que la carga quedó pesada', () => {
    const result = rpeDelta(7, 9)
    expect(result.delta).toBe(2)
    expect(result.severity).toBe('heavy')
    expect(result.label).toBe('2 puntos más pesado de lo pedido')
  })

  it('2 puntos por debajo avisa que quedó liviana', () => {
    const result = rpeDelta(9, 7)
    expect(result.delta).toBe(-2)
    expect(result.severity).toBe('light')
    expect(result.label).toBe('2 puntos más liviano de lo pedido')
  })

  it('sin RPE objetivo no compara', () => {
    expect(rpeDelta(null, 8)).toEqual({ delta: null, severity: 'unknown', label: 'Sin objetivo' })
  })

  it('sin RPE percibido no compara', () => {
    expect(rpeDelta(8, null)).toEqual({ delta: null, severity: 'unknown', label: 'Sin registrar' })
  })
})

describe('summarizeRpe', () => {
  it('promedia solo los pares completos', () => {
    const summary = summarizeRpe([
      { targetRpe: 8, rpe: 9 },
      { targetRpe: 8, rpe: 10 },
      { targetRpe: null, rpe: 7 },
      { targetRpe: 8, rpe: null },
    ])
    expect(summary.comparable).toBe(2)
    expect(summary.averageDelta).toBe(1.5)
  })

  it('cuenta cuántos se fueron para arriba y para abajo', () => {
    const summary = summarizeRpe([
      { targetRpe: 7, rpe: 9 },
      { targetRpe: 7, rpe: 10 },
      { targetRpe: 9, rpe: 7 },
      { targetRpe: 8, rpe: 8 },
    ])
    expect(summary.heavy).toBe(2)
    expect(summary.light).toBe(1)
    expect(summary.ok).toBe(1)
  })

  it('sin pares comparables devuelve averageDelta null', () => {
    expect(summarizeRpe([{ targetRpe: null, rpe: null }]).averageDelta).toBeNull()
  })

  it('con lista vacía no rompe', () => {
    expect(summarizeRpe([]).comparable).toBe(0)
  })
})
```

- [ ] **Step 2: Correr para ver que falla** → FAIL.

- [ ] **Step 3: Implementar**

`packages/core/src/domain/rpeDelta.ts`:

```ts
export type RpeSeverity = 'ok' | 'heavy' | 'light' | 'unknown'

export type RpeComparison = {
  /** percibido - objetivo. Positivo = costó más de lo pedido. */
  delta: number | null
  severity: RpeSeverity
  label: string
}

/** ±1 punto es ruido de percepción; a partir de 2 el coach debería mirar la carga. */
const TOLERANCE = 1

export function rpeDelta(targetRpe: number | null, perceivedRpe: number | null): RpeComparison {
  if (targetRpe == null) return { delta: null, severity: 'unknown', label: 'Sin objetivo' }
  if (perceivedRpe == null) return { delta: null, severity: 'unknown', label: 'Sin registrar' }

  const delta = perceivedRpe - targetRpe
  if (Math.abs(delta) <= TOLERANCE) return { delta, severity: 'ok', label: 'En el objetivo' }

  const magnitude = Math.abs(delta)
  const direction = delta > 0 ? 'pesado' : 'liviano'
  return {
    delta,
    severity: delta > 0 ? 'heavy' : 'light',
    label: `${magnitude} puntos más ${direction} de lo pedido`,
  }
}

export type RpePair = { targetRpe: number | null; rpe: number | null }

export type RpeSummary = {
  comparable: number
  averageDelta: number | null
  ok: number
  heavy: number
  light: number
}

export function summarizeRpe(pairs: RpePair[]): RpeSummary {
  const summary: RpeSummary = { comparable: 0, averageDelta: null, ok: 0, heavy: 0, light: 0 }
  let total = 0

  for (const pair of pairs) {
    const comparison = rpeDelta(pair.targetRpe, pair.rpe)
    if (comparison.delta === null) continue

    summary.comparable += 1
    total += comparison.delta
    if (comparison.severity === 'heavy') summary.heavy += 1
    else if (comparison.severity === 'light') summary.light += 1
    else summary.ok += 1
  }

  if (summary.comparable > 0) {
    summary.averageDelta = Math.round((total / summary.comparable) * 10) / 10
  }

  return summary
}
```

- [ ] **Step 4: Correr para ver que pasa** → PASS.

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/f4-feedback-deploy
git add packages/core/src/domain/rpeDelta*
git commit -m "feat(domain): add rpe target vs perceived comparison"
```

---

### Task 2: Agregación del feedback

**Files:**
- Create: `packages/core/src/access/coachFeedback.ts`
- Create: `packages/api/src/routes/coach/feedback.ts`

- [ ] **Step 1: El helper**

`coachFeedbackFor(coachUserId)` devuelve, por jugador del plantel:

```ts
export type PlayerProgress = {
  playerId: string
  playerName: string
  positionName: string | null
  programName: string | null
  weekName: string | null
  daysDone: number
  daysTotal: number
  rpe: RpeSummary
  lastNote: { dayName: string; note: string } | null
}
```

Pasos: `UserEntity.query.byCoach({ coachId })` para el plantel; por cada jugador
`activeProgramIdFor` → programa → semana vigente → `SessionLogEntity.query.byPlayer({ playerId })`
filtrando por los `dayId` de esa semana. Los pares de RPE salen de cruzar cada entry con el
`targetRpe` del `blockExercise` correspondiente en el árbol de la semana.

> Con planteles de ~30 y la escala de `CLAUDE.md` §2, resolver el programa por jugador en un loop es
> aceptable — son queries por partición exacta, no scans. Si un plantel pasa de 100, lo primero a
> hacer es cachear el resultado por `positionId` dentro de la request, antes de tocar cualquier otra
> cosa.

- [ ] **Step 2: Ruta**

`GET /coach/feedback` y `GET /coach/feedback/:playerId`. La segunda usa `scopedPlayer` — un
`playerId` de otro coach devuelve 404.

- [ ] **Step 3: Test de scoping**

`GET /coach/feedback/:playerId` con el id de un jugador de otro coach → 404.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/access/coachFeedback.ts packages/api/src/routes/coach/feedback.ts
git commit -m "feat(coach): add feedback aggregation endpoint"
```

---

### Task 3: Vista de feedback del plantel

**Files:**
- Create: `packages/web/app/pages/coach/feedback/index.vue`
- Create: `packages/web/app/components/RpeBadge.vue`
- Modify: `packages/web/app/components/AppSidebar.vue`

- [ ] **Step 1: `RpeBadge.vue`**

Recibe `targetRpe` y `perceivedRpe`, llama `rpeDelta` y pinta según `severity`:
`ok` verde, `heavy` rojo, `light` celeste, `unknown` gris. Muestra `8 → 10` cuando hay ambos valores,
y el label de la comparación como `title`. **El color no es la única señal** — el texto siempre dice
los dos números, para que sirva con daltonismo y en una captura en blanco y negro.

- [ ] **Step 2: La tabla**

Columnas: Jugador (link al detalle), Puesto, Semana, **Días** (`2/3`), **RPE**
(`+1.5 promedio · 2 pesados`), Última nota (truncada). Estado vacío si el plantel está vacío.

En mobile la tabla colapsa a cards: una por jugador, con los días y el RPE arriba y la nota abajo.
Una tabla de 6 columnas a 380px no se lee.

- [ ] **Step 3: Sidebar**

Agregar como **primer** item de `NAV.COACH`:

```ts
{ to: '/coach/feedback', label: 'Cómo viene el plantel', icon: 'i-lucide-activity' },
```

Va primero porque es la pantalla a la que el coach entra a mirar, no a editar.

- [ ] **Step 4: Probar**

Con el día completado en F3. Expected: el jugador aparece con "1/1", el promedio de RPE y la nota.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(coach): add squad feedback view with rpe comparison"
```

---

### Task 4: Detalle por jugador

**Files:**
- Create: `packages/web/app/pages/coach/feedback/[playerId].vue`

- [ ] **Step 1: La página**

Por cada día de la semana vigente:
- Encabezado con el nombre del día, `doneCount/totalCount` y la fecha de cierre si está completo.
- **La nota del día destacada en una card** si existe. Es la mitad del valor de esta pantalla: el RPE
  dice cuánto costó, la nota dice por qué.
- Tabla de ejercicios: nombre, lo planificado (`sets × reps` + etiqueta de carga), lo hecho
  (peso · reps), y `<RpeBadge>`.
- Las filas `heavy` o `light` llevan un borde izquierdo del color del badge, para verlas de un vistazo
  sin leer la tabla entera.

- [ ] **Step 2: Probar**

1. El detalle del propio jugador. Expected: el día de F3 con su nota.
2. Con el `playerId` de otro coach. Expected: **404**.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(coach): add per-player feedback detail"
```

---

### Task 5: E2E del loop completo

Recién acá tiene sentido (`CLAUDE.md` §5: E2E cuando el flujo coach→jugador→log esté completo).

**Files:**
- Create: `playwright.config.ts`, `e2e/coach-to-player.spec.ts`

- [ ] **Step 1: Instalar**

```powershell
pnpm add -D -w @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 2: Config**

Corre contra el stage personal desplegado (`baseURL` = la URL del Router), no contra un server local:
así el test cubre CloudFront, las dos Lambdas y DynamoDB reales, que es donde aparecen los problemas
de cookie y de routing.

- [ ] **Step 3: El spec**

1. Registrar un coach con email único (`coach-${Date.now()}@test.local`).
2. Leer el código de invitación de `/coach/players`.
3. Crear un programa, agregar un bloque con un ejercicio al 80% del 1RM y RPE objetivo 8.
4. Cerrar sesión; registrar un jugador con ese código.
5. Como jugador, cargar el 1RM del ejercicio en 140 kg.
6. Ir a `/player/week` y **verificar que se lee "80% → 112 kg"** — es la aserción central del producto.
7. Registrar 112 kg, 5 reps, RPE 10, escribir una nota, completar el día.
8. Cerrar sesión; entrar como el coach.
9. En `/coach/feedback`, verificar "1/1" y que la nota aparece.
10. En el detalle, verificar que el badge muestra `8 → 10` con estilo de "pesado".

- [ ] **Step 4: Correr**

Run: `pnpm exec playwright test`
Expected: 1 test, PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: add e2e coverage for the coach to player loop"
```

---

### Task 6: Producción

**Files:**
- Modify: `sst.config.ts`
- Create: `.github/workflows/deploy.yml` (opcional)

- [ ] **Step 1: Confirmar las protecciones del stage**

En `sst.config.ts` ya está desde F0:

```ts
removal: input?.stage === 'production' ? 'retain' : 'remove',
protect: input?.stage === 'production',
```

`protect` impide borrar recursos de production desde la CLI; `retain` deja la tabla en pie aunque
alguien destruya el stack. Verificá que ambas siguen ahí antes de desplegar.

- [ ] **Step 2: Secreto propio de producción**

```powershell
pnpm dlx sst secret set JwtSecret "<valor nuevo, distinto al de dev>" --stage production
```

Reusar el secreto de desarrollo significaría que un token emitido en tu stage personal es válido en
producción.

- [ ] **Step 3: Desplegar**

```powershell
pnpm dlx sst deploy --stage production
```

Expected: crea la tabla, las dos Lambdas y el Router, e imprime la URL.

- [ ] **Step 4: Cargar el catálogo, una sola vez**

El seed de F0 aborta si `SST_STAGE === 'production'`. Eso es deliberado: **no se toca**. Para cargar el
catálogo inicial en producción, correr el mismo script con un flag explícito y una sola vez:

```powershell
$env:SEED_ADMIN_EMAIL="<email real>"
$env:SEED_ADMIN_PASSWORD="<contraseña fuerte>"
pnpm dlx sst shell --stage production -- pnpm seed --force-production
```

Agregar ese `--force-production` al guard del seed: sin el flag sigue abortando. Después, limpiar las
variables de la terminal.

- [ ] **Step 5: Humo en producción**

1. Registrar un coach. Expected: funciona, redirige al plantel, se ve el invite code.
2. Registrar un jugador con ese código desde otro navegador.
3. `/player/week` responde con el estado vacío.
4. Verificar en el navegador que la cookie `coachlab_session` es `HttpOnly` y `Secure`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add production seed guard flag"
```

---

### Task 7: Cierre del MVP

- [ ] **Step 1: Auditoría final**

Dispatch `rbac-auditor` sobre todo `packages/api/src/` y `packages/core/src/access/`, y `code-reviewer`
sobre el diff completo de la rama contra `main`.

- [ ] **Step 2: Verificación**

Run: `pnpm typecheck && pnpm test && pnpm exec playwright test`
Expected: los tres en verde. Reportar la salida real, no "debería pasar".

- [ ] **Step 3: Actualizar CLAUDE.md**

En §6:

```markdown
- [x] **F4 — Loop de feedback + deploy**: vista coach con progreso "2/3 días" y RPE objetivo vs. percibido con notas; stage `production`; seed off en prod.
```

En §5, bajo "Levantar el proyecto":

```markdown
### Deploy

`sst deploy --stage production`. El stage `production` está `protect`ado y la tabla es `retain`:
destruir el stack no borra los datos. `JwtSecret` es distinto por stage. El seed aborta contra
`production` salvo que se le pase `--force-production` a mano, y solo se corrió una vez para cargar
el catálogo inicial.
```

- [ ] **Step 4: Commit y merge**

```bash
git add CLAUDE.md
git commit -m "docs: mark F4 complete and document deploy"
git checkout main
git merge --no-ff feature/f4-feedback-deploy -m "feat: F4 feedback loop and production deploy"
git tag v1.0.0-mvp
```

---

## Definición de terminado

- El coach ve "2/3 días" por jugador y el promedio de desvío de RPE.
- El detalle muestra objetivo → percibido por ejercicio, con las notas del día destacadas.
- Un coach no ve feedback de plantel ajeno (404).
- El E2E cubre coach → programa → jugador → 1RM → "80% → 112 kg" → registro → feedback, contra la
  infra real.
- La app está en producción, con la cookie HttpOnly+Secure y el seed bloqueado.
- `pnpm typecheck && pnpm test && pnpm exec playwright test` en verde.

---

## Después del MVP

Fuera de alcance por `CLAUDE.md` §2, en el orden que tiene sentido si el producto camina:

1. **Compare de evaluaciones** — la entidad `Evaluation` está diseñada desde F0 pero ninguna pantalla
   la usa. Es la deuda más barata de saldar.
2. Panel de admin real (CRUD del catálogo de ejercicios).
3. PWA + push notifications para el recordatorio del día de entrenamiento.
4. Multi-deporte configurable: las 8 posiciones dejan de ser constantes y pasan a ser configuración
   por club. Ojo que eso reabre la decisión de §2 que las sacó de la base — replantearlo, no asumirlo.

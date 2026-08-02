# F4-B — Simplificar la asignación de rutinas

> Diseño validado con el dueño del repo el **2026-07-31**. Reemplaza la resolución por prioridad de
> `CLAUDE.md` §3 por una regla de una línea, y le da al jugador la posibilidad de volver a otra de sus
> rutinas asignadas. **Si esto se aprueba e implementa, `CLAUDE.md` §3 se actualiza en el mismo PR.**
>
> Es la segunda mitad de F4. La primera (`F4-A`, la pasada de UI/UX) va aparte y **primero**: las dos
> tocan `packages/web/app/pages/coach/programs/[programId]/assign.vue`.

---

## 1. El problema

Hoy un jugador puede ser alcanzado por varios programas y gana el de mayor prioridad, con cuatro
niveles y un override numérico que el coach suma a mano:

| Destino | Base |
|---|---|
| Un jugador | 100 |
| Grupo custom que contiene su puesto | 50 |
| Forwards / Backs | 30 |
| Su puesto | 10 |

Dos cosas fallan con esto, y las dos las trajo el dueño del repo, que además juega en el club:

1. **La prioridad no describe cómo se usa la app.** El caso real es "este jugador se lesionó, lo paso
   a la rutina de lesionados tren inferior". Eso es una acción con una intención obvia —que vea *esa*—
   y hoy exige razonar si 50 + override le gana a 100. El coach no quiere resolver una aritmética;
   quiere que valga lo último que dijo.
2. **La asignación por puesto es redundante.** Un grupo custom con un solo puesto adentro hace lo
   mismo, y ya existe. El nivel de puesto es un cuarto destino que sólo agrega una fila más a la tabla
   de prioridades.

Y hay un tercer problema que hoy no tiene salida: si el coach le asigna la rutina de lesionados, el
jugador **pierde de vista** la de su grupo hasta que el coach se acuerde de revertirlo.

---

## 2. Las decisiones

### 2.1. Gana la última asignada

Se elimina la resolución por prioridad entera. La regla nueva:

> **De los programas asignados a un jugador, el vigente es el de `created_at` más reciente.**

Desaparecen `BASE_PRIORITY`, la columna `program_assignments.priority` y el campo "Prioridad extra" de
la pantalla del coach. `resolveProgram` se reduce a elegir el máximo `created_at`, y su nombre deja de
mentir.

**Por qué no se conserva la prioridad "por si acaso":** un override numérico que nadie usa es peor que
no tenerlo, porque el que lo encuentre va a asumir que significa algo. El escenario que justificaba la
prioridad —"quiero que esta asignación pese más que la otra"— se expresa mejor asignando después.

### 2.2. Tres destinos, no cuatro

Se elimina `position_id` como destino de un assignment. Quedan: un jugador, un grupo del sistema
(Forwards/Backs) y un grupo custom.

Un puesto suelto se modela como grupo custom de una sola posición. Es una acción más para el coach en
un caso poco frecuente, a cambio de un destino menos en el modelo, en el `CHECK`, en la política de
RLS y en la UI.

> ⚠ **Esto NO toca `profiles.position_id`.** El puesto del jugador sigue existiendo y sigue siendo lo
> que decide a qué grupo del sistema pertenece y qué grupos custom lo contienen. Lo único que se va es
> *apuntar un assignment directamente a un puesto*.

### 2.3. El jugador puede volver a otra de sus rutinas — opción C1

Si a un jugador lo alcanza más de un programa, ve un selector. Por default está en la última asignada.

**Su elección se resetea sola cuando el coach hace una asignación nueva que lo alcanza** — incluida una
dirigida a un grupo al que pertenece, que resetea a todos los de ese grupo.

Las tres variantes que se consideraron:

| | Qué hacía | Por qué no |
|---|---|---|
| Elección sólo para mirar | "Mi semana" siempre muestra la del coach | El selector quedaba decorativo |
| Elección permanente | Dura hasta que el jugador la cambie | Rompe el caso que motivó todo: el lesionado vuelve solo a la rutina pesada y nadie se entera |
| **C1 (elegida)** | Dura hasta la próxima asignación del coach | El jugador tiene flexibilidad y **la prescripción del coach siempre gana** |

C1 es lo que hace que esto no sea "el jugador elige su rutina" disfrazado. La autoridad sigue siendo
del preparador físico; lo que gana el jugador es poder mirar hacia atrás sin pedir permiso.

### 2.4. El coach ve lo que el jugador ve de verdad

La tarjeta "Qué le queda a cada jugador" hoy muestra el programa **resuelto por prioridad**. Con un
selector en el medio, eso pasaría a ser una pantalla que le miente al coach.

Pasa a mostrar el programa que el jugador está viendo realmente, y **marca visualmente** cuándo eligió
uno distinto del último asignado. Sin esto, C1 es peligrosa; con esto, es auditable.

---

## 3. El costo real, medido contra las migraciones

Este es el punto donde el diseño dejó de parecer chico. `position_id` no vive sólo en la tabla:

| Dónde | Qué hay | Riesgo |
|---|---|---|
| `0001_initial_schema.sql:203,212,218` | La columna, el `CHECK` `num_nonnulls(...) = 1` sobre **cuatro** columnas, y su índice parcial | Cambio de constraint sobre tabla con datos |
| `0003_rls_policies.sql:58-72` | **`program_reaches_me()`**, `security definer`, referencia `a.position_id` | **Es lo que usan las políticas de RLS.** Dropear la columna sin reescribir esta función rompe la **capa 1** de `CLAUDE.md` §4 |
| `0005_rbac_hardening.sql:27` | La **redefine** con el mismo `position_id` adentro | Hay que reescribir la versión vigente, no la de `0003` |
| `0006` / `0009` | Trigger `program_assignments_guard_targets`, que valida que el destino pertenezca al coach | Tiene una rama por destino; se le cae una |
| `0009:90`, `0010:45` | `release_player` borra assignments obsoletos al desvincular | Revisar que la limpieza siga siendo correcta con tres destinos |

**La conclusión que importa:** el orden de la migración no es libre. Hay que **reescribir
`program_reaches_me()` primero** y recién después dropear la columna, o la función queda referenciando
una columna inexistente y toda lectura del programa del jugador falla. Es exactamente la clase de
error que no aparece en `typecheck` ni en los tests de dominio.

### Los assignments por puesto existentes se convierten, no se borran

La migración crea un grupo custom por cada puesto efectivamente usado como destino (nombre: el del
puesto) y le reapunta el assignment.

**Por qué convertir y no borrar:** borrar es más limpio de leer y deja jugadores sin programa **en
silencio** — el coach se entera cuando alguien le avisa que no le aparece la rutina. La conversión es
no-op si no hay ninguno, así que no cuesta nada en el caso feliz.

### Dónde vive la elección del jugador

Columna en `profiles`: `selected_program_id uuid references programs(id) on delete set null`, nullable,
donde **`null` significa "la última asignada"** y no "ninguna".

- **Por qué en `profiles` y no en una tabla nueva:** es un dato por jugador, no un historial. Una tabla
  con una fila por jugador es una join de más, con el mismo criterio que `CLAUDE.md` §3 usa para no
  darle una tabla a las 8 posiciones.
- **`on delete set null`** para que borrar un programa devuelva al jugador al default en vez de dejarlo
  apuntando a un fantasma.

> **El caso que casi se escapa: la elección que dejó de estar asignada.** El coach le quita al jugador
> el assignment del programa que el jugador tenía elegido. La FK no se entera —el programa sigue
> existiendo, sólo que ya no lo alcanza— así que `selected_program_id` queda apuntando a algo que RLS
> ahora le niega, y "Mi semana" se rompe en vez de degradar.
>
> **Regla:** la elección sólo vale si el programa **todavía alcanza** al jugador. Si no, se ignora y se
> cae al default (la última asignada). Se resuelve al leer, no con un trigger de limpieza: quitar un
> assignment no es el único camino que puede invalidarla —cambiar al jugador de puesto o sacarlo de un
> grupo custom hacen lo mismo— y una regla al leer los cubre todos. Es la misma decisión que
> `CLAUDE.md` §3 toma con `isPositionId` y `isLoadType`: ante un valor que ya no es válido, degradar,
> no romper el render.
- Necesita entrar en `guard_profile_changes` como campo **que el jugador SÍ puede cambiar** — hoy ese
  trigger frena `coach_id`, `email`, `role` e `invite_code`, y hay que verificar que no frene este.
- El reset del §2.3 es un `update` desde el trigger que ya valida los targets del assignment, o una
  sentencia en la ruta de alta. **Se decide al planificar**, pero la regla se testea como función pura
  igual que `nextOneRmFrom` (`CLAUDE.md` §3).

> **Trampa conocida que aplica acá** (`CLAUDE.md` §3): un `UPDATE` cuya fila resultante sale del alcance
> de la política de `SELECT` falla con `42501`. Si el reset lo hace el coach sobre la fila de OTRO
> usuario, va por RPC `security definer`, no por PATCH.

---

## 4. Qué se toca

```
supabase/migrations/
  0019_assignment_last_wins.sql      # convertir POSITION → grupo custom; reescribir
                                     # program_reaches_me(); drop position_id; drop priority;
                                     # CHECK a 3 columnas; profiles.selected_program_id

packages/core/src/
  domain/resolveProgram.ts           # REEMPLAZADO: máximo created_at, sin prioridades
  domain/resolveProgram.test.ts      # los tests de los 4 niveles se van con la regla
  validators/assignment.ts           # sin positionId, sin priority

packages/api/src/
  access/assignments.ts              # candidatos + elección del jugador
  routes/coach/assignments.ts        # alta sin priority ni positionId
  routes/player/programs.ts          # NUEVO: listar las asignadas, cambiar la elegida

packages/web/app/
  pages/coach/programs/[programId]/assign.vue   # sin prioridad; preview con lo que el jugador ve
  pages/player/week/index.vue                   # selector cuando hay más de una
```

---

## 5. Verificación

Lo que hay que probar, en orden de "qué pasa si esto está mal":

1. **RLS después del cambio** (capa 1). Un jugador alcanzado por un grupo custom sigue leyendo su
   programa; uno no alcanzado sigue sin verlo. Se verifica con **sesión real** y se asserta por
   **código de error** (`42501` = política, `23514` = CHECK), nunca por "falló" — son indistinguibles
   desde afuera y significan lo opuesto.
2. **La conversión de los assignments por puesto.** Después de migrar, cada jugador que antes recibía
   un programa por su puesto lo sigue recibiendo. Si no hay ninguno, la migración es no-op y hay que
   probar ese caso también.
3. **El reset de C1.** El jugador elige la vieja; el coach asigna una nueva; el jugador ve la nueva.
   Es la regla que hace que C1 no sea C3.
4. **La elección que dejó de ser válida.** El jugador elige un programa; el coach le quita ese
   assignment. El jugador tiene que ver la última asignada, **no** una pantalla rota ni un 403. Se
   prueba por los tres caminos que la invalidan: quitar el assignment, cambiarle el puesto, y sacarlo
   del grupo custom.
5. **`resolveProgram` nuevo**, como función pura: una sola asignación, varias, empate exacto de
   `created_at`, ninguna, y elección apuntando a un programa que ya no está entre las candidatas.
6. **El preview del coach** refleja la elección del jugador, no el default.

---

## 6. Deuda que este spec NO resuelve

- **`programs.current_week_id` sigue siendo global al programa** (`IMPLEMENTATION-F3.5.md` §6.5). Si dos
  jugadores están en programas distintos ahora es más visible, pero el problema es el mismo de F0.
- **Residuo de stack en una migración aplicada.** `0001_initial_schema.sql:209` comenta *"En DynamoDB
  esto no se podía expresar"* — stack descartado #2 (`CLAUDE.md` §7.5). **No se corrige**: las
  migraciones aplicadas no se editan (`CLAUDE.md` §5), y un cambio de comentario no vale arriesgar un
  desajuste de checksum con el CLI. Queda anotado acá, que es donde alguien lo va a buscar.
- **El drag&drop de reordenamiento** sigue faltando desde F2.

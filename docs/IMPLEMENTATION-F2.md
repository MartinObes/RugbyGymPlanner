# F2 — Qué se implementó, dónde y por qué

> Registro de la sesión del **2026-07-28/29** sobre la rama `feature/f2`. El plan ejecutado es
> `docs/superpowers/plans/2026-07-28-f2-coach-panel.md` (reescrito contra el stack Supabase; el de
> 2026-07-27 queda como registro del stack descartado). La fuente de verdad de las decisiones sigue
> siendo `CLAUDE.md`.

---

## 1. Resumen

**F2 está completa y verificada en vivo.** El coach gestiona su plantel, arma grupos, construye
programas con autosave, los asigna con prioridad viendo el impacto, e importa desde texto o Excel.

| | Estado |
|---|---|
| Dominio: `resolveProgram` (4 niveles + empates) y helpers de orden | ✅ 32 tests |
| Validadores: programa, bloque, ejercicio, assignment, player, grupo, import | ✅ 60 tests |
| Parsers de import (`parseText`, `parseGrid`) | ✅ 32 tests |
| API del coach: 26 endpoints con guards por prefijo | ✅ 57 tests |
| Pantallas: plantel, ficha, grupos, programas, editor, assignments, import | ✅ `Build complete` |
| Migraciones `0008` y `0011` | ✅ aplicadas |
| **Verificación en vivo** `pnpm verify:setup` | ✅ **69/69** |
| **Smoke del flujo completo** contra el dev server | ✅ **28/28** |

Tests: **159 en core + 57 en api = 216**. Typecheck y build en verde.

### El hardening RBAC que vino antes

Antes de F2 se ejecutó `docs/superpowers/plans/2026-07-28-rbac-hardening.md`, que cerró los
hallazgos de la auditoría de F1. Fueron **tres pasadas de auditoría** y seis migraciones
(`0005`–`0010`), porque cada pasada encontró algo que la anterior había dejado abierto o roto:

1. `0005` cerró los 4 hallazgos originales (cross-tenant en `program_reaches_me`, autovínculo de
   `coach_id`, oráculos RPC, `email` mutable).
2. `0006`/`0007`: la re-auditoría descubrió que el fix de la desvinculación era **código muerto** —
   ver §4.1, es el hallazgo más interesante de toda la fase.
3. `0009`/`0010`: la tercera pasada descubrió que **los `revoke` no revocaban nada** (§4.2) y que un
   assignment podía sobrevivir a la desvinculación quedando inmodificable.

Todo está documentado en `docs/IMPLEMENTATION-F1.md` §4 y §6.

---

## 2. Decisiones de diseño

1. **El árbol es una tabla por nivel, y eso simplificó el editor.** El plan viejo (DynamoDB) tenía
   un update anidado sobre una ruta de map (`days.#d.blocks.#b.exercises.#e`) que exigía verificar
   que la ruta existiera antes de escribir, o se creaba basura dentro del árbol de un programa
   legítimo. Con filas: el autosave es `PATCH /coach/block-exercises/{id}`, RLS resuelve el
   ownership subiendo hasta `can_write_program`, y el problema desaparece.
2. **Las rutas de hijos no repiten el `programId`.** Un uuid identifica la fila y RLS ya sube el
   árbol. Meter el `programId` daría una validación redundante que igual habría que verificar contra
   la fila.
3. **`assertRow` en toda escritura.** Es la respuesta a la trampa de PostgREST: un `UPDATE`/`DELETE`
   que no matchea filas devuelve **éxito con 0 filas**. Sin eso, un recurso ajeno responde 200 y el
   coach cree que guardó.
4. **No se permite re-parentar filas.** Mover un ejercicio de bloque es borrarlo y crearlo. Un
   `UPDATE` que saca la fila del alcance de su política de `SELECT` falla con 42501 (`CLAUDE.md` §3).
5. **Los parsers reciben la matriz cruda, no el archivo.** `parseGrid(rows)` toma lo que devuelve
   `sheet_to_json(sheet, { header: 1 })`, así queda pura y testeable sin archivos; SheetJS vive solo
   en el browser y el archivo no sube al servidor.
6. **El import es reemplazo, no merge**, y no es transaccional: PostgREST no expone transacciones
   entre requests. Si se corta, el coach ve el resultado y reimporta. La alternativa era mover la
   construcción del árbol a SQL, que es lo que `CLAUDE.md` §3 evita.
7. **La preview de impacto hace ~2 queries por jugador.** A 40–60 jugadores es gratis y usa la misma
   función pura que el resto (`CLAUDE.md` §2: no optimizar prematuramente).

## 3. Mapa de archivos nuevos

```
supabase/migrations/
  0008_catalog_growth_and_block_shape.sql   # RPC ensure_exercise + CHECK de blocks
  0011_coach_writes_one_rms.sql             # el coach puede cargar el 1RM de su jugador

packages/core/src/
  domain/resolveProgram.ts       # los 4 niveles de prioridad + empate por fecha
  domain/tree.ts                 # sortByOrderIndex, nextOrderIndex, reindex
  domain/parseText.ts            # import de texto pegado
  domain/parseGrid.ts            # import de planilla (matriz cruda)
  validators/program.ts          # programa, semana, día, bloque, ejercicio, assignment, reorder
  validators/player.ts           # perfil editable + 1RM
  validators/group.ts            # grupo custom
  validators/parsedProgram.ts    # contrato del import (schema y tipo a la vez)

packages/api/src/
  access/assignments.ts          # candidatos + activeProgramIdFor
  routes/catalog.ts              # GET /catalog/exercises (los tres roles)
  routes/coach/_scope.ts         # assertRow / assertRpcOk
  routes/coach/players.ts        # plantel, ficha, 1RM, release
  routes/coach/groups.ts         # grupos custom (+ los system desde constantes)
  routes/coach/programs.ts       # CRUD + lectura del árbol en un request
  routes/coach/tree.ts           # semanas, días, bloques, ejercicios, reorder
  routes/coach/assignments.ts    # assignments + preview de impacto
  routes/coach/import.ts         # aplicar un ParsedProgram

packages/web/app/
  components/ExerciseTypeahead.vue
  components/program/{BlockCard,DayColumn,ExerciseRow}.vue
  composables/{useCoachApi,useDebouncedSave}.ts
  pages/coach/players/[playerId].vue
  pages/coach/groups.vue
  pages/coach/programs/index.vue
  pages/coach/programs/[programId].vue          # padre con tabs
  pages/coach/programs/[programId]/{index,assign,import}.vue
```

## 4. Los tres problemas que valen la pena

### 4.1. El fix de la desvinculación era código muerto (y el mensaje de error culpaba al inocente)

`0006` agregó `coach_id is null` al `WITH CHECK` de `profiles_update` para que un coach pudiera
sacar a un jugador de su plantel. **No funcionó**, y el error decía
`42501 new row violates row-level security policy` — que apunta justo al `WITH CHECK` que acababa de
arreglarse.

La causa real: **Postgres exige que la fila resultante de un `UPDATE` siga siendo visible bajo las
políticas de `SELECT`.** Al poner `coach_id = null`, el jugador deja de ser "mi jugador" para
`profiles_select` y la fila se vuelve invisible **para el coach que la está editando**. Pasa aunque
el `WITH CHECK` pase y sin `RETURNING`.

Lo que lo aisló fue un experimento reversible: dentro de una transacción, ampliar `profiles_select`,
correr el update, `rollback`. Pasó → hipótesis confirmada. Ampliarla de verdad habría expuesto el
perfil de todo jugador sin coach a cualquier autenticado, así que la operación se movió a la RPC
`release_player` (`0007`), y `0007` revirtió el `WITH CHECK` de `0006` porque era una rama muerta en
una política de seguridad — peor que ruido: el próximo lector creería que el PATCH funciona.

Está en `CLAUDE.md` §3 porque va a volver: cualquier update que cambie la columna por la que scopea
una política tiene el mismo problema.

### 4.2. `revoke execute ... from anon` no revoca nada

Postgres otorga `EXECUTE` a `PUBLIC` al crear una función. Revocar solo a `anon` deja ese grant en
pie y el chequeo de privilegios cae ahí. `0005` lo había escrito bien (`from public, anon`);
`0006`–`0008` copiaron la forma incompleta, y tres RPCs quedaron alcanzables por la anon key.

No hubo exposición de datos (las tres cortan solas en `auth.uid() is null`), pero el registro de
auditoría afirmaba algo falso. Se distingue por el error: **`P0001` con el mensaje de la función**
significa que corrió, o sea que sigue alcanzable; **`42501 permission denied for function`** es
revocada de verdad.

De paso apareció un segundo error, este en el check: usaba un cliente de supabase-js que había hecho
`signUp` antes, y con la confirmación de email apagada **`signUp` devuelve sesión**, que supabase-js
guarda en la instancia. El "cliente anónimo" estaba autenticado, así que el check daba falso
negativo y encima metió un ejercicio de prueba en el catálogo global.

### 4.3. Dos FK entre `programs` y `weeks` rompían toda lectura de programa

`GET /coach/programs/{id}` devolvía **500** en cualquier request real:
`Could not embed because more than one relationship was found for 'programs' and 'weeks'`. Hay dos
caminos entre esas tablas — `weeks.program_id` y `programs.current_week_id` (el que se agrega al
final de `0001`) — y PostgREST no elige por su cuenta. Se desambigua con
`weeks!weeks_program_id_fkey(...)`.

Lo importante es **qué no lo detectó**: los 57 tests de la API usan `app.request()` sin sesión, que
nunca llega a PostgREST; el typecheck no ve strings de select; y `verify:setup` habla con la base
directo, sin pasar por las rutas. Lo agarró el smoke test contra el dev server con una sesión real,
que es el único nivel donde el seam Nuxt → Hono → PostgREST se ejercita completo.

## 5. Hallazgos que se corrigieron sobre la marcha

Dos cosas que habrían bloqueado la fase a mitad de camino y aparecieron al escribir el código:

- **El import no podía crear ejercicios.** `exercises_write` es solo ADMIN, pero importar un programa
  con "Remo Pendlay" exige agregarlo al catálogo. Se resolvió con la RPC `ensure_exercise` (`0008`),
  que **solo inserta si falta**: el catálogo puede crecer pero no se puede pisar ni vaciar desde la
  app. El `normalized_name` lo calcula el llamador con `normName`, porque replicar ese algoritmo en
  SQL sería tener dos fuentes de verdad del matching de 1RM.
- **El coach no podía cargar el 1RM de su jugador.** `one_rms_write` era `player_id = auth.uid()`,
  mientras la tabla de al lado (`evaluations`) **sí** dejaba al coach. Era una inconsistencia de
  `0003`, no una decisión: el flujo real es que el coach toma los tests. `0011` agrega
  `is_my_player`. Lo que **no** cambió: el `session_log` del jugador sigue intocable para el coach —
  si pudiera editarlo se rompería el dato que da sentido al producto.

También se corrigió `blocks.type`, que era `text` libre y nullable: ahora es `NOT NULL` con un
`CHECK` que exige vueltas en `CIRCUIT` y las prohíbe en `SINGLE` (`0008`), al mismo nivel que la
coherencia de `LoadType`.

## 6. Deuda conocida

- **El formato del import es una suposición.** `coach.html` y `README-CoachLab.md` **siguen sin estar
  en el repo**. El contrato (`ParsedProgram`) y las firmas no van a cambiar, pero el formato de
  entrada hay que confirmarlo contra el prototipo o con un coach real antes de F4.
- **El import no es transaccional** (§2.6). Si molesta, va como RPC `import_program(jsonb)`.
- **Los tipos generados viven en `packages/web/types/database.ts`**, así que el cliente de la API no
  está tipado con `Database` y los selects anidados se infieren como arrays. Se normalizan las dos
  formas en vez de castear, pero lo correcto sería mover esos tipos a un lugar compartido.
- **No hay reordenamiento por drag&drop.** La ruta (`PATCH /coach/blocks/{id}/exercises/reorder`) y el
  helper puro (`reindex`) existen y están testeados; falta el gesto en la UI.
- **La preview de impacto hace ~2 queries por jugador** (§2.7).
- **Un coach puede editar `name`, `position_id`, `height_cm` y `weight_kg` de sus jugadores**, y en F3
  el jugador va a editar los mismos campos desde su perfil. Hay que decidir explícitamente si el
  jugador puede sobrescribir lo que puso el coach.

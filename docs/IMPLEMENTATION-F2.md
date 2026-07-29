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

## 3.5. El import, validado contra las planillas reales

El 2026-07-29 el dueño del repo aportó dos libros de Excel del preparador físico y el formato que yo
había asumido resultó **equivocado de raíz**. El parser nuevo es
`packages/core/src/domain/parseCoachSheet.ts`.

**El formato real:** un archivo es un grupo de puestos (`Ms-Ap-Wi-Fb` = medioscrum, apertura, wing,
fullback). Una hoja es un bloque de **1 a 3 semanas puestas al lado**, y el nombre de la hoja son los
números de semana (`14.15.16`, `Fuerza 1.2`, `29.30`).

| Dónde | Qué |
|---|---|
| Columna A | marcador de bloque: `bloque 1`, `bloque 2`… |
| Columna B | nombre del bloque y, debajo, los ejercicios |
| Col. B, fila 2 | `SESION 1 - LUNES` → el día |
| Fila de encabezados | `kilos \| repet \| S`, repetido por semana |
| Grupos de 3 columnas | una semana cada uno |

**Cuatro cosas que obligaron a decidir**, y lo que se decidió (dueño del repo):

1. **Cargas que no son números** (`p.corp`, `barra`, `goma`, `m.band`, `med 9`, `60 . 120`) → cuarto
   modo de carga `LABEL` con una etiqueta corta (migración `0013`). Mapearlas a `NONE` habría perdido
   información que el jugador necesita para saber con qué hacer el ejercicio.
2. **Filas que son dos ejercicios** (`Cuadriceps 1p - 2p` con carga `60 . 120`) → se conservan
   enteras. Partirlas exige adivinar cuando la cantidad de partes no coincide, y una adivinanza mala
   cambia la rutina.
3. **Semanas al lado** → una semana del programa por columna, cada una con sus cargas. Eso preserva
   la progresión, que es el trabajo del preparador.
4. **Cero porcentajes del 1RM en las planillas.** El diferencial del producto no se usa hoy en la
   planificación del club: el import nunca lo va a generar. Es una forma de trabajar que la app
   habilita, no algo que se pueda importar.

**Dos cosas que el parser tuvo que aprender de los datos reales, no de mis fixtures:**

- **La posición de las columnas varía.** Con columna separadora las semanas arrancan en D; sin
  separadora, en C. Por eso los grupos se **detectan** leyendo la fila `kilos | repet`, y una hoja sin
  esa fila no es una rutina — así se saltean solas el calendario de micros, el plantel, las hojas de
  aeróbico y las vacías.
- **Los sub-bloques no llevan marcador.** `C 1`, `C 2`, `C 3` dentro de un día no tienen `bloque n` en
  la columna A: su única señal son las vueltas en la celda de carga. Detectar solo por la columna A
  hacía que esas filas entraran como **ejercicios con carga "3 VUELTAS"** — lo encontré recién al
  correr el parser contra los libros reales.

**Resultado sobre los libros reales:** 20 de 28 hojas parsean como rutina y las 8 salteadas son
exactamente las que no lo son. El import de la hoja `14.15.16` de punta a punta contra la base:
**14/14 checks** — 3 semanas, 9 días, 108 ejercicios, 30 circuitos con sus vueltas, 35 cargas con
etiqueta, 73 en kg, 27 ejercicios nuevos al catálogo, y reimportar reemplaza sin duplicar.

## 4. Los problemas que valen la pena

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

### 4.4. La auditoría encontró un HIGH que sí era explotable

`rbac-auditor` sobre la API de F2 dio "apto para merge" (ninguna ruta sin guard, ningún cross-tenant
sobre datos de negocio) pero encontró un agujero **fuera** de la API, y lo verifiqué antes de
arreglarlo:

```
rol del atacante: PLAYER
ESCRIBIÓ EL CATÁLOGO -> name="ATAQUE Catalogo Global" normalized_name="ba"
```

`ensure_exercise` (`0008`) es `security definer` —saltea `exercises_write`, que es ADMIN-only—, tenía
`grant execute` a `authenticated`, y su único control era `auth.uid() is null`. Como registrarse es
público, cualquiera pegaba en `POST /rest/v1/rpc/ensure_exercise` con la anon key y su JWT **sin pasar
por Hono**. La lección: **el borde de seguridad de una RPC es la RPC, no la ruta que la llama**; el
guard de `/coach/*` no protege nada invocable por PostgREST. Y el `normalized_name` de dos letras del
ejemplo secuestraría el cálculo de kg de todo ejercicio que las contenga, porque `rmFor` matchea por
inclusión.

Cerrado en `0012` con un chequeo de rol y validación del parámetro. Pero esa validación se pasó de
estricta —whitelist alfanumérica— y **rompió el import entero**: `normName` no saca puntuación, y los
nombres reales están llenos de puntos y barras (`Sub. lat al cajon c/pie arriba m.bosu`). `0014` la
cambia por lo que corresponde: verificar que el nombre **esté normalizado** (minúsculas, sin espacios
dobles, sin acentos que `normName` habría sacado) en vez de adivinar su juego de caracteres.

De la misma auditoría salieron dos arreglos más que valen: el import **validaba después de borrar el
árbol**, así que un `CIRCUIT` sin vueltas vaciaba el programa y devolvía 500 — ahora los schemas del
import espejan los `CHECK` y tienen topes de tamaño; y el reemplazo de puestos de un grupo hacía
delete-y-después-insert, así que si el insert fallaba el grupo quedaba **sin puestos** y sus
assignments dejaban de alcanzar a nadie en silencio.

### 4.5. Los iconos del sidebar no se veían

Nuxt Icon resolvía los iconos en runtime y salía a buscarlos por red: cada uno fallaba con
`loading icon lucide:users timed out after 1500ms` y quedaba en blanco, aunque `@iconify-json/lucide`
estuviera instalado. Se arregla inlineándolos en el bundle (`clientBundle` en `nuxt.config.ts`), que
además evita requests en producción.

La lista es **explícita** y no `scan: true`, porque el nav pasa el icono por binding dinámico
(`:name="item.icon"`) y el escaneo estático no ve esos nombres. Como una lista desfasada no rompe ni el
build ni el typecheck —el icono simplemente no se ve— hay un test (`packages/web/tests/icons.test.ts`)
que compara las dos listas.

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

- **El formato del import está validado** (§3.5) contra dos libros reales, pero solo contra esos dos.
  Si aparece una planilla con otra disposición, el síntoma va a ser una hoja que no se reconoce como
  rutina (se saltea, no rompe) o ejercicios raros en la previsualización — que es justo para lo que la
  previsualización está.
- **`sets` siempre entra como 1.** Las planillas dejan la columna `S` vacía y las vueltas del bloque
  hacen ese papel, así que el parser no tiene de dónde sacar las series. El coach las ajusta en el
  editor. Si resulta que `S` se usa en otras hojas, es un cambio de una línea.
- **Las hojas de aeróbico no se importan.** No tienen la fila `kilos | repet`, así que se saltean. Sus
  "ejercicios" son instrucciones de corrida (`4 x 40 continuos`, `pausa: 45''`) que el modelo de
  bloques no representa bien; queda para decidir si entran como texto o quedan afuera del MVP.
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

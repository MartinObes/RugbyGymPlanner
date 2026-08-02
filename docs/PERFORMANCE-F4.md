# F4 — Por qué cambiar de vista tarda, y qué se hizo

> Informe pedido en F4-A, item 7: *"actualmente cambiar de vista dura segundos a veces"*.
> Medido el **2026-07-31**. Las reglas transversales están en `CLAUDE.md`; los valores visuales en
> `docs/DESIGN-SYSTEM.md`.

---

## 1. Qué se pudo medir y qué no

**Se midió:** la latencia de red contra el proyecto real de Supabase, con `curl`, cinco corridas.

**NO se midió, y hay que decirlo:** ningún tiempo de punta a punta con una sesión de verdad. Todas
las pantallas de la app están detrás de `auth.global.ts`, y poblar una sesión requiere
`SUPABASE_SERVICE_ROLE_KEY`, que no está en `.env` **y no debe estar** (`CLAUDE.md` §4). Es la misma
deuda que `IMPLEMENTATION-F3.5.md` §6.1 dejó abierta.

**Tampoco se midió la latencia que importa en producción.** Los números de abajo salen de la máquina
del desarrollador (Uruguay) contra Supabase. En producción quien habla con Supabase es una función de
Vercel, y esa distancia puede ser bastante distinta —mejor o peor— según en qué región quede cada una.
**Si algún día se afina esto en serio, el primer dato a conseguir es ese**, no repetir estos.

Por eso el informe combina **una medición** (cuánto cuesta un viaje) con **un conteo leído del
código** (cuántos viajes hay). El producto de los dos es la estimación, y está marcada como tal.

## 2. Lo medido: cuánto cuesta un viaje

`curl` contra `https://<proyecto>.supabase.co/auth/v1/health`, 5 corridas:

| Etapa | ms |
|---|---|
| DNS (cacheado) | ~10 |
| + TCP connect | ~14–21 |
| + TLS handshake | ~33–40 |
| + request/response | **~30** |
| **Total, conexión nueva** | **88–124** |
| **Primera corrida, todo frío** | **354** |

Los dos números que importan: **~30 ms** por viaje si la conexión ya está abierta, y **~90–120 ms**
si hay que abrir TLS.

## 3. Lo contado: cuántos viajes hay

### 3.1. Toda request autenticada paga un peaje de 2 viajes antes de empezar

`packages/api/src/middleware/auth.ts:52-63`. Antes de que la ruta corra:

1. `supabase.auth.getUser()` — viaje a Supabase Auth. **Siempre sale a la red**: a diferencia de
   `getSession()`, `getUser()` valida el token contra el servidor a propósito.
2. `select` de `profiles` — segundo viaje, a PostgREST. Hace falta porque **el rol vive en
   `profiles.role`, no en el JWT** (`CLAUDE.md` §4), que es una decisión correcta y no se toca acá.

Los dos son **en serie**: el `select` necesita el `user.id` del primero.

> **Costo estimado: ~60 ms por request en el mejor caso, ~200 ms con conexiones frías** — antes de
> que la ruta consulte un solo dato propio. Y lo paga *cada* endpoint.

### 3.2. Las páginas encadenaban sus cargas

`await useAsyncData(...)` bloquea el `setup`, así que la siguiente carga no arranca hasta que la
anterior termina. Tres pantallas lo hacían, y **cada request encadenada arrastra su propio peaje del
punto 3.1**:

| Pantalla | Cargas en serie | Viajes de peaje encadenados |
|---|---|---|
| `coach/programs/[programId]/assign.vue` | 4 | 8 |
| `coach/players/[playerId].vue` | 3 | 6 |
| `player/profile.vue` | 3 | 6 |

En asignaciones eso son **~240 ms sólo de peaje**, en serie, más las queries reales de cada ruta.

### 3.3. Y mientras tanto la pantalla no decía nada

`useAsyncData` sin `lazy` **bloquea la navegación de Nuxt**: la pantalla anterior se queda quieta
hasta que la data llega. No hay spinner, no hay esqueleto, no se mueve nada. Un segundo de eso se
percibe como que la app se colgó, no como que está cargando — que es exactamente la queja original.

## 4. Cambios aplicados

| # | Qué | Dónde | Ganancia |
|---|---|---|---|
| 1 | Las cargas de una pantalla salen **juntas** (`Promise.all`) en vez de encadenadas | `assign.vue`, `players/[playerId].vue`, `profile.vue` | De 4 y 3 viajes en serie a **1 tanda**. En asignaciones, ~240 ms de peaje pasan a ~60 |
| 2 | **`NuxtLoadingIndicator`** en el shell | `app/app.vue` | No acelera nada: hace **visible** la espera. Ataca la mitad percibida de §3.3 |
| 3 | Transición de página de 150 ms | `nuxt.config.ts` + `main.css` | Da continuidad entre pantallas. Respeta `prefers-reduced-motion` |

`useAsyncData` se sigue **llamando** de forma síncrona en los tres archivos: Nuxt lo necesita así para
registrar la carga y serializar el payload del SSR. Lo único que se movió es el `await`.

## 5. Lo que NO se hizo, y por qué

**No se tocó el peaje de auth de §3.1**, que es el cuello de botella más grande y el más tentador.
Dos ideas evaluadas y descartadas *por ahora*:

- **Saltear `getUser()` y leer `profiles` directo.** RLS igual acota la lectura a la fila propia, así
  que sería seguro y ahorraría un viaje de los dos. Pero `getUser()` también es lo que dispara el
  **refresh del token** cuando está por vencer, y sacarlo significa que una sesión larga empieza a
  fallar sola. Es un cambio con consecuencias de sesión, no una optimización: necesita su propio
  diseño y su propia verificación.
- **Cachear el `profile` por request.** No ayuda: ya se resuelve una sola vez por request. Cachearlo
  *entre* requests sería cachear datos que dependen del rol, y eso no se toca sin `rbac-auditor`
  (servirle a un usuario la respuesta cacheada de otro es una fuga de datos disfrazada de mejora).

**No se convirtió nada a `lazy: true`.** Habría que decidir por pantalla qué mostrar mientras carga, y
un esqueleto mal puesto se ve peor que una espera corta con la barra de progreso. Con el indicador
puesto, conviene mirarlo en un browser antes de decidir.

## 6. Lo primero que haría el que siga

1. **Medir Vercel → Supabase.** Todo este informe asume que la distancia se parece a la del
   desarrollador. Es la suposición más grande que tiene.
2. **Medir de punta a punta con una sesión real**, que es lo que sigue bloqueado por la deuda de
   `IMPLEMENTATION-F3.5.md` §6.1.
3. Recién con esos dos números, decidir si el peaje de §3.1 justifica el rediseño de sesión de §5.

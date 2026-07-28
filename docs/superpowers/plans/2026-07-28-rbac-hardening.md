# RBAC Hardening (deuda de la auditoría F1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los 4 hallazgos de la auditoría RBAC de F1 (`docs/IMPLEMENTATION-F1.md` §4) con
una migración nueva, verificada en vivo, **antes de arrancar F2** — que es la fase que vuelve
explotables al HIGH y al MEDIUM.

**Architecture:** Todo el fix vive en la base (migración `0005_rbac_hardening.sql`): se corrige
`program_reaches_me` (scoping por coach), se endurece `guard_profile_changes` (coach_id y email),
se agrega la RPC `redeem_invite_code` (el único camino válido para vincularse, con un flag
transaction-local que el guard reconoce) y se revocan los EXECUTE que exponían oráculos. La
verificación son checks nuevos en `scripts/verify-setup.mjs` contra el proyecto real — una
política de RLS no la agarra ningún unit test.

**Tech Stack:** SQL plano (migración), Supabase CLI, `verify-setup.mjs` (supabase-js).

**Precondición:** la migración 0004 aplicada (pasos de `IMPLEMENTATION-F1.md` §5). Requiere las
mismas credenciales: password de Postgres (push), PAT (tipos), secret key (verify). Si este plan
se ejecuta junto con esos pasos, **un solo `db push` aplica 0004 y 0005**.

**Los 4 hallazgos** (severidad — qué rompe — dónde nació):

| # | Sev | Problema |
|---|---|---|
| H-1 | HIGH | `program_reaches_me` matchea assignments por posición/grupo de **cualquier** coach → lectura cross-tenant del árbol de programas cuando F2 cree assignments |
| M-1 | MED | Un jugador con `coach_id null` puede autovincularse a cualquier coach por PATCH directo a PostgREST (el guard de 0002 solo frena cuando ya tenía coach) |
| L-1 | LOW | El EXECUTE default expone `generate_invite_code` y los helpers de RLS como RPC (`/rest/v1/rpc/*`) a roles que no los necesitan |
| L-2 | LOW | `guard_profile_changes` no protege `email`: puede divergir de `auth.users.email` |

---

### Task 1: Migración `0005_rbac_hardening.sql`

**Files:**
- Create: `supabase/migrations/0005_rbac_hardening.sql`

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Hardening RBAC: cierra los hallazgos de la auditoría de F1
-- (docs/IMPLEMENTATION-F1.md §4). Todos nacieron en 0002/0003 y eran latentes;
-- F2 (assignments) y F3 (posiciones, canje de código) los volvían explotables.

-- ---------------------------------------------------------------------------
-- H-1 — program_reaches_me no acotaba los assignments al coach del jugador.
--
-- Antes: un PLAYER del coach A con posición wing matcheaba el assignment
-- system_group_id='backs' de CUALQUIER programa de CUALQUIER coach, y
-- can_read_program le abría el árbol entero por PostgREST.
--
-- Ahora: solo alcanzan los programas de MI coach. Un assignment directo
-- (player_id) de un programa ajeno tampoco se honra: el dominio dice que un
-- jugador recibe programas de su coach, punto.
-- ---------------------------------------------------------------------------

create or replace function public.program_reaches_me(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.program_assignments a
    join public.programs pr on pr.id = a.program_id
    where a.program_id = target
      and pr.coach_id = public.my_coach_id()
      and (
        a.player_id = auth.uid()
        or a.position_id = public.my_position_id()
        or a.system_group_id = public.my_system_group_id()
        or a.position_group_id in (
             select gp.group_id from public.position_group_positions gp
             where gp.position_id = public.my_position_id()
           )
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- M-1 + L-2 — guard_profile_changes endurecido.
--
-- coach_id NUNCA llega del cliente. Solo dos caminos válidos:
--   1. redeem_invite_code(): valida el código y marca la transacción con un
--      flag local que este guard reconoce.
--   2. El coach del jugador lo DESVINCULA de su propio plantel (nunca lo
--      asigna a otro coach): old.coach_id = auth.uid() y new.coach_id null.
--
-- email tampoco se toca: profiles.email es un espejo de auth.users.email y
-- cambiarlo acá lo haría divergir de la identidad real. (Si algún día se
-- agrega cambio de email vía Supabase Auth, el sync usa el mismo patrón del
-- flag.)
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() es null cuando corre el seed o una migración con service_role.
  -- Ese camino es de confianza por definición y no pasa por acá con un usuario.
  if auth.uid() is null then
    return new;
  end if;

  if coalesce((select p.role = 'ADMIN' from public.profiles p where p.id = auth.uid()), false) then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'No se puede cambiar el rol del perfil';
  end if;

  if new.invite_code is distinct from old.invite_code then
    raise exception 'No se puede cambiar el código de invitación';
  end if;

  if new.coach_id is distinct from old.coach_id then
    if coalesce(current_setting('coachlab.redeem_invite', true), '') = 'on' then
      null; -- canje validado por redeem_invite_code()
    elsif old.coach_id = auth.uid() and new.coach_id is null then
      null; -- el coach saca a un jugador de SU plantel
    else
      raise exception 'El vínculo con el coach solo se cambia canjeando un código de invitación';
    end if;
  end if;

  if new.email is distinct from old.email then
    raise exception 'El email no se cambia desde el perfil';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- M-1 — redeem_invite_code: el único camino para vincularse a un coach.
--
-- SECURITY DEFINER: valida el código sin abrir profiles a la lectura, y setea
-- el flag transaction-local (set_config con is_local=true muere al terminar la
-- transacción) que guard_profile_changes exige para aceptar el cambio.
--
-- F3 la consume desde la pantalla de perfil del jugador sin vincular.
-- ---------------------------------------------------------------------------

create or replace function public.redeem_invite_code(code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select p.id into v_coach
  from public.profiles p
  where p.invite_code = upper(trim(code))
    and p.role = 'COACH';

  if v_coach is null then
    raise exception 'El código de invitación no existe';
  end if;

  perform set_config('coachlab.redeem_invite', 'on', true);

  update public.profiles
     set coach_id = v_coach
   where id = auth.uid()
     and role = 'PLAYER'
     and coach_id is null;

  if not found then
    raise exception 'Solo un jugador sin coach puede canjear un código';
  end if;

  perform set_config('coachlab.redeem_invite', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- L-1 — revocar los EXECUTE que el default de Postgres regala.
--
-- generate_invite_code: solo la usa handle_new_user, que es SECURITY DEFINER —
-- corre como el owner de la función, así que estos revokes no la afectan.
-- ---------------------------------------------------------------------------

revoke execute on function public.generate_invite_code() from public, anon, authenticated;

-- Helpers de RLS: ninguna política corre como anon (todas son "to authenticated").
revoke execute on function public.is_admin()               from public, anon;
revoke execute on function public.my_coach_id()            from public, anon;
revoke execute on function public.my_position_id()         from public, anon;
revoke execute on function public.my_system_group_id()     from public, anon;
revoke execute on function public.is_my_player(uuid)       from public, anon;
revoke execute on function public.owns_program(uuid)       from public, anon;
revoke execute on function public.program_reaches_me(uuid) from public, anon;
revoke execute on function public.can_read_program(uuid)   from public, anon;
revoke execute on function public.can_write_program(uuid)  from public, anon;

-- Los que NINGUNA política llama directo (solo se usan dentro de funciones
-- security definer, que corren como su owner) tampoco tienen por qué ser
-- oráculos de authenticated vía /rest/v1/rpc. Los que las políticas SÍ llaman
-- directo (is_admin, my_coach_id, is_my_player, can_read_program,
-- can_write_program) conservan EXECUTE de authenticated: se evalúan con los
-- privilegios del que consulta.
revoke execute on function public.my_position_id()         from authenticated;
revoke execute on function public.my_system_group_id()     from authenticated;
revoke execute on function public.owns_program(uuid)       from authenticated;
revoke execute on function public.program_reaches_me(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Cosmético de la auditoría: handle_new_user comparaba upper(v_invite) sin
-- trim, mientras coach_name_for_invite (0004) hace upper(trim(code)). Se
-- alinean. (La función se reemplaza entera; el único cambio es el trim.)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    public.user_role;
  v_name    text;
  v_invite  text;
  v_coach   uuid;
begin
  v_name := coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1));
  v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'PLAYER');

  -- CLAUDE.md §4: ADMIN no se autoregistra. Si alguien manda role=ADMIN en el
  -- signup, entra como jugador. Los admins se crean por seed o por consola.
  if v_role = 'ADMIN' then
    v_role := 'PLAYER';
  end if;

  if v_role = 'PLAYER' then
    v_invite := nullif(trim(new.raw_user_meta_data ->> 'invite_code'), '');
    if v_invite is not null then
      select p.id into v_coach
      from public.profiles p
      where p.invite_code = upper(v_invite) and p.role = 'COACH';
    end if;
  end if;

  insert into public.profiles (id, email, name, role, coach_id, invite_code)
  values (
    new.id,
    new.email,
    v_name,
    v_role,
    case when v_role = 'PLAYER' then v_coach else null end,
    case when v_role = 'COACH' then public.generate_invite_code() else null end
  );

  return new;
end;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0005_rbac_hardening.sql
git commit -m "fix(db): harden rbac - scope assignments to coach, lock coach_id/email, revoke rpc oracles"
```

---

### Task 2: Checks en vivo para los 4 fixes

Una política de RLS no la agarra ningún unit test — los "tests" de esta migración son checks
nuevos en `verify-setup.mjs` contra el proyecto real, con usuarios y sesiones de verdad.

**Files:**
- Modify: `scripts/verify-setup.mjs`

- [ ] **Step 1: Trackear programas creados para la limpieza**

El script hoy solo borra usuarios en el `finally`. Los checks de H-1 crean programas, y
`programs.coach_id` referencia `profiles`: hay que borrarlos ANTES que los usuarios. Junto a la
declaración existente de `const created = []`, agregar:

```js
const createdPrograms = []
```

Y el `finally` existente pasa de borrar solo usuarios a:

```js
} finally {
  if (createdPrograms.length > 0) {
    await admin.from('programs').delete().in('id', createdPrograms)
  }
  for (const id of created) await admin.auth.admin.deleteUser(id)
  console.log(`\nlimpieza: ${createdPrograms.length} programas y ${created.length} usuarios de prueba borrados`)
```

- [ ] **Step 2: Agregar los checks al final del bloque `try`**

Después del check existente `'RLS: un usuario autenticado sí ve el catálogo'` (usa `asPlayer` y
`playerId`, que ya existen en ese scope, igual que `coachId` y `coach`):

```js
  // --- 0005: oráculos revocados (L-1) -------------------------------------
  const { error: genErr } = await anonClient.rpc('generate_invite_code')
  check('anon no puede invocar generate_invite_code', !!genErr, genErr ? '' : 'PUDO — falta el revoke')

  const { error: oracleErr } = await asPlayer.rpc('program_reaches_me', {
    target: '00000000-0000-0000-0000-000000000000',
  })
  check('authenticated no usa program_reaches_me como oráculo', !!oracleErr, oracleErr ? '' : 'PUDO — falta el revoke')

  // --- 0005: autovínculo bloqueado y canje por RPC (M-1) ------------------
  const looseId = await makeUser('loose.test@coachlab.local', { name: 'Loose Test', role: 'PLAYER' })
  const asLoose = createClient(URL, ANON, { auth: { persistSession: false } })
  await asLoose.auth.signInWithPassword({
    email: 'loose.test@coachlab.local',
    password: 'TestPassw0rd!x9',
  })

  const { error: selfLink } = await asLoose.from('profiles').update({ coach_id: coachId }).eq('id', looseId)
  check('un jugador sin coach NO se autovincula por PATCH', !!selfLink, selfLink ? '' : 'PUDO — agujero M-1')

  const { error: badRedeem } = await asLoose.rpc('redeem_invite_code', { code: 'ZZZZZZ' })
  check('redeem_invite_code rechaza un código inexistente', !!badRedeem)

  const { error: redeemErr } = await asLoose.rpc('redeem_invite_code', { code: coach.invite_code })
  check('redeem_invite_code vincula con un código válido', !redeemErr, redeemErr?.message ?? '')

  const { data: loose } = await admin.from('profiles').select('coach_id').eq('id', looseId).single()
  check('el canje dejó el coach_id correcto', loose?.coach_id === coachId)

  const { error: reRedeem } = await asLoose.rpc('redeem_invite_code', { code: coach.invite_code })
  check('un jugador ya vinculado no puede volver a canjear', !!reRedeem)

  // --- 0005: email inmutable desde la tabla (L-2) -------------------------
  const { error: mailErr } = await asPlayer.from('profiles').update({ email: 'otro@x.com' }).eq('id', playerId)
  check('el guard frena el cambio de email', !!mailErr, mailErr ? '' : 'PUDO — divergencia con auth.users')

  // --- 0005: sin lectura cross-tenant de programas (H-1) ------------------
  const coach2Id = await makeUser('coach2.test@coachlab.local', { name: 'Coach Dos', role: 'COACH' })

  const { data: foreignProgram } = await admin
    .from('programs')
    .insert({ coach_id: coach2Id, name: 'Programa ajeno' })
    .select('id')
    .single()
  createdPrograms.push(foreignProgram.id)
  await admin.from('program_assignments').insert({ program_id: foreignProgram.id, system_group_id: 'backs' })
  await admin.from('profiles').update({ position_id: 'wing' }).eq('id', playerId)

  const { data: crossRead } = await asPlayer.from('programs').select('id').eq('id', foreignProgram.id)
  check(
    'H-1: un jugador NO ve programas de un coach ajeno aunque el assignment matchee',
    (crossRead ?? []).length === 0,
    `ve ${crossRead?.length ?? 0}`,
  )

  const { data: ownProgram } = await admin
    .from('programs')
    .insert({ coach_id: coachId, name: 'Programa propio' })
    .select('id')
    .single()
  createdPrograms.push(ownProgram.id)
  await admin.from('program_assignments').insert({ program_id: ownProgram.id, system_group_id: 'backs' })

  const { data: ownRead } = await asPlayer.from('programs').select('id').eq('id', ownProgram.id)
  check('...pero sí ve el de SU coach cuando el assignment lo alcanza', (ownRead ?? []).length === 1)
```

(Nota: `anonClient` existe desde los checks de 0004. `program_assignments` se borra en cascada
con el programa.)

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-setup.mjs
git commit -m "test(setup): add live checks for rbac hardening (0005)"
```

---

### Task 3: Aplicar y verificar en vivo

Credenciales: las mismas de `IMPLEMENTATION-F1.md` §5.

- [ ] **Step 1: Push de la migración**

```powershell
pnpm exec supabase db push --db-url "postgresql://postgres.hiceiurkvznfhujtjfar:<PASSWORD>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres" --include-all
```

Expected: `Applying migration 0005_rbac_hardening.sql...` (y 0004 antes, si no estaba aplicada).

- [ ] **Step 2: Regenerar tipos**

```powershell
$env:SUPABASE_ACCESS_TOKEN="sbp_..."
pnpm exec supabase gen types typescript --project-id hiceiurkvznfhujtjfar --schema public > packages/web/types/database.ts
```

Expected: `redeem_invite_code` aparece en `Functions`. Verificar:

```powershell
Select-String -Path packages\web\types\database.ts -Pattern 'redeem_invite_code'
```

- [ ] **Step 3: Correr la verificación completa**

```powershell
$env:SUPABASE_URL="https://hiceiurkvznfhujtjfar.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
$env:SUPABASE_ANON_KEY="sb_publishable_..."
pnpm verify:setup
```

Expected: **todos los checks OK** — los 20 de F0+F1 (nada de lo viejo se rompe: en particular
"PLAYER se vinculó al coach por invite code" y "pero sí puede cambiar su nombre" prueban que el
guard endurecido no frena los caminos legítimos) más los ~11 nuevos de la Task 2.

- [ ] **Step 4: Suite offline**

```powershell
pnpm typecheck; if ($?) { pnpm test }
```

Expected: verde (la migración no toca código TS; los tipos regenerados suman la RPC nueva).

- [ ] **Step 5: Commit de los tipos**

```bash
git add packages/web/types/database.ts
git commit -m "chore(web): regenerate db types with redeem_invite_code"
```

---

### Task 4: Cierre — docs y re-auditoría

- [ ] **Step 1: Actualizar `docs/IMPLEMENTATION-F1.md` §4**

Agregar una columna/nota de estado a la tabla de hallazgos: los 4 resueltos por
`0005_rbac_hardening.sql`, con fecha.

- [ ] **Step 2: Actualizar `CLAUDE.md` §3**

En "Reglas de negocio críticas", después del bloque del cálculo de carga, agregar:

```markdown
**Vínculo jugador↔coach**: nace en el signup (trigger `handle_new_user` con el invite code) y
después solo cambia por dos caminos: la RPC `redeem_invite_code` (jugador sin coach canjea un
código — es lo que consume la pantalla de perfil de F3) o el coach desvinculando a un jugador de
su propio plantel (`coach_id → null`). Un PATCH directo a `profiles.coach_id` está bloqueado por
trigger; `email`, `role` e `invite_code` también son inmutables desde la tabla.
```

- [ ] **Step 3: Re-auditar**

Dispatch de `rbac-auditor` sobre `supabase/migrations/` (0002–0005 como conjunto) y
`scripts/verify-setup.mjs`. Foco: que los 4 hallazgos estén efectivamente cerrados, que el flag
`coachlab.redeem_invite` no sea seteable por un cliente (no lo es: `set_config` no está expuesto
por PostgREST y el flag es transaction-local), y que los revokes no hayan roto ninguna política.

- [ ] **Step 4: Commit final**

```bash
git add docs CLAUDE.md
git commit -m "docs: record rbac hardening closure"
```

---

## Definición de terminado

- `pnpm verify:setup` en verde con los ~11 checks nuevos, sin romper ninguno de los 20 previos.
- Un jugador autenticado no puede: autovincularse por PATCH, cambiar su email por PATCH, leer un
  programa de un coach ajeno aunque un assignment matchee su posición.
- `redeem_invite_code` funciona (código válido vincula, inválido falla, re-canje falla) y es el
  camino que F3 va a consumir.
- `anon` no puede invocar `generate_invite_code`; `authenticated` no puede usar
  `program_reaches_me` como oráculo.
- `rbac-auditor` confirma los 4 hallazgos cerrados, sin hallazgos nuevos.
- `pnpm typecheck` y `pnpm test` en verde.

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

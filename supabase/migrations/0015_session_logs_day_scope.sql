-- La RLS de session_logs no scopeaba el día.
--
-- session_logs_write (0003) era solo `player_id = auth.uid()`. Es correcto en
-- cuanto a DE QUIÉN es el log, pero no dice nada de CONTRA QUÉ se registra: el
-- day_id podía ser de cualquier día de cualquier programa. Un jugador que el
-- coach reasignó seguía pudiendo escribir contra los días del programa viejo, y
-- una ruta nueva que escribiera session_logs sin pasar por assertOwnedDay no
-- tenía ninguna red debajo.
--
-- Es la misma clase de agujero que las tres pasadas de auditoría de F2
-- encontraron una y otra vez: un guard que solo vive en el código. CLAUDE.md §4
-- es explícito en que la capa 1 es la única que un bug de aplicación no puede
-- saltear, así que se cierra en la base ADEMÁS de en la API.

-- El programa al que pertenece un día. security definer para que la política no
-- dependa de que el actor pueda leer `days` por su cuenta.
--
-- Qué expone: dado el uuid de un día, el uuid de su programa. Los dos son uuids
-- opacos y no revelan datos de negocio.
create or replace function public.program_of_day(d uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select w.program_id
  from public.days dd
  join public.weeks w on w.id = dd.week_id
  where dd.id = d
$$;

-- `from public, anon`, NO solo `from anon`: Postgres otorga EXECUTE a PUBLIC al
-- crear una función, y revocar solo a anon deja ese grant en pie. Es la lección
-- de IMPLEMENTATION-F2.md §4.2, donde la forma incompleta se copió tres veces y
-- dejó tres RPCs alcanzables con la anon key.
revoke execute on function public.program_of_day(uuid) from public, anon;
grant  execute on function public.program_of_day(uuid) to authenticated;

-- Solo se endurece el WITH CHECK, no el USING:
--   * USING gobierna qué filas ves para modificar y BORRAR. Dejarlo abierto a
--     tus propios logs permite borrar los viejos y no bloquea un DELETE (que no
--     evalúa WITH CHECK).
--   * WITH CHECK gobierna la fila RESULTANTE de un INSERT/UPDATE: ahí es donde
--     el día tiene que ser de un programa que te alcance.
--
-- No aplica la trampa del 42501 de CLAUDE.md §3: esa muerde cuando un UPDATE
-- saca la fila del alcance de su política de SELECT, y acá session_logs_select
-- NO se toca, así que la fila resultante sigue visible para su dueño.
drop policy session_logs_write on public.session_logs;

create policy session_logs_write on public.session_logs for all to authenticated
  using (player_id = auth.uid())
  with check (
    player_id = auth.uid()
    and public.can_read_program(public.program_of_day(day_id))
  );

-- exercise_entries NO necesita cambios: su política de escritura ya exige que el
-- session_log_id sea de un log propio, y ese log ahora está scopeado por día.

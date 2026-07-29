-- El coach tiene que poder cargar el 1RM de su jugador, y no podía.
--
-- one_rms_write (0003) era `player_id = auth.uid() or is_admin()`, así que la
-- ficha del jugador en el panel del coach (F2) fallaba con RLS al guardar.
--
-- Es una inconsistencia de 0003, no una decisión: la tabla de al lado,
-- evaluations (el historial de tests), SÍ deja escribir al coach
-- (`is_my_player(player_id)`). Y el flujo real del producto es ese: el coach
-- toma los tests de fuerza en el gimnasio y los anota. El jugador también carga
-- los suyos desde su perfil en F3, por eso las dos partes tienen que poder.
--
-- Lo que NO cambia: el coach sigue sin poder tocar session_logs ni
-- exercise_entries. Lo que el jugador dijo que levantó es solo del jugador — si
-- el coach pudiera editarlo, se rompería el dato que da sentido al producto
-- (RPE objetivo vs. percibido).

drop policy one_rms_write on public.one_rms;

create policy one_rms_write on public.one_rms for all to authenticated
  using (player_id = auth.uid() or public.is_my_player(player_id) or public.is_admin())
  with check (player_id = auth.uid() or public.is_my_player(player_id) or public.is_admin());

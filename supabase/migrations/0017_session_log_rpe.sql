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

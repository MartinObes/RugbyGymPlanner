-- Cuarto modo de carga: una etiqueta de texto.
--
-- Las planillas reales del club (validadas el 2026-07-29 con dos libros de Excel
-- del preparador) usan cargas que no son un número ni un porcentaje:
--
--   p.corp        peso corporal
--   barra         solo la barra
--   m.band        mini band
--   60 . 120      dos ejercicios en una fila ("Cuadriceps 1p - 2p")
--
-- Mapearlas todas a NONE perdía información que el jugador necesita para saber
-- con qué hacer el ejercicio. Decisión del dueño del repo: etiqueta libre.
--
-- La etiqueta es CORTA y descriptiva, no un campo de notas: 24 caracteres
-- alcanzan para todo lo que aparece en las planillas y evita que se convierta en
-- el lugar donde termina cualquier texto.

alter domain public.load_type drop constraint load_type_check;

alter domain public.load_type add constraint load_type_check
  check (value in ('WEIGHT', 'PERCENTAGE', 'NONE', 'LABEL'));

alter table public.block_exercises
  add column load_label text check (length(load_label) between 1 and 24);

-- El CHECK de coherencia se rehace entero: ahora son cuatro modos y cada uno
-- exige exactamente sus columnas y prohíbe las de los otros. Es la garantía que
-- Zod espeja en blockExerciseSchema (CLAUDE.md §5).
alter table public.block_exercises
  drop constraint block_exercises_load_shape;

alter table public.block_exercises
  add constraint block_exercises_load_shape check (
    (load_type = 'WEIGHT'     and weight is not null and percentage is null     and load_label is null) or
    (load_type = 'PERCENTAGE' and percentage is not null and weight is null     and load_label is null) or
    (load_type = 'LABEL'      and load_label is not null and weight is null     and percentage is null) or
    (load_type = 'NONE'       and weight is null and percentage is null         and load_label is null)
  );

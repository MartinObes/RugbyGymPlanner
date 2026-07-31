-- El import venía descartando el nombre del bloque.
--
-- La columna B de la fila del bloque trae su nombre ("CIRCUITO CALENTAMIENTO",
-- "Fuerza tren inferior", "C 1") y parseCoachSheet lo tenía en la mano al crear
-- el ParsedBlock, pero no lo guardaba: blocks era (id, day_id, type, rounds,
-- order_index). El resultado es que la rutina del jugador no se podía leer como
-- la planilla, que es lo que F3.5 vino a arreglar.
--
-- Nullable a propósito: los bloques ya importados no tienen nombre, y un bloque
-- implícito —el que el parser abre cuando aparecen ejercicios sin fila de
-- bloque— tampoco. Un CIRCUIT sigue pudiendo rotularse solo por sus vueltas.

alter table public.blocks add column name text;

-- El largo va como CHECK además de en Zod (CLAUDE.md §5: Zod da el mensaje
-- lindo, la base da la garantía). btrim para que un nombre de espacios no cuente
-- como nombre.
alter table public.blocks
  add constraint blocks_name_len check (
    name is null or length(btrim(name)) between 1 and 60
  );

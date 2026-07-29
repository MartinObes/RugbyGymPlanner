import type {
  ParsedBlock,
  ParsedDay,
  ParsedExercise,
  ParsedProgram,
  ParsedWeek,
} from '../validators/parsedProgram'
import { normName } from './normName'

/**
 * Import de las planillas REALES del club.
 *
 * Formato validado el 2026-07-29 contra dos libros del preparador físico
 * (Book1.xlsx y Ms-Ap-Wi-Fb.xlsx, que no van al repo: tienen datos personales).
 * Reemplaza al formato inventado de `parseGrid`, que no servía para nada real.
 *
 * Estructura de una hoja de rutina:
 *
 *   A                B                          C   D        E       F   G ...
 *   ────────────────────────────────────────────────────────────────────────────
 *   GRUPO DE PUESTOS ·                          ·   ABRIL 13 al 19   ·   ABRIL 20…
 *   ·                SESION 1 - LUNES           ·   CIRCULO          ·   CHAMPAG…
 *   ·                5' BICICLETA               ·   kilos    repet   S   kilos …
 *   bloque 1         CIRCUITO CALENTAMIENTO     ·   2 vueltas            2 vuel…
 *   ·                Lagartijas pronos          ·   p.corp   10      ·   p.corp…
 *   ·                Pecho plano                ·   100      6       ·   110   …
 *
 * - Columna A: marcador de bloque (`bloque 1`, `bloque 2`, …).
 * - Columna B: nombre del bloque en su fila, y los ejercicios debajo.
 * - Cada semana ocupa un grupo de columnas (kilos, repet, S). Puede haber 1, 2 o 3,
 *   y **la primera columna varía**: con separadora arranca en D, sin separadora en C.
 *   Por eso los grupos se DETECTAN leyendo la fila de encabezados, no se asumen.
 * - Las vueltas del bloque están en la celda de kilos de cada semana y **pueden
 *   diferir entre semanas** (`3 VUELTAS` en la 1, `2 VUELTAS` en la 2).
 * - El mismo ejercicio lleva kilos y reps propios por semana: eso es la progresión.
 *
 * Cada columna de semana se convierte en UNA semana del programa (decisión del
 * dueño del repo), así que una hoja "14.15.16" produce tres semanas con los
 * mismos ejercicios y las cargas de cada una.
 */

type Cell = unknown

export type WeekColumnGroup = { load: number; reps: number }
export type WeekColumns = { headerRow: number; groups: WeekColumnGroup[] }

const text = (cell: Cell): string => (cell === null || cell === undefined ? '' : String(cell).trim())

const num = (cell: Cell): number | null => {
  const raw = text(cell).replace(',', '.')
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/** `bloque 1`, `BLOQUE 2`. */
const BLOCK_MARKER = /^bloque\b/
/** `SESION 1 - LUNES`, `SESION 2 - MIERCOLES 14/21`. */
const SESSION = /^sesion\s*(\d+)?\s*-?\s*(.*)$/
/** `3 VUELTAS`, `2 vueltas`. */
const ROUNDS = /(\d+)\s*vueltas?/

/**
 * Filas de la columna B que son rótulos, no ejercicios. Se comparan normalizadas
 * y por inclusión porque en las planillas vienen con variantes y sufijos.
 */
const NOT_EXERCISES = ['flexibilidad', 'movilidad', 'bicicleta', 'entrada en calor']

/**
 * Ubica los grupos de columnas de semana leyendo la fila que dice
 * `kilos | repet | S`. Es lo que hace al parser robusto a que la hoja tenga o no
 * columna separadora.
 */
export function findWeekColumns(rows: Cell[][]): WeekColumns | null {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 12); rowIndex++) {
    const row = rows[rowIndex] ?? []
    const groups: WeekColumnGroup[] = []

    for (let col = 0; col < row.length; col++) {
      if (normName(text(row[col])) !== 'kilos') continue
      // El encabezado de reps puede decir "repet", "reps" o "repeticiones".
      const next = normName(text(row[col + 1]))
      if (next.startsWith('rep')) groups.push({ load: col, reps: col + 1 })
    }

    if (groups.length > 0) return { headerRow: rowIndex, groups }
  }

  return null
}

/** Una hoja es de rutina si tiene la fila de encabezados de carga. */
export function isRoutineSheet(rows: Cell[][]): boolean {
  return rows.length > 0 && findWeekColumns(rows) !== null
}

/**
 * Los números de semana salen del nombre de la hoja: "14.15.16" → 14, 15, 16;
 * "Fuerza 1.2" → 1, 2; "29.30" → 29, 30. Si no hay números, se numera 1..n.
 */
function weekNames(sheetName: string, count: number): string[] {
  const numbers = (sheetName.match(/\d+/g) ?? []).map(Number)
  return Array.from({ length: count }, (_, index) => `Semana ${numbers[index] ?? index + 1}`)
}

/** "SESION 1 - LUNES" → "Sesión 1 - Lunes". */
function dayName(raw: string): string {
  const match = SESSION.exec(normName(raw))
  if (!match) return raw
  const [, number, rest] = match
  const titled = (rest ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
  const prefix = number ? `Sesión ${number}` : 'Sesión'
  return titled ? `${prefix} - ${titled}` : prefix
}

function isNotExercise(name: string): boolean {
  const normalized = normName(name)
  return NOT_EXERCISES.some((label) => normalized.includes(label))
}

/** Interpreta la celda de carga: número → kg, texto → etiqueta, vacío → sin carga. */
function loadFrom(cell: Cell): Pick<ParsedExercise, 'loadType' | 'weight' | 'percentage' | 'loadLabel'> {
  const raw = text(cell)
  if (!raw || raw === '-') {
    return { loadType: 'NONE', weight: null, percentage: null, loadLabel: null }
  }

  const value = num(cell)
  if (value !== null && value > 0 && value <= 500) {
    return { loadType: 'WEIGHT', weight: value, percentage: null, loadLabel: null }
  }

  // `p.corp`, `barra`, `m.band`, y también `60 . 120` de una fila doble: son dos
  // ejercicios en una, y por decisión del dueño del repo la fila se conserva
  // entera con la carga tal como está escrita.
  return { loadType: 'LABEL', weight: null, percentage: null, loadLabel: raw.slice(0, 24) }
}

export function parseCoachSheet(rows: Cell[][], sheetName: string): ParsedProgram {
  if (rows.length === 0) {
    return { weeks: [], issues: [{ row: 1, message: 'La hoja está vacía' }] }
  }

  const columns = findWeekColumns(rows)
  if (!columns) {
    return {
      weeks: [],
      issues: [
        {
          row: 1,
          message: `La hoja "${sheetName}" no tiene la fila de encabezados "kilos / repet": no parece una rutina`,
        },
      ],
    }
  }

  const issues: ParsedProgram['issues'] = []
  const names = weekNames(sheetName, columns.groups.length)

  // Una semana del programa por columna de semana. Se recorre la hoja una vez por
  // semana: es la lectura más simple y la hoja tiene decenas de filas, no miles.
  const weeks: ParsedWeek[] = columns.groups.map((group, weekIndex) => {
    const week: ParsedWeek = { name: names[weekIndex]!, days: [] }
    let day: ParsedDay | null = null
    let block: ParsedBlock | null = null

    // Se recorre desde la fila 0, no desde la de encabezados: la primera
    // "SESION n" suele estar ARRIBA de ella (fila 2 vs. fila 3). Empezar en el
    // encabezado hacía perder el nombre del primer día.
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      if (rowIndex === columns.headerRow) continue

      const row = rows[rowIndex] ?? []
      const marker = normName(text(row[0]))
      // La sesión aparece en B casi siempre, pero algunas hojas la ponen en A.
      const label = text(row[1]) || (SESSION.test(marker) ? text(row[0]) : '')

      // --- ¿arranca una sesión? ---
      if (SESSION.test(normName(label))) {
        day = { name: dayName(label), blocks: [] }
        week.days.push(day)
        block = null
        continue
      }

      // --- ¿arranca un bloque? ---
      //
      // Dos señales, y la segunda es la que importa: los sub-bloques de un día
      // (`C 1`, `C 2`, `C 3`) NO llevan `bloque n` en la columna A, solo las
      // vueltas en la celda de carga. Detectar solo por la columna A hacía que
      // esas filas entraran como ejercicios con carga "3 VUELTAS".
      const roundsHere = ROUNDS.exec(normName(text(row[group.load])))
      if (BLOCK_MARKER.test(marker) || roundsHere) {
        if (!day) {
          // Algunas hojas ponen la sesión en la columna A de la fila 3 y el
          // bloque aparece antes de cualquier "SESION": se abre un día implícito.
          day = { name: 'Sesión 1', blocks: [] }
          week.days.push(day)
        }
        block = roundsHere
          ? { type: 'CIRCUIT', rounds: Number(roundsHere[1]), exercises: [] }
          : { type: 'SINGLE', rounds: null, exercises: [] }
        day.blocks.push(block)
        continue
      }

      // --- ¿es un ejercicio? ---
      if (!label || label.length < 2 || isNotExercise(label)) continue
      if (!day) continue

      if (!block) {
        block = { type: 'SINGLE', rounds: null, exercises: [] }
        day.blocks.push(block)
      }

      const reps = text(row[group.reps])
      const exercise: ParsedExercise = {
        exerciseName: label.slice(0, 120),
        // Las planillas dejan la columna S vacía: las vueltas del bloque hacen
        // ese papel. 1 serie es el default honesto — el coach lo ajusta en el
        // editor si hace falta.
        sets: 1,
        reps: (reps || '1').slice(0, 20),
        ...loadFrom(row[group.load]),
        targetRpe: null,
      }

      // Una fila sin carga NI reps en esta semana es un rótulo que quedó suelto
      // (por ejemplo el nombre de un circuito repetido), no un ejercicio.
      if (exercise.loadType === 'NONE' && !reps) continue

      block.exercises.push(exercise)
    }

    // Días y bloques que quedaron sin nada: la semana no los necesita.
    week.days = week.days
      .map((d) => ({ ...d, blocks: d.blocks.filter((b) => b.exercises.length > 0) }))
      .filter((d) => d.blocks.length > 0)

    if (week.days.length === 0) {
      issues.push({ row: 1, message: `${week.name}: no se encontró ningún ejercicio` })
    }

    return week
  })

  return { weeks: weeks.filter((w) => w.days.length > 0), issues }
}

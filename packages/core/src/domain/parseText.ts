import type { ParsedBlock, ParsedDay, ParsedExercise, ParsedProgram, ParsedWeek } from '../validators/parsedProgram'
import { normName } from './normName'

/**
 * Import de un programa desde texto pegado.
 *
 * ⚠ FORMATO ASUMIDO: `coach.html` no está en el repo, así que este formato es
 * una suposición razonable, no la especificación validada. El contrato de tipos
 * (ParsedProgram) y la firma no van a cambiar; el formato de entrada sí puede.
 * Ver la advertencia del plan de F2.
 *
 * Formato:
 *
 *   Semana 1
 *   Día 1
 *   # Bloque circuito x3
 *   Press Banca 4x5 @80% RPE8
 *   Remo con Barra 3x10 @60kg
 *   Plancha 3x30s
 *
 * - `Semana N` / `Día N` (o `Dia N`) abren sección.
 * - Una línea que empieza con `#` abre bloque; con `x<n>` es circuito de n vueltas.
 * - El resto es `<nombre> <sets>x<reps> [@carga] [RPE<n>]`.
 */

/** `4x5`, `3x8-10`, `3x30s`. El nombre es todo lo que viene antes. */
const EXERCISE_RE = /^(.+?)\s+(\d+)\s*[xX]\s*([^\s@]+)(.*)$/
const LOAD_RE = /@\s*(\d+(?:[.,]\d+)?)\s*(%|kg|kilos?)?/i
const RPE_RE = /RPE\s*(\d+(?:[.,]\d+)?)/i
const ROUNDS_RE = /[xX]\s*(\d+)\s*$/

const toNumber = (raw: string): number => Number(raw.replace(',', '.'))

export function parseText(input: string): ParsedProgram {
  const weeks: ParsedWeek[] = []
  const issues: ParsedProgram['issues'] = []

  let week: ParsedWeek | null = null
  let day: ParsedDay | null = null
  let block: ParsedBlock | null = null

  const lines = input.split(/\r?\n/)

  lines.forEach((rawLine, index) => {
    const row = index + 1
    const line = rawLine.trim()
    if (!line) return

    const normalized = normName(line)

    // --- Semana N ---
    const weekMatch = /^semana\b\s*(.*)$/.exec(normalized)
    if (weekMatch) {
      week = { name: line, days: [] }
      weeks.push(week)
      day = null
      block = null
      return
    }

    // --- Día N (con o sin tilde) ---
    const dayMatch = /^dia\b\s*(.*)$/.exec(normalized)
    if (dayMatch) {
      if (!week) {
        issues.push({ row, message: 'Hay un día antes de la primera Semana' })
        return
      }
      // Se normaliza a "Día" con tilde para que la UI sea consistente aunque el
      // coach lo haya escrito sin ella.
      const suffix = dayMatch[1]?.trim() ?? ''
      day = { name: suffix ? `Día ${suffix}` : 'Día', blocks: [] }
      week.days.push(day)
      block = null
      return
    }

    // --- # bloque ---
    if (line.startsWith('#')) {
      if (!week) {
        issues.push({ row, message: 'Hay un bloque antes de la primera Semana' })
        return
      }
      if (!day) {
        day = { name: 'Día 1', blocks: [] }
        week.days.push(day)
      }
      const header = line.slice(1).trim()
      const rounds = ROUNDS_RE.exec(header)
      block = rounds
        ? { type: 'CIRCUIT', rounds: Number(rounds[1]), exercises: [] }
        : { type: 'SINGLE', rounds: null, exercises: [] }
      day.blocks.push(block)
      return
    }

    // --- ejercicio ---
    if (!week) {
      issues.push({ row, message: 'Hay un ejercicio antes de la primera Semana' })
      return
    }

    const match = EXERCISE_RE.exec(line)
    if (!match) {
      issues.push({ row, message: `No se entendió "${line}": falta el formato <series>x<reps>` })
      return
    }

    const [, name, setsRaw, reps, rest = ''] = match
    const exercise: ParsedExercise = {
      exerciseName: name!.trim(),
      sets: Number(setsRaw),
      reps: reps!.trim(),
      loadType: 'NONE',
      weight: null,
      percentage: null,
      // El formato de texto no expresa cargas con etiqueta: eso viene de las
      // planillas del club y lo maneja parseCoachSheet.
      loadLabel: null,
      targetRpe: null,
    }

    const load = LOAD_RE.exec(rest)
    if (load) {
      const value = toNumber(load[1]!)
      const unit = load[2]?.toLowerCase() ?? '%'
      if (unit === '%') {
        if (!Number.isInteger(value) || value < 1 || value > 100) {
          issues.push({ row, message: `El porcentaje de "${exercise.exerciseName}" tiene que estar entre 1 y 100` })
          return
        }
        exercise.loadType = 'PERCENTAGE'
        exercise.percentage = value
      } else {
        if (value <= 0 || value > 500) {
          issues.push({ row, message: `Los kg de "${exercise.exerciseName}" están fuera de rango` })
          return
        }
        exercise.loadType = 'WEIGHT'
        exercise.weight = value
      }
    }

    const rpe = RPE_RE.exec(rest)
    if (rpe) {
      const value = toNumber(rpe[1]!)
      if (value >= 1 && value <= 10) exercise.targetRpe = value
      else issues.push({ row, message: `El RPE de "${exercise.exerciseName}" tiene que estar entre 1 y 10` })
    }

    if (exercise.sets < 1 || exercise.sets > 20) {
      issues.push({ row, message: `Las series de "${exercise.exerciseName}" tienen que estar entre 1 y 20` })
      return
    }

    // Un ejercicio suelto abre día y bloque implícitos: el coach no tiene por
    // qué escribir encabezados si su programa es una sola lista.
    if (!day) {
      day = { name: 'Día 1', blocks: [] }
      week.days.push(day)
      block = null
    }
    if (!block) {
      block = { type: 'SINGLE', rounds: null, exercises: [] }
      day.blocks.push(block)
    }

    block.exercises.push(exercise)
  })

  return { weeks, issues }
}

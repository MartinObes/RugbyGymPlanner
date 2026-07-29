import type { ParsedBlock, ParsedDay, ParsedExercise, ParsedProgram, ParsedWeek } from '../validators/parsedProgram'
import { normName } from './normName'

/**
 * Import de un programa desde una planilla.
 *
 * ⚠ FORMATO ASUMIDO — igual que parseText: `coach.html` no está en el repo.
 *
 * Recibe la matriz cruda que devuelve
 * `XLSX.utils.sheet_to_json(sheet, { header: 1 })`, así queda PURA y testeable
 * sin archivos: SheetJS vive solo en el frontend.
 *
 * Primera fila = encabezados, reconocidos con normName (tolerante a acentos y
 * mayúsculas) y en cualquier orden:
 *   semana | dia | bloque | vueltas | ejercicio | series | reps | carga | rpe
 *
 * `carga`: "80%" → PERCENTAGE 80; "100" o "100kg" → WEIGHT 100; vacío o "-" → NONE.
 */

type Cell = unknown

const COLUMNS = ['semana', 'dia', 'bloque', 'vueltas', 'ejercicio', 'series', 'reps', 'carga', 'rpe'] as const
type Column = (typeof COLUMNS)[number]

const text = (cell: Cell): string => {
  if (cell === null || cell === undefined) return ''
  return String(cell).trim()
}

const toNumber = (cell: Cell): number | null => {
  const raw = text(cell).replace(',', '.')
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function parseGrid(rows: Cell[][]): ParsedProgram {
  const issues: ParsedProgram['issues'] = []
  const [headerRow, ...bodyRows] = rows

  if (!headerRow) return { weeks: [], issues: [] }

  // Encabezado → índice de columna. normName hace que "Día", "DIA" y "dia"
  // sean la misma columna.
  const index = {} as Record<Column, number>
  for (const column of COLUMNS) index[column] = -1

  headerRow.forEach((cell, columnIndex) => {
    const key = normName(text(cell)) as Column
    if (COLUMNS.includes(key) && index[key] === -1) index[key] = columnIndex
  })

  if (index.ejercicio === -1) {
    issues.push({ row: 1, message: 'Falta la columna "ejercicio": sin eso no se puede importar nada' })
    return { weeks: [], issues }
  }

  const weeks: ParsedWeek[] = []
  const weekByName = new Map<string, ParsedWeek>()
  const dayByKey = new Map<string, ParsedDay>()
  const blockByKey = new Map<string, ParsedBlock>()

  const cellAt = (row: Cell[], column: Column): Cell =>
    index[column] === -1 ? null : row[index[column]]

  bodyRows.forEach((row, bodyIndex) => {
    const rowNumber = bodyIndex + 2 // +1 por el encabezado, +1 porque es 1-based

    // Fila completamente vacía: no es un error, es formato de planilla.
    if (!row || row.every((cell) => text(cell) === '')) return

    const exerciseName = text(cellAt(row, 'ejercicio'))
    if (!exerciseName) {
      issues.push({ row: rowNumber, message: 'La fila no tiene ejercicio' })
      return
    }
    if (exerciseName.length < 2) {
      issues.push({ row: rowNumber, message: `"${exerciseName}" es un nombre de ejercicio demasiado corto` })
      return
    }

    const sets = toNumber(cellAt(row, 'series')) ?? 1
    if (!Number.isInteger(sets) || sets < 1 || sets > 20) {
      issues.push({ row: rowNumber, message: `Las series de "${exerciseName}" tienen que estar entre 1 y 20` })
      return
    }

    const reps = text(cellAt(row, 'reps')) || '1'
    if (reps.length > 20) {
      issues.push({ row: rowNumber, message: `Las repeticiones de "${exerciseName}" son demasiado largas` })
      return
    }

    const exercise: ParsedExercise = {
      exerciseName,
      sets,
      reps,
      loadType: 'NONE',
      weight: null,
      percentage: null,
      targetRpe: null,
    }

    // --- carga ---
    const loadRaw = text(cellAt(row, 'carga'))
    if (loadRaw && loadRaw !== '-') {
      const isPercentage = loadRaw.includes('%')
      const value = toNumber(loadRaw.replace(/[%]/g, '').replace(/kilos?|kg/gi, ''))

      if (value === null) {
        issues.push({ row: rowNumber, message: `No se entendió la carga "${loadRaw}" de "${exerciseName}"` })
        return
      }

      if (isPercentage) {
        if (!Number.isInteger(value) || value < 1 || value > 100) {
          issues.push({ row: rowNumber, message: `El porcentaje de "${exerciseName}" tiene que estar entre 1 y 100` })
          return
        }
        exercise.loadType = 'PERCENTAGE'
        exercise.percentage = value
      } else {
        if (value <= 0 || value > 500) {
          issues.push({ row: rowNumber, message: `Los kg de "${exerciseName}" están fuera de rango` })
          return
        }
        exercise.loadType = 'WEIGHT'
        exercise.weight = value
      }
    }

    // --- rpe ---
    const rpe = toNumber(cellAt(row, 'rpe'))
    if (rpe !== null) {
      if (rpe < 1 || rpe > 10) {
        issues.push({ row: rowNumber, message: `El RPE de "${exerciseName}" tiene que estar entre 1 y 10` })
        return
      }
      exercise.targetRpe = rpe
    }

    // --- ubicar en el árbol ---
    const weekName = text(cellAt(row, 'semana')) || 'Semana 1'
    let week = weekByName.get(weekName)
    if (!week) {
      week = { name: weekName, days: [] }
      weekByName.set(weekName, week)
      weeks.push(week)
    }

    const dayName = text(cellAt(row, 'dia')) || 'Día 1'
    const dayKey = `${weekName}::${dayName}`
    let day = dayByKey.get(dayKey)
    if (!day) {
      day = { name: dayName, blocks: [] }
      dayByKey.set(dayKey, day)
      week.days.push(day)
    }

    const blockName = text(cellAt(row, 'bloque'))
    const rounds = toNumber(cellAt(row, 'vueltas'))
    // Sin nombre de bloque, todas las filas del día caen en el mismo bloque.
    const blockKey = `${dayKey}::${blockName}::${rounds ?? ''}`
    let block = blockByKey.get(blockKey)
    if (!block) {
      block =
        rounds !== null && rounds >= 1
          ? { type: 'CIRCUIT', rounds: Math.trunc(rounds), exercises: [] }
          : { type: 'SINGLE', rounds: null, exercises: [] }
      blockByKey.set(blockKey, block)
      day.blocks.push(block)
    }

    block.exercises.push(exercise)
  })

  return { weeks, issues }
}

import { describe, expect, it } from 'vitest'
import { parsePlannedReps } from './plannedReps'

describe('parsePlannedReps', () => {
  it('devuelve el número cuando las reps son un número solo', () => {
    expect(parsePlannedReps('10')).toBe(10)
  })

  it('de un rango devuelve el PISO, no el techo', () => {
    // "8-10" es "al menos 8, hasta 10". Sugerir 10 empuja al jugador al tope que
    // el coach puso como límite, no como objetivo.
    expect(parsePlannedReps('8-10')).toBe(8)
    expect(parsePlannedReps('8/10')).toBe(8)
    expect(parsePlannedReps('8 a 10')).toBe(8)
  })

  it('sin ningún número devuelve null en vez de inventar uno', () => {
    // El punto de "máx" es que llegue hasta donde llegue: sugerirle un número
    // sería contradecir el ejercicio.
    expect(parsePlannedReps('máx')).toBeNull()
    expect(parsePlannedReps('AMRAP')).toBeNull()
    expect(parsePlannedReps('al fallo')).toBeNull()
  })

  it('trata la ausencia y el vacío como sin dato', () => {
    expect(parsePlannedReps(null)).toBeNull()
    expect(parsePlannedReps(undefined)).toBeNull()
    expect(parsePlannedReps('')).toBeNull()
  })

  it('descarta el 0 porque no es un punto de partida', () => {
    expect(parsePlannedReps('0')).toBeNull()
  })

  it('ignora los decimales y toma sólo la parte entera del primer número', () => {
    // No existen las 2,5 repeticiones. "1.ª serie" no debe devolver 1 como reps
    // por accidente… pero sí lo hace, y es aceptable: el número es una SUGERENCIA
    // en gris que el jugador pisa escribiendo. Se documenta el comportamiento en
    // vez de complicar el parser.
    expect(parsePlannedReps('12.5')).toBe(12)
  })

  it('encuentra el número aunque venga después de texto', () => {
    expect(parsePlannedReps('máx 15')).toBe(15)
  })
})

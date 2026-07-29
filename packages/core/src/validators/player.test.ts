import { describe, expect, it } from 'vitest'
import { oneRmSchema, playerProfileSchema } from './player'

describe('playerProfileSchema', () => {
  it('acepta puesto, altura y peso', () => {
    expect(
      playerProfileSchema.safeParse({ positionId: 'wing', heightCm: 182, weightKg: 88.5 }).success,
    ).toBe(true)
  })

  it('acepta null para limpiar un campo', () => {
    expect(
      playerProfileSchema.safeParse({ positionId: null, heightCm: null, weightKg: null }).success,
    ).toBe(true)
  })

  it('rechaza un puesto inventado', () => {
    expect(playerProfileSchema.safeParse({ positionId: 'hooker' }).success).toBe(false)
  })

  it('rechaza altura y peso fuera de rango', () => {
    expect(playerProfileSchema.safeParse({ heightCm: 90 }).success).toBe(false)
    expect(playerProfileSchema.safeParse({ heightCm: 260 }).success).toBe(false)
    expect(playerProfileSchema.safeParse({ weightKg: 20 }).success).toBe(false)
    expect(playerProfileSchema.safeParse({ weightKg: 300 }).success).toBe(false)
  })

  it('IGNORA role, coachId, email e inviteCode si vienen en el body', () => {
    // Es la defensa contra una escalada de privilegios por spread del body: el
    // perfil vive en la misma tabla que el rol.
    const parsed = playerProfileSchema.parse({
      positionId: 'wing',
      role: 'ADMIN',
      coachId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'otro@x.com',
      inviteCode: 'ABC234',
    })
    expect(parsed).toEqual({ positionId: 'wing' })
    expect('role' in parsed).toBe(false)
    expect('coachId' in parsed).toBe(false)
  })
})

describe('oneRmSchema', () => {
  const exerciseId = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

  it('acepta ejercicio y kg', () => {
    expect(oneRmSchema.safeParse({ exerciseId, kg: 140 }).success).toBe(true)
  })

  it('rechaza kg 0 o negativo', () => {
    expect(oneRmSchema.safeParse({ exerciseId, kg: 0 }).success).toBe(false)
    expect(oneRmSchema.safeParse({ exerciseId, kg: -5 }).success).toBe(false)
  })

  it('acepta medio kilo', () => {
    expect(oneRmSchema.safeParse({ exerciseId, kg: 82.5 }).success).toBe(true)
  })

  it('rechaza un ejercicio que no es uuid', () => {
    expect(oneRmSchema.safeParse({ exerciseId: 'press-banca', kg: 100 }).success).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { changePasswordSchema, loginSchema, registerSchema, sessionUserSchema } from './auth'

const validCoach = {
  name: 'Ana Pérez',
  email: 'ana@club.uy',
  password: 'unaclavelarga',
  role: 'COACH' as const,
}

describe('registerSchema', () => {
  it('acepta un coach sin invite code', () => {
    expect(registerSchema.safeParse(validCoach).success).toBe(true)
  })

  it('normaliza el email a minúsculas y sin espacios', () => {
    expect(registerSchema.parse({ ...validCoach, email: ' Ana@Club.UY ' }).email).toBe('ana@club.uy')
  })

  it('rechaza contraseña de menos de 8 caracteres', () => {
    expect(registerSchema.safeParse({ ...validCoach, password: 'corta12' }).success).toBe(false)
  })

  it('exige invite code cuando el rol es PLAYER', () => {
    const result = registerSchema.safeParse({ ...validCoach, role: 'PLAYER', inviteCode: '' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['inviteCode'])
  })

  it('acepta un jugador con invite code y lo normaliza', () => {
    const result = registerSchema.parse({ ...validCoach, role: 'PLAYER', inviteCode: ' abc234 ' })
    expect(result.inviteCode).toBe('ABC234')
  })

  it('rechaza un invite code con caracteres ambiguos si el rol es PLAYER', () => {
    expect(
      registerSchema.safeParse({ ...validCoach, role: 'PLAYER', inviteCode: 'ABC01O' }).success,
    ).toBe(false)
  })

  it('no permite registrarse como ADMIN', () => {
    expect(registerSchema.safeParse({ ...validCoach, role: 'ADMIN' }).success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('acepta email y contraseña', () => {
    expect(loginSchema.safeParse({ email: 'ana@club.uy', password: 'x' }).success).toBe(true)
  })

  it('rechaza email inválido', () => {
    expect(loginSchema.safeParse({ email: 'no-es-mail', password: 'x' }).success).toBe(false)
  })
})

describe('sessionUserSchema', () => {
  it('modela al usuario con rol, invite code y coach nullable', () => {
    const parsed = sessionUserSchema.parse({
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'ana@club.uy',
      name: 'Ana',
      role: 'COACH',
      inviteCode: 'ABC234',
      coachId: null,
    })
    expect(parsed.role).toBe('COACH')
  })
})

describe('changePasswordSchema', () => {
  const valid = { current: 'vieja123', next: 'nueva1234', confirm: 'nueva1234' }

  it('acepta un cambio válido', () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true)
  })

  it('exige la contraseña actual', () => {
    expect(changePasswordSchema.safeParse({ ...valid, current: '' }).success).toBe(false)
  })

  it('exige mínimo 8 en la nueva', () => {
    const result = changePasswordSchema.safeParse({ ...valid, next: 'corta', confirm: 'corta' })
    expect(result.success).toBe(false)
  })

  it('exige que las dos nuevas coincidan', () => {
    const result = changePasswordSchema.safeParse({ ...valid, confirm: 'otra12345' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]!.path).toEqual(['confirm'])
    }
  })

  it('exige que la nueva sea distinta de la actual', () => {
    const result = changePasswordSchema.safeParse({
      current: 'misma1234',
      next: 'misma1234',
      confirm: 'misma1234',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]!.path).toEqual(['next'])
    }
  })
})

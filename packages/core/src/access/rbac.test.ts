import { describe, expect, it } from 'vitest'
import { NotFoundError, UnauthorizedError, hasRole } from './rbac'

const coach = { role: 'COACH' as const }
const player = { role: 'PLAYER' as const }
const admin = { role: 'ADMIN' as const }

describe('hasRole', () => {
  it('acepta el rol exacto', () => {
    expect(hasRole(coach, ['COACH'])).toBe(true)
  })

  it('rechaza un rol distinto', () => {
    expect(hasRole(player, ['COACH'])).toBe(false)
  })

  it('acepta cualquiera de la lista', () => {
    expect(hasRole(player, ['COACH', 'PLAYER'])).toBe(true)
  })

  it('rechaza actor nulo', () => {
    expect(hasRole(null, ['COACH'])).toBe(false)
  })

  it('ADMIN no hereda roles: si una ruta lo admite, tiene que listarlo', () => {
    expect(hasRole(admin, ['COACH'])).toBe(false)
    expect(hasRole(admin, ['COACH', 'ADMIN'])).toBe(true)
  })
})

describe('errores de dominio', () => {
  it('NotFoundError y UnauthorizedError son distinguibles por instancia', () => {
    expect(new NotFoundError()).toBeInstanceOf(NotFoundError)
    expect(new UnauthorizedError()).toBeInstanceOf(UnauthorizedError)
    expect(new NotFoundError()).not.toBeInstanceOf(UnauthorizedError)
  })
})

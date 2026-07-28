import { describe, expect, it } from 'vitest'
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  isValidInviteCode,
  normalizeInviteCode,
} from './inviteCode'

describe('INVITE_CODE_ALPHABET', () => {
  it('excluye caracteres ambiguos (0/O, 1/I/L)', () => {
    for (const char of '01OIL') expect(INVITE_CODE_ALPHABET).not.toContain(char)
  })

  it('tiene 31 caracteres, como el alfabeto de generate_invite_code() en SQL', () => {
    expect(INVITE_CODE_ALPHABET).toHaveLength(31)
    expect(INVITE_CODE_LENGTH).toBe(6)
  })
})

describe('normalizeInviteCode', () => {
  it('recorta espacios y pasa a mayúsculas', () => {
    expect(normalizeInviteCode('  abc234 ')).toBe('ABC234')
  })
})

describe('isValidInviteCode', () => {
  it('acepta un código válido', () => {
    expect(isValidInviteCode('ABC234')).toBe(true)
  })

  it('acepta minúsculas y espacios alrededor (se normalizan)', () => {
    expect(isValidInviteCode(' abc234 ')).toBe(true)
  })

  it('rechaza largo incorrecto', () => {
    expect(isValidInviteCode('ABC23')).toBe(false)
    expect(isValidInviteCode('ABC2345')).toBe(false)
    expect(isValidInviteCode('')).toBe(false)
  })

  it('rechaza caracteres fuera del alfabeto', () => {
    expect(isValidInviteCode('ABC01O')).toBe(false)
    expect(isValidInviteCode('ABC-34')).toBe(false)
  })
})

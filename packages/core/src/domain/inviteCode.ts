/**
 * Validación del código de invitación del coach.
 *
 * La GENERACIÓN vive en la base: public.generate_invite_code()
 * (supabase/migrations/0002_auth_and_profile_guards.sql). Este alfabeto tiene
 * que coincidir con el de esa función — sin 0/O ni 1/I/L, porque el código se
 * dicta en voz alta en un vestuario y por WhatsApp.
 */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export const INVITE_CODE_LENGTH = 6

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase()
}

export function isValidInviteCode(raw: string): boolean {
  const code = normalizeInviteCode(raw)
  if (code.length !== INVITE_CODE_LENGTH) return false
  return [...code].every((char) => INVITE_CODE_ALPHABET.includes(char))
}

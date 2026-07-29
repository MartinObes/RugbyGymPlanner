import { z } from 'zod'
import { isValidInviteCode, normalizeInviteCode } from '../domain/inviteCode'

export const roleSchema = z.enum(['PLAYER', 'COACH', 'ADMIN'])

export type Role = z.infer<typeof roleSchema>

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Poné tu nombre (mínimo 2 letras)').max(80),
    email: z.string().trim().toLowerCase().email('Email inválido'),
    password: z.string().min(8, 'Mínimo 8 caracteres').max(200),
    // ADMIN queda afuera a propósito: solo por seed o consola (CLAUDE.md §4).
    // El trigger handle_new_user además degrada a PLAYER cualquier intento.
    role: z.enum(['COACH', 'PLAYER']),
    inviteCode: z.string().transform(normalizeInviteCode).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role !== 'PLAYER') return
    if (!data.inviteCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inviteCode'],
        message: 'Necesitás el código de tu entrenador',
      })
    } else if (!isValidInviteCode(data.inviteCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inviteCode'],
        message: 'El código tiene 6 letras o números, sin 0, O, 1, I ni L',
      })
    }
  })

export type RegisterInput = z.infer<typeof registerSchema>

/** Lo que /api/auth/me devuelve y lo que el shell de Nuxt necesita para renderizar por rol. */
export const sessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  inviteCode: z.string().nullable(),
  coachId: z.string().uuid().nullable(),
})

export type SessionUser = z.infer<typeof sessionUserSchema>

/**
 * Cambio de la contraseña PROPIA (docs/IMPLEMENTATION-F2.md §5.5 A).
 *
 * No necesita ruta en la API: Supabase Auth deja que una sesión válida cambie su
 * propia contraseña desde el cliente. `current` se pide porque updateUser NO la
 * exige, y sin eso cualquiera con el dispositivo desbloqueado cambia la clave.
 */
export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Ingresá tu contraseña actual'),
    // Misma regla que registerSchema: una sola fuente para el mínimo.
    next: z.string().min(8, 'Mínimo 8 caracteres').max(200),
    confirm: z.string().min(1, 'Repetí la contraseña nueva'),
  })
  .superRefine((data, ctx) => {
    if (data.next !== data.confirm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirm'],
        message: 'Las dos contraseñas nuevas no coinciden',
      })
    }
    if (data.next === data.current) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['next'],
        message: 'La nueva tiene que ser distinta de la actual',
      })
    }
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

/** Marcas diacríticas combinantes (Unicode Combining Diacritical Marks). */
const COMBINING_MARKS = /[̀-ͯ]/g

/** U+0303 sobre una n es la ñ, no un acento: hay que preservarla. */
const COMBINING_TILDE = '̃'

/**
 * Normaliza un nombre de ejercicio para matching tolerante.
 * Minúsculas, sin acentos, espacios colapsados. La ñ se preserva.
 * Portado de `normName` del prototipo coach.html.
 */
export function normName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(COMBINING_MARKS, (match, offset: number, full: string) => {
      // Se compara en minúsculas para que "AÑO" conserve la ñ igual que "año".
      const previous = full[offset - 1]?.toLowerCase()
      return match === COMBINING_TILDE && previous === 'n' ? match : ''
    })
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

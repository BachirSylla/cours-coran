import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Concatène des classes conditionnelles puis résout les conflits Tailwind
 * (la dernière classe d'un même groupe l'emporte).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

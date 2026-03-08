import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert a Date to YYYY-MM-DD string using LOCAL timezone components.
 *
 * IMPORTANT: Do NOT use `date.toISOString().split('T')[0]` for date-only strings!
 * toISOString() converts to UTC first, which shifts the date back by 1 day
 * for UTC+1/UTC+2 timezones (France) when the time is midnight local.
 *
 * Example: User picks March 10 → Date = March 10 00:00:00 CET
 *   toISOString() → "2026-03-09T23:00:00.000Z" → split('T')[0] → "2026-03-09" ❌
 *   toLocalDateString() → "2026-03-10" ✅
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

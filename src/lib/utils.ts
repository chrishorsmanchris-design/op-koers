import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuur(minuten: number): string {
  const u = Math.floor(minuten / 60)
  const m = minuten % 60
  if (u === 0) return `${m}min`
  if (m === 0) return `${u}u`
  return `${u}u ${m}min`
}

export function formatTijd(tijd: string): string {
  // tijd format: "HH:MM:SS" of "H:MM:SS"
  return tijd
}

export function datumNaarNederlands(datum: Date | string): string {
  const d = typeof datum === 'string' ? new Date(datum) : datum
  return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function korteDatum(datum: Date | string): string {
  const d = typeof datum === 'string' ? new Date(datum) : datum
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

export function dagKorteDatum(datum: Date | string): string {
  const d = typeof datum === 'string' ? new Date(datum + 'T12:00:00') : datum
  const dag = d.toLocaleDateString('nl-NL', { weekday: 'short' })
  const datumStr = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  return `${dag.charAt(0).toUpperCase() + dag.slice(1)} ${datumStr}`
}

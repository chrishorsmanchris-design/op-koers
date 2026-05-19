export interface HartslagZone {
  id: number
  naam: string        // e.g. "Z2 Aerobisch"
  kortNaam: string    // e.g. "Z2"
  min: number         // fraction of maxHR, e.g. 0.60
  max: number         // fraction of maxHR, e.g. 0.70
  kleur: string
  intensiteit: string // matching intensiteit value
  omschrijving: string // short Dutch description
}

export const HARTSLAG_ZONES: HartslagZone[] = [
  { id: 1, naam: 'Z1 Herstel', kortNaam: 'Z1', min: 0.50, max: 0.60, kleur: '#3b82f6', intensiteit: 'herstel', omschrijving: 'Zeer rustig, herstel' },
  { id: 2, naam: 'Z2 Aerobisch', kortNaam: 'Z2', min: 0.60, max: 0.70, kleur: '#22c55e', intensiteit: 'makkelijk', omschrijving: 'Aërobe basis, duurlopen' },
  { id: 3, naam: 'Z3 Tempo', kortNaam: 'Z3', min: 0.70, max: 0.80, kleur: '#eab308', intensiteit: 'gemiddeld', omschrijving: 'Comfortabel zwaar' },
  { id: 4, naam: 'Z4 Drempel', kortNaam: 'Z4', min: 0.80, max: 0.90, kleur: '#f97316', intensiteit: 'zwaar', omschrijving: 'Lactaatdrempel, hard' },
  { id: 5, naam: 'Z5 Maximaal', kortNaam: 'Z5', min: 0.90, max: 1.00, kleur: '#ef4444', intensiteit: 'interval', omschrijving: 'Maximale inspanning' },
]

export interface ZoneTarget {
  zone: HartslagZone
  minBpm: number
  maxBpm: number
}

/** Get the target HR zone for a given intensiteit and max HR */
export function getZoneTarget(intensiteit: string, maxHR: number): ZoneTarget | null {
  const zone = HARTSLAG_ZONES.find(z => z.intensiteit === intensiteit)
  if (!zone || !maxHR) return null
  return {
    zone,
    minBpm: Math.round(maxHR * zone.min),
    maxBpm: Math.round(maxHR * zone.max),
  }
}

/** Get which zone an actual HR measurement falls into */
export function getZoneForHR(hr: number, maxHR: number): HartslagZone | null {
  if (!hr || !maxHR) return null
  const pct = hr / maxHR
  return HARTSLAG_ZONES.find(z => pct >= z.min && pct < z.max) ?? (pct >= 0.90 ? HARTSLAG_ZONES[4] : null)
}

/** Format zone target as a short string, e.g. "Z2 · 130–145 bpm" */
export function formatZoneTarget(target: ZoneTarget): string {
  return `${target.zone.kortNaam} · ${target.minBpm}–${target.maxBpm} bpm`
}

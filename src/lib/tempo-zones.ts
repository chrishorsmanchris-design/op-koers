// ─── Looptempo-zones ──────────────────────────────────────────────────────────
// Gebaseerd op de pace-tabel waarop het PDF-schema (hardloopschema.nl) is
// gekalibreerd — zie header van pdf-plan.ts. Deze zones (H/D1/D2/D3/W) komen
// letterlijk terug in de sessie-beschrijvingen ("45 min D1", "in D2-D3", etc.)
// en worden hier centraal gedefinieerd zodat we ze overal kunnen tonen/parsen.

export interface TempoZone {
  label: string   // zoals gebruikt in beschrijvingen: H, D1, D2, D3, W
  naam: string
  pace: string    // min:sec per km
  omschrijving: string
}

export const TEMPO_ZONES: TempoZone[] = [
  { label: 'H',  naam: 'Herstel',           pace: '6:41', omschrijving: 'Zeer rustig, herstellend tempo' },
  { label: 'D1', naam: 'Rustige duurloop',  pace: '5:51', omschrijving: 'Comfortabel, gesprekstempo' },
  { label: 'D2', naam: 'Tempo duurloop',    pace: '5:12', omschrijving: 'Gecontroleerd stevig' },
  { label: 'D3', naam: 'Drempeltempo',      pace: '4:41', omschrijving: 'Net onder je snelste tempo' },
  // W = weerstand (niet wedstrijd): het hoogste tempo uit de pace-tabel van het
  // schema. De pace zelf komt onveranderd uit die tabel.
  { label: 'W',  naam: 'Weerstand',         pace: '4:27', omschrijving: 'Hoogste tempo uit je schema' },
]

export function zoekTempoZone(label: string, zones: TempoZone[] = TEMPO_ZONES): TempoZone | undefined {
  return zones.find(z => z.label === label.toUpperCase())
}

/** Parseert paceString "5:51" (min:sec/km) naar seconden per km */
export function paceNaarSeconden(pace: string): number {
  const [min, sec] = pace.split(':').map(Number)
  return min * 60 + (sec ?? 0)
}

/** Formatteert seconden per km terug naar "m:ss" */
export function secondenNaarPace(seconden: number): string {
  const min = Math.floor(seconden / 60)
  const sec = Math.round(seconden % 60)
  return `${min}:${String(sec).padStart(2, '0')}`
}

/** Vindt alle zone-labels (H, D1, D2, D3, W) die voorkomen in een sessiebeschrijving */
export function zonesInTekst(tekst: string, zones: TempoZone[] = TEMPO_ZONES): TempoZone[] {
  const gevonden = new Set<string>()
  const matches = tekst.match(/\b(H|D1|D2|D3|W)\b/g) ?? []
  matches.forEach(m => gevonden.add(m))
  return Array.from(gevonden)
    .map(label => zoekTempoZone(label, zones))
    .filter((z): z is TempoZone => Boolean(z))
}

/**
 * Vult een eventueel onvolledige per-gebruiker zones-set aan met de standaard.
 * Alleen de pace is persoonlijk — naam en omschrijving komen altijd uit de
 * standaard, anders blijven oude benamingen hangen in het opgeslagen JSON zodra
 * we ze hier corrigeren.
 */
export function mergeTempoZones(userZones: TempoZone[] | null | undefined): TempoZone[] {
  if (!userZones?.length) return TEMPO_ZONES
  return TEMPO_ZONES.map(std => {
    const eigen = userZones.find(z => z.label === std.label)
    return eigen ? { ...std, pace: eigen.pace } : std
  })
}

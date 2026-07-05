import { TempoZone, zoekTempoZone, zonesInTekst } from './tempo-zones'

export interface WorkoutBlok {
  titel: string
  detail?: string
  duur_minuten?: number
  zones: TempoZone[]
}

export interface GeparsedWorkout {
  soort: string          // bijv. "Interval", "Duurloop", "Fartlek", "Wedstrijd"
  blokken: WorkoutBlok[]
}

const SOORT_PATRONEN: { match: RegExp; naam: string }[] = [
  { match: /^interval extensief/i, naam: 'Interval (extensief)' },
  { match: /^interval/i, naam: 'Interval' },
  { match: /^fartlek/i, naam: 'Fartlek' },
  { match: /^lange duurloop/i, naam: 'Lange duurloop' },
  { match: /^duurloop/i, naam: 'Duurloop' },
  { match: /^intensieve duurloop/i, naam: 'Intensieve duurloop' },
  { match: /^herstelloop/i, naam: 'Herstelloop' },
  { match: /^wedstrijd/i, naam: 'Wedstrijd' },
]

function bepaalSoort(tekst: string): string {
  const gevonden = SOORT_PATRONEN.find(p => p.match.test(tekst.trim()))
  return gevonden?.naam ?? 'Training'
}

/**
 * Parseert een vrije-tekst sessiebeschrijving naar gestructureerde blokken.
 * Werkt op basis van patronen die in het PDF-schema voorkomen; valt netjes
 * terug op één blok met de volledige tekst als niets herkend wordt.
 */
export function parseWorkout(beschrijving: string, duurMinuten?: number | null): GeparsedWorkout {
  const soort = bepaalSoort(beschrijving)
  const blokken: WorkoutBlok[] = []

  // Patroon 1: interval-herhalingen, bv. "16 × 400m, eindigen in D2-D3 (1:15 min wandelen)"
  const intervalMatch = beschrijving.match(/(\d+)\s*[×x]\s*(\d+)\s*(m|km)\b/i)
  if (intervalMatch) {
    const herhalingen = Number(intervalMatch[1])
    const afstand = `${intervalMatch[2]}${intervalMatch[3]}`
    const zoneMatch = beschrijving.match(/in\s+((?:D1|D2|D3|H|W)(?:-(?:D1|D2|D3|H|W))?)/i)
    const rustMatch = beschrijving.match(/\(([^)]*(?:wandelen|rust)[^)]*)\)/i)

    blokken.push({
      titel: 'Warming-up',
      detail: '10-15 min rustig inlopen',
      zones: [zoekTempoZone('D1')].filter((z): z is TempoZone => Boolean(z)),
    })
    blokken.push({
      titel: `Hoofdset: ${herhalingen} × ${afstand}`,
      detail: rustMatch ? `Rust tussendoor: ${rustMatch[1]}` : undefined,
      zones: zoneMatch ? zonesInTekst(zoneMatch[1]) : [],
    })
    blokken.push({
      titel: 'Cooldown',
      detail: 'Rustig uitlopen',
      zones: [zoekTempoZone('H')].filter((z): z is TempoZone => Boolean(z)),
    })
    return { soort, blokken }
  }

  // Patroon 2: opeenvolgende segmenten "X min D# direct gevolgd door Y min D#"
  const segmentDelimiters = /direct gevolgd door|gevolgd door|\bmet\b(?!\s*\d+\s*[×x])/i
  const segmenten = beschrijving.split(segmentDelimiters)
  if (segmenten.length > 1) {
    let gevonden = false
    for (const segment of segmenten) {
      const m = segment.match(/(\d+)\s*min\s+(?:in\s+)?((?:D1|D2|D3|H|W)(?:-(?:D1|D2|D3|H|W))?)/i)
      if (m) {
        gevonden = true
        blokken.push({
          titel: `${m[1]} min`,
          zones: zonesInTekst(m[2]),
        })
      }
    }
    if (gevonden) return { soort, blokken }
  }

  // Patroon 3: enkel blok "X min in D#" of "X min D#"
  const enkelMatch = beschrijving.match(/(\d+)\s*min\s+(?:in\s+)?((?:D1|D2|D3|H|W)(?:-(?:D1|D2|D3|H|W))?)/i)
  if (enkelMatch) {
    blokken.push({
      titel: `${enkelMatch[1]} min`,
      zones: zonesInTekst(enkelMatch[2]),
    })
    return { soort, blokken }
  }

  // Patroon 4: wedstrijd "Wedstrijd 15 km in D2-D3"
  const wedstrijdMatch = beschrijving.match(/(\d+(?:[.,]\d+)?)\s*km\s+in\s+((?:D1|D2|D3|H|W)(?:-(?:D1|D2|D3|H|W))?)/i)
  if (wedstrijdMatch) {
    blokken.push({
      titel: `${wedstrijdMatch[1]} km`,
      duur_minuten: duurMinuten ?? undefined,
      zones: zonesInTekst(wedstrijdMatch[2]),
    })
    return { soort, blokken }
  }

  // Fallback: volledige tekst als één blok, met eventueel herkende zones
  blokken.push({
    titel: beschrijving,
    duur_minuten: duurMinuten ?? undefined,
    zones: zonesInTekst(beschrijving),
  })
  return { soort, blokken }
}

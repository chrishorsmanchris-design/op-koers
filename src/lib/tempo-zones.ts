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
  /** Onder- en bovengrens als fractie van je maximale hartslag. */
  hrMin: number
  hrMax: number
  /** Hoe het voelt en klinkt — de controle die geen horloge nodig heeft. */
  gevoel: string
}

/**
 * De hartslaggrenzen zijn de gangbare percentages van de maximale hartslag voor
 * dit zonesysteem. Ze zijn een vertaling, geen meting: welk percentage bij welke
 * zone hoort verschilt per methode, en je eigen schema-PDF heeft vooraan een
 * tabel die vóór deze gaat. Wijkt die af, dan is die van jou de juiste.
 *
 * Belangrijker nog is waar ze op slaan. Een percentage van je maximum is maar zo
 * betrouwbaar als dat maximum zelf, en een formule als 220 min leeftijd heeft
 * nooit een onderzoeksbasis gehad (Robergs & Landwehr, 2002). Ook de betere
 * versie van Tanaka et al. (2001) houdt een standaarddeviatie van zo'n tien
 * slagen over — twee daarvan is twintig slagen, en dan ligt deze hele tabel
 * ergens anders. Vandaar dat elke zone ook een gevoelsomschrijving heeft: die
 * heeft geen kalibratie nodig en is op een warme dag betrouwbaarder dan je
 * horloge.
 */
export const TEMPO_ZONES: TempoZone[] = [
  { label: 'H',  naam: 'Herstel',           pace: '6:41', omschrijving: 'Zeer rustig, herstellend tempo',
    hrMin: 0.60, hrMax: 0.70, gevoel: 'Bijna ongemakkelijk langzaam. Je kunt moeiteloos doorpraten.' },
  { label: 'D1', naam: 'Rustige duurloop',  pace: '5:51', omschrijving: 'Comfortabel, gesprekstempo',
    hrMin: 0.70, hrMax: 0.80, gevoel: 'Hele zinnen uitspreken lukt zonder happen naar adem.' },
  { label: 'D2', naam: 'Tempo duurloop',    pace: '5:12', omschrijving: 'Gecontroleerd stevig',
    hrMin: 0.80, hrMax: 0.85, gevoel: 'Korte zinnen. Praten kan nog, een gesprek voeren niet.' },
  { label: 'D3', naam: 'Drempeltempo',      pace: '4:41', omschrijving: 'Net onder je snelste tempo',
    hrMin: 0.85, hrMax: 0.90, gevoel: 'Losse woorden. Je kunt dit ongeveer een uur volhouden.' },
  // W = weerstand (niet wedstrijd): het hoogste tempo uit de pace-tabel van het
  // schema. De pace zelf komt onveranderd uit die tabel.
  { label: 'W',  naam: 'Weerstand',         pace: '4:27', omschrijving: 'Hoogste tempo uit je schema',
    hrMin: 0.90, hrMax: 0.95, gevoel: 'Praten gaat niet meer. Alleen in korte herhalingen vol te houden.' },
]

export interface Hartslagbereik {
  min: number
  max: number
}

/**
 * De hartslag die bij een zone hoort, in slagen per minuut.
 *
 * Zonder bekende maximale hartslag komt er niets uit. Dat is met opzet: een
 * verzonnen bovengrens is schadelijker dan geen bovengrens, want je gaat er
 * wél naar lopen.
 */
export function hartslagBereik(zone: TempoZone, maxHR: number | null | undefined): Hartslagbereik | null {
  if (!maxHR || maxHR < 120 || maxHR > 230) return null
  return {
    min: Math.round(maxHR * zone.hrMin),
    max: Math.round(maxHR * zone.hrMax),
  }
}

/**
 * De bovengrens van de zwaarste zone in een sessie: het antwoord op "hoe hard
 * mag ik maximaal". Bij "in D2-D3" is dat de bovenkant van D3.
 */
export function maximaleHartslag(zones: TempoZone[], maxHR: number | null | undefined): number | null {
  const grenzen = zones
    .map(z => hartslagBereik(z, maxHR)?.max)
    .filter((n): n is number => typeof n === 'number')
  return grenzen.length ? Math.max(...grenzen) : null
}

export function zoekTempoZone(label: string, zones: TempoZone[] = TEMPO_ZONES): TempoZone | undefined {
  return zones.find(z => z.label === label.toUpperCase())
}

/**
 * De ruimste en de scherpste tempo's die nog een hardloopsessie kunnen zijn.
 *
 * Bewust breed, want de uitersten in het schema zijn legitiem: een interval met
 * wandelpauzes komt op zo'n 6:00 per kilometer uit en een heuveltraining op
 * 6:40, terwijl de marathon zelf onder de 4:40 duikt. Deze grenzen zijn er niet
 * om tempo te sturen maar om onmogelijke combinaties te herkennen.
 */
const TRAAGSTE_SEC_PER_KM = 9 * 60
const SNELSTE_SEC_PER_KM = 3 * 60 + 30

/**
 * Controleert of duur en afstand samen een bestaand tempo opleveren, en
 * herberekent de afstand als dat niet zo is.
 *
 * Een sessie mag een duur en een afstand naast elkaar zetten, maar samen leggen
 * die twee een tempo vast, en dat tempo moet kunnen. "90 minuten, 6 km" is een
 * kwartier per kilometer: dat is wandelen, en het staat er alleen omdat niemand
 * de twee getallen tegen elkaar heeft gehouden.
 *
 * Bij twijfel wint de duur. Die heb je in de hand — je gaat een uur lopen — en
 * de afstand volgt uit hoe hard je loopt. Een afstand die ontbreekt blijft
 * ontbreken: een tijdsessie zonder afstand is een geldige opdracht.
 */
export function herstelAfstand(
  duurMinuten: number | null | undefined,
  afstandKm: number | null | undefined,
  zones: TempoZone[] = TEMPO_ZONES
): number | null {
  if (!afstandKm || afstandKm <= 0) return null
  if (!duurMinuten || duurMinuten <= 0) return afstandKm
  const secPerKm = (duurMinuten * 60) / afstandKm
  if (secPerKm <= TRAAGSTE_SEC_PER_KM && secPerKm >= SNELSTE_SEC_PER_KM) return afstandKm
  const referentie = zoekTempoZone('D1', zones) ?? TEMPO_ZONES[1]
  return Math.round((duurMinuten * 60) / paceNaarSeconden(referentie.pace) * 10) / 10
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

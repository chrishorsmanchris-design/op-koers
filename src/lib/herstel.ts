/**
 * Herstelanalyse op basis van Apple Health-metingen (rusthartslag, HRV, slaap).
 *
 * De belastinganalyse in `belasting.ts` kijkt naar wat je je lichaam hebt
 * opgelegd. Dit kijkt naar wat je lichaam ervan vindt. Dat verschil is precies
 * waar overtraining zit: dezelfde week van 200 belastingpunten is prima als je
 * rusthartslag stabiel is, en een waarschuwing als hij vijf slagen omhoog kruipt.
 *
 * Alles wordt vergeleken met JOUW eigen basislijn, niet met een norm. Een
 * rusthartslag van 58 zegt niets; 58 terwijl je normaal op 51 zit zegt alles.
 *
 * De basislijn loopt t/m 4 dagen geleden. Zou hij tot vandaag lopen, dan trekt
 * een slechte week de basislijn mee omhoog en verdwijnt het signaal precies op
 * het moment dat je het nodig hebt.
 */

export interface HerstelMeting {
  datum: string
  rusthartslag: number | null
  hrv_ms: number | null
  slaapuren: number | null
}

export type HerstelNiveau = 'onbekend' | 'goed' | 'let_op' | 'slecht'

export interface HerstelAnalyse {
  niveau: HerstelNiveau
  /** Aantal dagen met minstens één meting in het venster. */
  metingen: number
  rusthartslag: number | null
  rusthartslagBasis: number | null
  /** Verschil recent t.o.v. basislijn, in slagen/min. Positief = verhoogd. */
  rusthartslagDelta: number | null
  hrv: number | null
  hrvBasis: number | null
  /** Procentuele afwijking van de basislijn. Negatief = lager dan normaal. */
  hrvDeltaPct: number | null
  /** Gemiddelde slaap over de laatste 3 nachten, in uren. */
  slaapuren: number | null
  /** Slaapschuld t.o.v. de basislijn over de laatste 7 nachten, in uren. */
  slaapschuld: number | null
  signalen: string[]
  advies: string | null
  laatsteMeting: string | null
}

/** Minimaal aantal basislijndagen voordat we ergens iets van durven te vinden. */
const MIN_BASIS = 7
/** Hoeveel recente dagen we middelen. Eén nacht is ruis; drie is een trend. */
const RECENT_DAGEN = 3
/** Basislijn kijkt hier vandaan terug, zodat de recente dagen er niet in zitten. */
const BASIS_OFFSET = 4
const BASIS_DAGEN = 28

/** Verhoging in slagen/min waarboven we het een signaal noemen. */
const HR_DREMPEL = 3
const HR_DREMPEL_HOOG = 6
/** HRV-daling in procenten. */
const HRV_DREMPEL = -8
const HRV_DREMPEL_HOOG = -15

function mediaan(waarden: number[]): number | null {
  if (!waarden.length) return null
  const s = [...waarden].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function gemiddelde(waarden: number[]): number | null {
  if (!waarden.length) return null
  return waarden.reduce((a, b) => a + b, 0) / waarden.length
}

function dagenTerug(vandaag: string, n: number): string {
  const d = new Date(vandaag + 'T12:00:00')
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function afronden(n: number | null, decimalen = 0): number | null {
  if (n === null) return null
  const f = Math.pow(10, decimalen)
  return Math.round(n * f) / f
}

export function analyseerHerstel(
  metingen: HerstelMeting[],
  vandaag: string,
): HerstelAnalyse {
  const recentVanaf = dagenTerug(vandaag, RECENT_DAGEN - 1)
  const basisVanaf = dagenTerug(vandaag, BASIS_DAGEN)
  const basisTot = dagenTerug(vandaag, BASIS_OFFSET)

  const inVenster = metingen.filter(m => m.datum >= basisVanaf && m.datum <= vandaag)
  const recent = inVenster.filter(m => m.datum >= recentVanaf)
  const basis = inVenster.filter(m => m.datum >= basisVanaf && m.datum <= basisTot)

  const getal = (rijen: HerstelMeting[], veld: keyof HerstelMeting): number[] =>
    rijen.map(r => r[veld]).filter((v): v is number => typeof v === 'number')

  const hrRecent = gemiddelde(getal(recent, 'rusthartslag'))
  const hrBasisWaarden = getal(basis, 'rusthartslag')
  const hrBasis = hrBasisWaarden.length >= MIN_BASIS ? mediaan(hrBasisWaarden) : null

  const hrvRecent = gemiddelde(getal(recent, 'hrv_ms'))
  const hrvBasisWaarden = getal(basis, 'hrv_ms')
  const hrvBasis = hrvBasisWaarden.length >= MIN_BASIS ? mediaan(hrvBasisWaarden) : null

  const slaapRecent = gemiddelde(getal(recent, 'slaapuren'))
  const slaapBasis = mediaan(getal(basis, 'slaapuren'))

  const hrDelta = hrRecent !== null && hrBasis !== null ? hrRecent - hrBasis : null
  const hrvDeltaPct = hrvRecent !== null && hrvBasis ? ((hrvRecent - hrvBasis) / hrvBasis) * 100 : null

  // Slaapschuld: hoeveel uur je de afgelopen week onder je eigen normaal zat.
  // Zeven nachten van een half uur te kort telt op tot dezelfde 3,5 uur als één
  // doorgehaalde nacht, en voelt in week 10 van een marathonopbouw ook zo.
  const zevenVanaf = dagenTerug(vandaag, 6)
  const slaapWeek = getal(inVenster.filter(m => m.datum >= zevenVanaf), 'slaapuren')
  const slaapschuld = slaapBasis !== null && slaapWeek.length >= 4
    ? slaapWeek.reduce((s, u) => s + Math.min(0, u - slaapBasis), 0)
    : null

  const signalen: string[] = []
  const RANG: HerstelNiveau[] = ['goed', 'let_op', 'slecht']
  let rang = 0
  const verhoog = (n: HerstelNiveau) => { rang = Math.max(rang, RANG.indexOf(n)) }

  if (hrDelta !== null && hrDelta >= HR_DREMPEL_HOOG) {
    signalen.push(`Rusthartslag ${afronden(hrDelta)} slagen boven je normaal`)
    verhoog('slecht')
  } else if (hrDelta !== null && hrDelta >= HR_DREMPEL) {
    signalen.push(`Rusthartslag ${afronden(hrDelta)} slagen boven je normaal`)
    verhoog('let_op')
  }

  if (hrvDeltaPct !== null && hrvDeltaPct <= HRV_DREMPEL_HOOG) {
    signalen.push(`HRV ${Math.abs(Math.round(hrvDeltaPct))}% lager dan normaal`)
    verhoog('slecht')
  } else if (hrvDeltaPct !== null && hrvDeltaPct <= HRV_DREMPEL) {
    signalen.push(`HRV ${Math.abs(Math.round(hrvDeltaPct))}% lager dan normaal`)
    verhoog('let_op')
  }

  if (slaapRecent !== null && slaapRecent < 6) {
    signalen.push(`Gemiddeld ${afronden(slaapRecent, 1)} uur slaap de laatste nachten`)
    verhoog('slecht')
  } else if (slaapschuld !== null && slaapschuld <= -4) {
    signalen.push(`${Math.abs(afronden(slaapschuld, 1)!)} uur slaaptekort deze week`)
    verhoog('let_op')
  }

  // Zonder basislijn is elk oordeel gokwerk. Dan liever eerlijk "onbekend" dan
  // een groen vinkje dat nergens op slaat.
  const heeftBasis = hrBasis !== null || hrvBasis !== null
  const niveau: HerstelNiveau = !heeftBasis ? 'onbekend' : RANG[rang]

  let advies: string | null = null
  if (niveau === 'slecht') {
    advies = 'Je lichaam is nog aan het herstellen. Sla een intensieve training vandaag over of maak er een rustige duurloop van — trainen op een verhoogde rusthartslag levert vooral vermoeidheid op, geen vooruitgang.'
  } else if (niveau === 'let_op') {
    advies = 'Je herstel loopt iets achter. Houd de intensiteit vandaag laag en kijk morgen opnieuw.'
  }

  const datums = inVenster.map(m => m.datum).sort()

  return {
    niveau,
    metingen: inVenster.length,
    rusthartslag: afronden(hrRecent),
    rusthartslagBasis: afronden(hrBasis),
    rusthartslagDelta: afronden(hrDelta, 1),
    hrv: afronden(hrvRecent),
    hrvBasis: afronden(hrvBasis),
    hrvDeltaPct: afronden(hrvDeltaPct),
    slaapuren: afronden(slaapRecent, 1),
    slaapschuld: afronden(slaapschuld, 1),
    signalen,
    advies,
    laatsteMeting: datums[datums.length - 1] ?? null,
  }
}

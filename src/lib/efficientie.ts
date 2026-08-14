/**
 * Hartslag tegen tempo: word je fitter, of alleen moeier?
 *
 * Een trainingslogboek laat zien wat je gedaan hebt. Het zegt niets over wat het
 * je kostte. Twee duurlopen van 12 km in 66 minuten zijn identiek op papier,
 * terwijl de ene op hartslag 142 ging en de andere op 155. Dat verschil is het
 * hele verhaal: hetzelfde tempo bij een lagere hartslag betekent dat het schema
 * werkt, hetzelfde tempo bij een hógere hartslag betekent dat je vermoeidheid
 * opbouwt die je nog niet voelt.
 *
 * Het mooie is dat hier geen enkele nieuwe meting voor nodig is. Strava levert
 * afstand, duur en gemiddelde hartslag al bij elke run aan; die stonden alleen
 * ongebruikt in de database.
 *
 * De index is snelheid gedeeld door hartslag: hoeveel meter per minuut krijg je
 * per hartslag. Hoger is beter. De absolute waarde zegt niets — alleen de
 * verandering ten opzichte van je eigen eerdere weken telt.
 */

export interface EfficientieRun {
  datum: string
  intensiteit: string | null
  afstand_km: number | null
  duur_minuten: number | null
  hartslag_gem: number | null
}

export interface EfficientiePunt {
  datum: string
  /** Meter per minuut per hartslag. */
  index: number
  afstandKm: number
  hartslag: number
  /** Seconden per kilometer, voor de leesbaarheid in de kaart. */
  tempoSec: number
}

export type EfficientieRichting = 'onbekend' | 'beter' | 'stabiel' | 'slechter' | 'zorg'

export interface EfficientieAnalyse {
  richting: EfficientieRichting
  /** Procentuele verandering van recent t.o.v. de basisperiode. */
  veranderingPct: number | null
  /** Aantal bruikbare runs in de recente periode. */
  recentAantal: number
  /** Aantal bruikbare runs in de basisperiode. */
  basisAantal: number
  /** Gemiddelde hartslag in beide periodes, voor de uitleg in gewone taal. */
  recentHartslag: number | null
  basisHartslag: number | null
  /** Gemiddeld tempo (sec/km) in beide periodes. */
  recentTempoSec: number | null
  basisTempoSec: number | null
  punten: EfficientiePunt[]
  uitleg: string
  advies: string | null
}

/** Recente periode: de laatste vier weken. */
const RECENT_DAGEN = 28
/** Basisperiode: de zes weken daarvóór. Genoeg runs, nog geen ander seizoen. */
const BASIS_DAGEN = 70
/** Onder dit aantal runs per periode is elk verschil toeval. */
const MIN_RUNS = 3

/**
 * Alleen rustige, gelijkmatige duurlopen. Bij intervallen en wedstrijdtempo is
 * een gemiddelde hartslag betekenisloos: die middelt pieken van 180 en dalen van
 * 120 tot een getal dat bij geen enkel moment van de training hoort.
 */
const BRUIKBARE_INTENSITEIT = new Set(['herstel', 'makkelijk', 'gemiddeld'])
/** Korter dan dit is vooral op gang komen; de hartslag loopt dan nog achter. */
const MIN_AFSTAND_KM = 4
const MIN_DUUR_MIN = 20

/** Drempel waaronder een verschil ruis is: weer, wind en slaap doen al ~2%. */
const RUIS_PCT = 3
const ZORG_PCT = 6

function dagenTerug(vandaag: string, n: number): string {
  const d = new Date(vandaag + 'T12:00:00')
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function gemiddelde(waarden: number[]): number | null {
  if (!waarden.length) return null
  return waarden.reduce((a, b) => a + b, 0) / waarden.length
}

export function tempoTekst(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function naarPunt(run: EfficientieRun): EfficientiePunt | null {
  const { afstand_km: afstand, duur_minuten: duur, hartslag_gem: hartslag } = run
  if (!afstand || !duur || !hartslag) return null
  if (afstand < MIN_AFSTAND_KM || duur < MIN_DUUR_MIN) return null
  // Buiten dit bereik is de hartslagmeting zelf verdacht: een borstband die
  // verspringt of een horloge dat de cadans oppikt in plaats van de pols.
  if (hartslag < 90 || hartslag > 210) return null
  if (!BRUIKBARE_INTENSITEIT.has(run.intensiteit ?? '')) return null

  const meterPerMinuut = (afstand * 1000) / duur
  return {
    datum: run.datum,
    index: meterPerMinuut / hartslag,
    afstandKm: afstand,
    hartslag,
    tempoSec: (duur * 60) / afstand,
  }
}

export function analyseerEfficientie(
  runs: EfficientieRun[],
  vandaag: string,
): EfficientieAnalyse {
  const recentVanaf = dagenTerug(vandaag, RECENT_DAGEN)
  const basisVanaf = dagenTerug(vandaag, BASIS_DAGEN)

  const punten = runs
    .map(naarPunt)
    .filter((p): p is EfficientiePunt => p !== null)
    .filter(p => p.datum >= basisVanaf && p.datum <= vandaag)
    .sort((a, b) => a.datum.localeCompare(b.datum))

  const recent = punten.filter(p => p.datum > recentVanaf)
  const basis = punten.filter(p => p.datum <= recentVanaf)

  const recentIndex = gemiddelde(recent.map(p => p.index))
  const basisIndex = gemiddelde(basis.map(p => p.index))

  const leeg = {
    veranderingPct: null,
    recentAantal: recent.length,
    basisAantal: basis.length,
    recentHartslag: recent.length ? Math.round(gemiddelde(recent.map(p => p.hartslag))!) : null,
    basisHartslag: basis.length ? Math.round(gemiddelde(basis.map(p => p.hartslag))!) : null,
    recentTempoSec: recent.length ? Math.round(gemiddelde(recent.map(p => p.tempoSec))!) : null,
    basisTempoSec: basis.length ? Math.round(gemiddelde(basis.map(p => p.tempoSec))!) : null,
    punten,
    advies: null,
  }

  if (recent.length < MIN_RUNS || basis.length < MIN_RUNS || !recentIndex || !basisIndex) {
    const tekort = recent.length < MIN_RUNS ? 'de afgelopen vier weken' : 'de weken daarvoor'
    return {
      ...leeg,
      richting: 'onbekend',
      uitleg: `Nog te weinig rustige duurlopen mét hartslagdata in ${tekort}. Vanaf ${MIN_RUNS} per periode kan de vergelijking gemaakt worden.`,
    }
  }

  const veranderingPct = Math.round(((recentIndex - basisIndex) / basisIndex) * 1000) / 10

  const hartslagVerschil = leeg.recentHartslag! - leeg.basisHartslag!
  const tempoVerschil = leeg.recentTempoSec! - leeg.basisTempoSec!

  // In gewone taal: wat is er feitelijk veranderd aan tempo en hartslag. Een
  // percentage alleen is niet te controleren; deze twee getallen wel.
  const feiten =
    `Laatste 4 weken: ${tempoTekst(leeg.recentTempoSec!)}/km bij ${leeg.recentHartslag} slagen. ` +
    `Daarvoor: ${tempoTekst(leeg.basisTempoSec!)}/km bij ${leeg.basisHartslag} slagen.`

  let richting: EfficientieRichting
  let uitleg: string
  let advies: string | null = null

  if (veranderingPct >= RUIS_PCT) {
    richting = 'beter'
    uitleg = hartslagVerschil < 0 && tempoVerschil <= 0
      ? `Je loopt harder én je hartslag is ${Math.abs(hartslagVerschil)} slagen lager. Dat is precies wat een opbouw hoort te doen. ${feiten}`
      : `Je krijgt meer tempo per hartslag dan een maand geleden. ${feiten}`
  } else if (veranderingPct <= -ZORG_PCT) {
    richting = 'zorg'
    uitleg = `Je betaalt fors meer hartslag voor hetzelfde werk. ${feiten}`
    advies = 'Dit is het patroon dat aan overtraining voorafgaat: het tempo houdt zich nog even, de hartslag verraadt de rekening. Overweeg een lichte week — 20 tot 30% minder volume, intensiteit eruit — en kijk of het herstelt.'
  } else if (veranderingPct <= -RUIS_PCT) {
    richting = 'slechter'
    uitleg = `Hetzelfde werk kost je nu meer hartslag dan een maand geleden. ${feiten}`
    advies = 'Eén slechte periode is nog geen trend, maar houd het in de gaten. Warm weer en slechte slaap doen hetzelfde, dus kijk of het over twee weken hersteld is.'
  } else {
    richting = 'stabiel'
    uitleg = `Je hartslag-tempoverhouding is onveranderd. ${feiten}`
  }

  return { ...leeg, richting, veranderingPct, uitleg, advies }
}

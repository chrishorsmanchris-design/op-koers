/**
 * Wanneer je die dag het beste kunt lopen.
 *
 * Warmte is de enige weersfactor die je training echt verandert. Regen is
 * vervelend, wind kost je een minuut, maar hitte verhoogt je hartslag bij
 * hetzelfde tempo, versnelt het vochtverlies en maakt van een rustige duurloop
 * een zware. Twee uur eerder vertrekken is dan een grotere ingreep dan wat je
 * ook aan je schema verandert — en het kost je niets.
 *
 * We rekenen met de gevoelstemperatuur en niet met de thermometer. Bij hardlopen
 * is luchtvochtigheid het halve verhaal: 24 graden droog loopt anders dan 24
 * graden benauwd, omdat je zweet in het tweede geval niet verdampt en je dus
 * niet afkoelt. Open-Meteo levert die gevoelstemperatuur al mee.
 *
 * De kaart houdt bewust zijn mond als het verschil klein is. Advies geven over
 * anderhalve graad is ruis met een uitroepteken erbij.
 */

/** Buiten deze uren plant niemand vrijwillig een duurloop. */
const VROEGSTE_UUR = 6
const LAATSTE_EIND_UUR = 22

/** Onder dit verschil tussen het beste en slechtste moment valt er niets te kiezen. */
const RELEVANT_VERSCHIL = 3

/**
 * Boven deze gevoelstemperatuur begint hardlopen meetbaar duurder te worden.
 * Onder de 15 graden is warmte geen factor van betekenis.
 */
const NEUTRAAL = 15

export interface UurWeer {
  uur: number
  gevoel: number
  regenKans: number
}

export type Hitte = 'geen' | 'let_op' | 'zwaar' | 'gevaarlijk'

export interface Loopvenster {
  startUur: number
  eindUur: number
  /** Gemiddelde gevoelstemperatuur over het venster. */
  gevoel: number
  /** Hoogste regenkans in het venster. */
  regenKans: number
  hitte: Hitte
  /** Geschat tempoverlies door de warmte, in procenten. */
  tempoverliesPct: number
}

export interface LooptijdAdvies {
  beste: Loopvenster
  /** Het slechtste moment van de dag, om het verschil te kunnen tonen. */
  slechtste: Loopvenster
  /** Is het verschil groot genoeg om er iets over te zeggen? */
  maaktUit: boolean
  waarschuwing: string | null
}

function hitteNiveau(gevoel: number): Hitte {
  if (gevoel < NEUTRAAL) return 'geen'
  if (gevoel < 21) return 'let_op'
  if (gevoel < 27) return 'zwaar'
  return 'gevaarlijk'
}

/** Onder dit tempoverlies is een waarschuwing groter dan het probleem. */
const MELD_VANAF_PCT = 3

/**
 * Vuistregel, geen natuurwet: ongeveer een derde procent tempoverlies per graad
 * gevoelstemperatuur boven de 15. Dat komt uit op zo'n 2% bij 21 graden en 4%
 * bij 27, wat aardig overeenkomt met wat wedstrijdtabellen laten zien. Boven de
 * 8% houdt de schatting op — daar bepaalt je hoofd meer dan een formule.
 */
export function tempoverliesPct(gevoel: number): number {
  if (gevoel <= NEUTRAAL) return 0
  return Math.min(8, Math.round((gevoel - NEUTRAAL) * 0.35 * 10) / 10)
}

export function uurTekst(uur: number): string {
  return `${String(uur).padStart(2, '0')}:00`
}

function maakVenster(uren: UurWeer[], startUur: number, lengte: number): Loopvenster | null {
  const blok = uren.filter(u => u.uur >= startUur && u.uur < startUur + lengte)
  if (blok.length < lengte) return null
  const gevoel = Math.round(blok.reduce((s, u) => s + u.gevoel, 0) / blok.length)
  return {
    startUur,
    eindUur: startUur + lengte,
    gevoel,
    regenKans: Math.max(...blok.map(u => u.regenKans)),
    hitte: hitteNiveau(gevoel),
    tempoverliesPct: tempoverliesPct(gevoel),
  }
}

/**
 * Een venster is slechter naarmate het warmer is, met regen als lichte weging
 * erbovenop. Regen weegt bewust licht: nat worden kost je niets, oververhitting
 * wel. Alleen bij gelijke temperatuur geeft het de doorslag.
 */
function score(v: Loopvenster): number {
  return v.gevoel + v.regenKans / 40
}

/**
 * @param uren     Uurlijkse verwachting voor de dag van de training.
 * @param duurMin  Geplande duur; bepaalt hoe lang het venster moet zijn.
 * @param vanafUur Niet eerder dan dit uur adviseren — voor vandaag is dat het
 *                 huidige uur, want een advies voor vanochtend 7 uur is 's
 *                 middags om 3 uur alleen maar wrijving.
 */
export function beoordeelLooptijd(
  uren: UurWeer[],
  duurMin: number | null,
  vanafUur: number,
): LooptijdAdvies | null {
  const lengte = Math.max(1, Math.ceil((duurMin ?? 60) / 60))
  const vroegste = Math.max(VROEGSTE_UUR, vanafUur)

  const vensters: Loopvenster[] = []
  for (let start = vroegste; start + lengte <= LAATSTE_EIND_UUR; start++) {
    const v = maakVenster(uren, start, lengte)
    if (v) vensters.push(v)
  }
  if (vensters.length === 0) return null

  const gesorteerd = [...vensters].sort((a, b) => score(a) - score(b))
  const beste = gesorteerd[0]
  const slechtste = gesorteerd[gesorteerd.length - 1]

  const verschil = slechtste.gevoel - beste.gevoel

  let waarschuwing: string | null = null
  if (beste.hitte === 'gevaarlijk') {
    waarschuwing =
      'Ook op het koelste moment is het te warm voor een normale duurloop. Lever tempo in, verkort de afstand, of verplaats de sessie naar morgen — je hartslag zegt vandaag niets over je conditie.'
  } else if (beste.hitte === 'zwaar' && beste.tempoverliesPct >= MELD_VANAF_PCT) {
    waarschuwing =
      `Reken op ongeveer ${beste.tempoverliesPct}% tempoverlies door de warmte. Dat is geen slechte dag, dat is natuurkunde: loop op gevoel of op hartslag in plaats van op de klok.`
  }

  return { beste, slechtste, maaktUit: verschil >= RELEVANT_VERSCHIL, waarschuwing }
}

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

/**
 * Wanneer je kúnt lopen, per dag van de week. Zonder dit zou de kaart je op een
 * hete dag steevast naar zes uur 's ochtends sturen — technisch het koelste
 * moment, en precies het advies dat je negeert. Een advies dat je niet opvolgt
 * is geen advies.
 *
 * Bewust een lijst losse uren en geen van-tot. Een werkdag ziet er zelden uit
 * als één blok: je kunt voor werktijd, in de lunchpauze, en 's avonds weer, met
 * twee gaten ertussen. Met een begin- en eindtijd moet je daar één groot venster
 * van maken dat ook de uren bevat waarop je vastzit — en dan adviseert de kaart
 * je om drie uur 's middags te gaan lopen.
 *
 * Een uur in de lijst betekent: dat hele uur ben ik vrij. Uur 19 aanwezig staat
 * dus voor 19:00 tot 20:00.
 */
export type Looptijden = Record<string, number[] | { van: number; tot: number }>

/** getDay() telt vanaf zondag; deze volgorde moet daarmee overeenkomen. */
export const DAGSLEUTELS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'] as const

/** Ruim genomen: liever een te breed venster dan een gebruiker die niets ziet. */
export const STANDAARD_UREN: number[] = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

/**
 * Accepteert ook nog de oude van-tot-vorm. Die stond kort in de database en het
 * omzetten is drie regels; een migratie schrijven voor een handvol rijen die
 * zichzelf bij de eerste keer opslaan corrigeren is dat niet waard.
 */
export function normaliseerUren(
  v: number[] | { van: number; tot: number } | null | undefined,
): number[] | null {
  // Een lege lijst is een geldig antwoord ("deze dag loop ik nooit") en moet dus
  // niet stilletjes het standaardvenster worden. Alleen ontbrekende of kapotte
  // waarden leveren null op.
  if (Array.isArray(v)) {
    return v.filter(u => Number.isInteger(u) && u >= 0 && u <= 23).sort((a, b) => a - b)
  }
  if (v && typeof v.van === 'number' && typeof v.tot === 'number' && v.tot > v.van) {
    const uit: number[] = []
    for (let u = v.van; u < v.tot; u++) uit.push(u)
    return uit
  }
  return null
}

export function urenVoorDatum(
  looptijden: Looptijden | null | undefined,
  datum: string,
): number[] {
  const dag = DAGSLEUTELS[new Date(datum + 'T12:00:00').getDay()]
  return normaliseerUren(looptijden?.[dag]) ?? STANDAARD_UREN
}

/** "07:00–09:00 · 12:00–13:00 · 18:00–21:00" — losse uren weer als blokken lezen. */
export function urenTekst(uren: number[]): string {
  if (!uren.length) return 'geen tijd'
  const gesorteerd = [...uren].sort((a, b) => a - b)
  const blokken: [number, number][] = []
  for (const u of gesorteerd) {
    const laatste = blokken[blokken.length - 1]
    if (laatste && u === laatste[1]) laatste[1] = u + 1
    else blokken.push([u, u + 1])
  }
  return blokken.map(([v, t]) => `${uurTekst(v)}–${uurTekst(t)}`).join(' · ')
}

/** De langste aaneengesloten reeks vrije uren, voor als de sessie nergens past. */
function langsteBlok(toegestaan: number[]): number[] {
  let beste: number[] = []
  let huidig: number[] = []
  for (const u of toegestaan) {
    if (huidig.length && u === huidig[huidig.length - 1] + 1) huidig.push(u)
    else huidig = [u]
    if (huidig.length > beste.length) beste = [...huidig]
  }
  return beste
}

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
  /** Het venster paste niet om de sessie heen; er viel dus niets te kiezen. */
  vensterTeKrap: boolean
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
 * @param toegestaan De uren waarop deze gebruiker die dag vrij is. Losse uren,
 *                   want ochtend, lunchpauze en avond zijn drie blokken met werk
 *                   ertussen.
 */
export function beoordeelLooptijd(
  uren: UurWeer[],
  duurMin: number | null,
  vanafUur: number,
  toegestaan: number[] = STANDAARD_UREN,
): LooptijdAdvies | null {
  const lengte = Math.max(1, Math.ceil((duurMin ?? 60) / 60))
  const vrij = new Set(toegestaan.filter(u => u >= vanafUur))

  // Een start is alleen bruikbaar als élk uur van de sessie vrij is. Zo valt een
  // duurloop van twee uur vanzelf buiten een lunchpauze van één, zonder dat daar
  // een aparte regel voor nodig is.
  const vensters: Loopvenster[] = []
  for (const start of [...vrij].sort((a, b) => a - b)) {
    let past = true
    for (let u = start; u < start + lengte; u++) if (!vrij.has(u)) { past = false; break }
    if (!past) continue
    const v = maakVenster(uren, start, lengte)
    if (v) vensters.push(v)
  }

  // Past de sessie nergens, dan valt er niets te kiezen. Toch de temperatuur
  // laten zien is nuttiger dan een lege kaart: je gaat hoe dan ook, dus je wilt
  // weten wat je te wachten staat. We nemen dan het langste vrije blok.
  const vensterTeKrap = vensters.length === 0
  if (vensterTeKrap) {
    const blok = langsteBlok([...vrij].sort((a, b) => a - b))
    if (blok.length === 0) return null
    const heel = maakVenster(uren, blok[0], blok.length)
    if (!heel) return null
    return {
      beste: heel,
      slechtste: heel,
      maaktUit: false,
      vensterTeKrap: true,
      waarschuwing:
        heel.hitte === 'gevaarlijk' || heel.tempoverliesPct >= MELD_VANAF_PCT
          ? `Binnen jouw tijden is er geen koeler moment te vinden. Reken op ongeveer ${heel.tempoverliesPct}% tempoverlies en loop op gevoel.`
          : null,
    }
  }

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

  return {
    beste,
    slechtste,
    maaktUit: verschil >= RELEVANT_VERSCHIL,
    vensterTeKrap: false,
    waarschuwing,
  }
}

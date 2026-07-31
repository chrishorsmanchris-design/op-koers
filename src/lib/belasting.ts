/**
 * Belasting- en herstelanalyse.
 *
 * Het doel: voorkomen dat het loopschema in isolatie bekeken wordt. Wie naast
 * het schema padelt en hockeyt draait feitelijk veel meer belasting dan het
 * schema denkt, en loopt dus risico op overtraining. Daarom rekenen we ALLE
 * sportinspanning om naar één eenheid — belastingpunten — en kijken we naar
 * twee dingen die blessures voorspellen: te weinig rustdagen, en een te snelle
 * stijging van de weekbelasting t.o.v. wat je lichaam gewend is (ACWR).
 *
 * Belastingpunten = duur in minuten × intensiteitsfactor. Bewust simpel en
 * uitlegbaar: geen hartslagzones nodig, werkt voor elke sport.
 */

export type BelastingNiveau = 'ok' | 'let_op' | 'hoog'

export interface BelastingSessie {
  datum: string
  type: string
  duur_minuten: number | null
  afstand_km?: number | null
  intensiteit: string | null
  voltooid: boolean
}

export interface BelastingSport {
  datum: string
  sport: string
  duur_minuten: number
  intensiteit: 'licht' | 'gemiddeld' | 'zwaar'
}

export interface DagBelasting {
  datum: string
  punten: number
  isRustdag: boolean
  /** Het schema had voor deze dag rust ingepland. */
  geplandRust: boolean
}

export interface BelastingAnalyse {
  niveau: BelastingNiveau
  /** Belastingpunten in de laatste 7 dagen (t/m vandaag). */
  acuut: number
  /** Gemiddelde weekbelasting over de laatste 28 dagen. */
  chronisch: number
  /** acuut / chronisch. Boven ~1.3 stijgt het blessurerisico. Null bij te weinig historie. */
  ratio: number | null
  /** Aantal rustdagen in de laatste 7 dagen. */
  rustdagen: number
  /** Geplande rustdagen uit het schema die je tóch met sport gevuld hebt (7 dagen). */
  rustdagenGemist: number
  /** Aantal dagen achter elkaar getraind, eindigend op de laatste trainingsdag. */
  streak: number
  /** Aandeel van de weekbelasting dat NIET uit het loopschema komt (0–1). */
  aandeelExtraSport: number
  dagen: DagBelasting[]
  waarschuwingen: string[]
  advies: string | null
}

/** Onder deze dagbelasting telt een dag als rustdag (losse core/fysio mag). */
const RUSTDAG_DREMPEL = 25

const LOOP_FACTOR: Record<string, number> = {
  herstel: 0.5,
  makkelijk: 0.8,
  gemiddeld: 1.2,
  zwaar: 1.5,
  interval: 1.8,
}

const TYPE_FACTOR: Record<string, number> = {
  hardlopen: 1.0,
  krachttraining: 0.8,
  cross: 0.8,
  core: 0.3,
  rust: 0,
}

const SPORT_FACTOR: Record<string, number> = {
  licht: 0.6,
  gemiddeld: 1.0,
  zwaar: 1.4,
}

export function sessiePunten(s: BelastingSessie): number {
  if (s.type === 'rust') return 0
  // Duur ontbreekt soms bij Strava-imports; schat dan 6 min/km, anders 45 min.
  const duur = s.duur_minuten ?? (s.afstand_km ? Math.round(s.afstand_km * 6) : 45)
  const intensiteitFactor = s.intensiteit ? (LOOP_FACTOR[s.intensiteit] ?? 1) : 1
  const typeFactor = TYPE_FACTOR[s.type] ?? 1
  return Math.round(duur * intensiteitFactor * typeFactor)
}

export function sportPunten(a: BelastingSport): number {
  return Math.round(a.duur_minuten * (SPORT_FACTOR[a.intensiteit] ?? 1))
}

function datumStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function dagenTerug(vandaag: string, n: number): string {
  const d = new Date(vandaag + 'T12:00:00')
  d.setDate(d.getDate() - n)
  return datumStr(d)
}

/**
 * Bouwt de dag-voor-dag belasting over `aantalDagen` dagen t/m `vandaag`,
 * oplopend gesorteerd (oudste eerst).
 */
export function belastingPerDag(
  sessies: BelastingSessie[],
  sporten: BelastingSport[],
  vandaag: string,
  aantalDagen = 28,
): DagBelasting[] {
  const punten = new Map<string, number>()
  for (let i = aantalDagen - 1; i >= 0; i--) punten.set(dagenTerug(vandaag, i), 0)

  // Rustdagen zoals het schema ze bedoeld heeft. Die staan als losse sessie met
  // type 'rust' in het plan; ze tellen alleen als het schema die dag verder
  // niets te doen gaf. Zo weten we of je een geplande hersteldag écht gebruikt
  // hebt, of hem hebt volgezet met padel of hockey.
  const heeftRustPlan = new Set<string>()
  const heeftTrainingPlan = new Set<string>()
  sessies.forEach(s => {
    if (!punten.has(s.datum)) return
    if (s.type === 'rust') heeftRustPlan.add(s.datum)
    else heeftTrainingPlan.add(s.datum)
  })

  sessies.forEach(s => {
    if (!s.voltooid) return
    if (!punten.has(s.datum)) return
    punten.set(s.datum, punten.get(s.datum)! + sessiePunten(s))
  })
  sporten.forEach(a => {
    if (!punten.has(a.datum)) return
    punten.set(a.datum, punten.get(a.datum)! + sportPunten(a))
  })

  return Array.from(punten.entries()).map(([datum, p]) => ({
    datum,
    punten: p,
    isRustdag: p < RUSTDAG_DREMPEL,
    geplandRust: heeftRustPlan.has(datum) && !heeftTrainingPlan.has(datum),
  }))
}

export function analyseerBelasting(
  sessies: BelastingSessie[],
  sporten: BelastingSport[],
  vandaag: string,
): BelastingAnalyse {
  const dagen = belastingPerDag(sessies, sporten, vandaag, 28)
  const laatste7 = dagen.slice(-7)

  const acuut = laatste7.reduce((s, d) => s + d.punten, 0)
  const totaal28 = dagen.reduce((s, d) => s + d.punten, 0)
  const chronisch = Math.round(totaal28 / 4)

  // Alleen zinvol als er echt historie is; anders lijkt elke eerste week extreem.
  const heeftHistorie = dagen.slice(0, 21).some(d => d.punten > 0) && chronisch >= 50
  const ratio = heeftHistorie ? Math.round((acuut / chronisch) * 100) / 100 : null

  const rustdagen = laatste7.filter(d => d.isRustdag).length
  const rustdagenGemist = laatste7.filter(d => d.geplandRust && !d.isRustdag).length

  // Streak: dagen achter elkaar getraind, geteld vanaf de laatste trainingsdag
  // terug. We starten bij vandaag; is vandaag (nog) rust, dan kijken we vanaf
  // gisteren, zodat de streak van gisteren niet meteen op 0 valt.
  let streak = 0
  const start = laatste7[laatste7.length - 1].isRustdag ? dagen.length - 2 : dagen.length - 1
  for (let i = start; i >= 0; i--) {
    if (dagen[i].isRustdag) break
    streak++
  }

  const sportPuntenWeek = sporten
    .filter(a => a.datum >= dagenTerug(vandaag, 6) && a.datum <= vandaag)
    .reduce((s, a) => s + sportPunten(a), 0)
  const aandeelExtraSport = acuut > 0 ? Math.round((sportPuntenWeek / acuut) * 100) / 100 : 0

  const waarschuwingen: string[] = []
  // Als rang bijhouden i.p.v. als string: alleen ophogen, nooit verlagen.
  const RANG: BelastingNiveau[] = ['ok', 'let_op', 'hoog']
  let rang = 0
  const verhoog = (n: BelastingNiveau) => { rang = Math.max(rang, RANG.indexOf(n)) }

  // Het schema plant zelf al herstel in. Vul je die dagen met een andere sport,
  // dan draai je feitelijk een zwaardere week dan het schema bedoeld heeft —
  // ook al heb je geen enkele training overgeslagen.
  if (rustdagenGemist >= 2) {
    waarschuwingen.push(`${rustdagenGemist} geplande rustdagen gevuld met een andere sport`)
    verhoog('hoog')
  } else if (rustdagenGemist === 1) {
    waarschuwingen.push('Een geplande rustdag gevuld met een andere sport')
    verhoog('let_op')
  }

  if (rustdagen === 0) {
    waarschuwingen.push('Geen enkele rustdag in de afgelopen 7 dagen')
    verhoog('hoog')
  } else if (rustdagen === 1 && acuut > chronisch) {
    waarschuwingen.push('Maar 1 rustdag in de afgelopen 7 dagen')
    verhoog('let_op')
  }

  if (streak >= 6) {
    waarschuwingen.push(`${streak} dagen achter elkaar gesport`)
    verhoog('hoog')
  } else if (streak >= 4) {
    waarschuwingen.push(`${streak} dagen achter elkaar gesport`)
    verhoog('let_op')
  }

  if (ratio !== null && ratio >= 1.5) {
    waarschuwingen.push(`Weekbelasting ${Math.round((ratio - 1) * 100)}% hoger dan je gewend bent`)
    verhoog('hoog')
  } else if (ratio !== null && ratio >= 1.3) {
    waarschuwingen.push(`Weekbelasting ${Math.round((ratio - 1) * 100)}% hoger dan je gewend bent`)
    verhoog('let_op')
  }

  const niveau = RANG[rang]

  if (aandeelExtraSport >= 0.3 && niveau !== 'ok') {
    waarschuwingen.push(`${Math.round(aandeelExtraSport * 100)}% van je belasting komt uit andere sporten`)
  }

  let advies: string | null = null
  if (niveau === 'hoog' && rustdagenGemist > 0) {
    advies = 'Je schema plant rustdagen niet voor niets in — die zijn nu opgegaan aan andere sport. Neem vandaag echt rust of maak er een korte hersteltraining van.'
  } else if (niveau === 'hoog') {
    advies = 'Neem vandaag rust of maak er een korte hersteltraining van. Je herstel loopt achter op je belasting.'
  } else if (niveau === 'let_op') {
    advies = 'Plan de komende dagen bewust een rustdag in, of vervang een training door een rustige duurloop.'
  }

  return {
    niveau, acuut, chronisch, ratio, rustdagen, rustdagenGemist, streak,
    aandeelExtraSport, dagen, waarschuwingen, advies,
  }
}

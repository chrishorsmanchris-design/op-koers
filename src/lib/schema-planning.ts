// ─── Schema scheduling utilities ─────────────────────────────────────────────
// Verdeelt sessies over beschikbare dagen rekening houdend met:
//   - Permanent geblokkeerde dagen (bijv. hockey op di/zo)
//   - Vakantiedagen (nee = geblokkeerd, beperkt = alleen lichte sessies)
//   - Prioriteit: interval > gemiddeld > makkelijk > herstel
//   - De hersteldagen die het schema zélf inplant
//
// Dat laatste punt is geen detail. Een trainingsschema is geen zak losse
// trainingen die je over de vrije dagen uitstrooit: de rustdag ná de lange
// duurloop is net zo goed onderdeel van de training als de duurloop zelf. Wie
// alleen op "welke dag is vrij?" plant, zet vrolijk een duurloop op de maandag
// na 25 km — precies de dag die het schema bewust leeg liet.
//
// Daarom kent de planner twee extra regels:
//   1. Een rustdag die grenst aan een zware dag is beschermd; daar komt niets op.
//   2. Twee zware dagen achter elkaar worden vermeden, ook over de weekgrens heen.

export type PlanSessie = {
  dag: number // 0=ma … 6=zo (voorkeur)
  type: 'hardlopen' | 'rust' | 'cross'
  intensiteit: 'herstel' | 'makkelijk' | 'gemiddeld' | 'zwaar' | 'interval'
  beschrijving: string
  duur_minuten: number | null
  afstand_km: number | null
  /**
   * Wedstrijden staan vast. De marathon zelf en een ingeschreven 15 km kort je
   * niet in omdat de rekensom van het schema beter uitkomt — daar heb je een
   * startnummer voor.
   */
  beschermd?: boolean
}

export type Vakantie = {
  start_datum: string
  eind_datum: string
  kan_trainen: 'ja' | 'nee' | 'beperkt'
}

export type GeplandeSessie = PlanSessie & {
  datum: string
  week_nummer: number
  volgorde: number
}

/**
 * Vraagt een sessie een echte hersteldag erna? Dat is wat "zwaar" hier betekent:
 * niet hoe het voelt, maar hoeveel schade het aanricht die je moet uitrusten.
 * Een interval van 60 minuten en een duurloop van 150 minuten vallen allebei in
 * die categorie, een herstelloop van 40 minuten niet.
 */
export function isZwareSessie(
  s: Pick<PlanSessie, 'type' | 'intensiteit' | 'duur_minuten' | 'afstand_km'>
): boolean {
  if (s.type === 'rust') return false
  if (s.intensiteit === 'interval' || s.intensiteit === 'zwaar') return true
  if ((s.duur_minuten ?? 0) >= 90) return true
  if ((s.afstand_km ?? 0) >= 18) return true
  return false
}

// Lager getal = hogere prioriteit (krijgt eerst een vrije dag)
function prioriteit(intensiteit: string, type: string): number {
  if (type === 'rust') return 10
  switch (intensiteit) {
    case 'interval': return 1
    case 'zwaar':    return 2
    case 'gemiddeld': return 3
    case 'makkelijk': return 4
    case 'herstel':   return 5
    default:          return 6
  }
}

/** Hoeveel er van een sessie overblijft op een dag waarop je beperkt kunt trainen. */
const BEPERKT_FACTOR = 0.65

/**
 * De vakantieversie van een sessie: korter, en zonder de scherpte. Een interval
 * of tempoduurloop wegwerken tussen twee vluchten en een safari door lukt niet,
 * en half proberen is slechter dan bewust een rustige loop doen.
 */
function beperkteVersie(s: PlanSessie): PlanSessie {
  if (s.beschermd) return s

  const duur = s.duur_minuten != null ? Math.max(20, Math.round(s.duur_minuten * BEPERKT_FACTOR)) : null
  const echteFactor = s.duur_minuten && duur ? duur / s.duur_minuten : BEPERKT_FACTOR
  const afstand = s.afstand_km != null ? Math.round(s.afstand_km * echteFactor * 10) / 10 : null

  const wasScherp = ['interval', 'zwaar', 'gemiddeld'].includes(s.intensiteit)

  return {
    ...s,
    duur_minuten: duur,
    afstand_km: afstand,
    intensiteit: wasScherp ? 'makkelijk' : s.intensiteit,
    beschrijving: wasScherp
      ? `Vakantie: ${duur ?? 30} min rustig lopen in D1 (in plaats van: ${s.beschrijving})`
      : `Vakantie: ${s.beschrijving} — ingekort tot ${duur ?? 30} min`,
  }
}

function dagDatum(weekMaandag: Date, offset: number): string {
  const d = new Date(weekMaandag)
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

type DagStatus = 'vrij' | 'beperkt' | 'geblokkeerd'

function dagStatussen(
  weekMaandag: Date,
  permanentGeblokkeerd: Set<number>,
  vakanties: Vakantie[]
): Map<number, DagStatus> {
  const map = new Map<number, DagStatus>()
  for (let dag = 0; dag < 7; dag++) {
    if (permanentGeblokkeerd.has(dag)) { map.set(dag, 'geblokkeerd'); continue }
    const datum = dagDatum(weekMaandag, dag)
    let status: DagStatus = 'vrij'
    for (const v of vakanties) {
      if (datum >= v.start_datum && datum <= v.eind_datum) {
        if (v.kan_trainen === 'nee') { status = 'geblokkeerd'; break }
        if (v.kan_trainen === 'beperkt' && status === 'vrij') status = 'beperkt'
      }
    }
    map.set(dag, status)
  }
  return map
}

export type PlanWeekOpties = {
  /**
   * Was de laatste dag van de vórige week een zware sessie? Zonder dit weet de
   * planner niet dat maandag de hersteldag na de zondagse lange duurloop is, en
   * is de weekgrens een blinde vlek waar precies de zwaarste combinaties
   * doorheen glippen.
   */
  vorigeDagZwaar?: boolean
}

/**
 * Plant een weektemplate in op beschikbare dagen.
 *
 * Sessies blijven op hun eigen dag staan tenzij die dag geblokkeerd is. Moet er
 * verplaatst worden, dan zoekt de planner in drie steeds soepelere ringen naar
 * een dag, zodat een sessie nooit stilletjes verdwijnt maar ook nooit onnodig
 * op een hersteldag belandt. Interval/zware sessies gaan als eerste, en komen
 * niet op beperkte (vakantie)dagen als er alternatieven zijn.
 */
export function planWeek(
  template: PlanSessie[],
  weekMaandag: Date,
  permanentGeblokkeerd: Set<number>,
  vakanties: Vakantie[],
  weekNr: number,
  volgordeStart: number,
  opties: PlanWeekOpties = {}
): GeplandeSessie[] {
  const statussen = dagStatussen(weekMaandag, permanentGeblokkeerd, vakanties)
  const vrijeDagen = [0, 1, 2, 3, 4, 5, 6].filter(d => statussen.get(d) !== 'geblokkeerd')
  const beperkteDagen = new Set(vrijeDagen.filter(d => statussen.get(d) === 'beperkt'))

  const vorigeDagZwaar = opties.vorigeDagZwaar ?? false

  // Welke dagen bedoelde het schema zwaar? Op basis daarvan bepalen we welke
  // rustdagen hersteldagen zijn en dus met rust gelaten moeten worden.
  const zwaarInTemplate = new Set(template.filter(isZwareSessie).map(s => s.dag))

  // Een rustdag die grenst aan een zware dag staat daar niet toevallig: hij
  // vangt de klap op (erna) of maakt de benen fris (ervoor). Die dagen zijn
  // geen opvangbak voor sessies die elders niet pasten.
  const beschermdeRustdagen = new Set<number>(
    template
      .filter(s => s.type === 'rust')
      .filter(s => (s.dag === 0 ? vorigeDagZwaar : zwaarInTemplate.has(s.dag - 1)) || zwaarInTemplate.has(s.dag + 1))
      .map(s => s.dag)
  )

  // Sorteer: rust apart, actieve sessies op prioriteit
  const actief = template
    .filter(s => s.type !== 'rust')
    .sort((a, b) => prioriteit(a.intensiteit, a.type) - prioriteit(b.intensiteit, b.type))

  const gebruikt = new Set<number>()
  // Waar de zware sessies daadwerkelijk terechtkomen — niet waar het template ze
  // wilde. Alleen daarmee kunnen we twee zware dagen op rij echt voorkomen.
  const zwaarGeplaatst = new Set<number>()
  const resultaat: GeplandeSessie[] = []
  let teller = volgordeStart

  /** Zou een zware sessie op deze dag direct naast een andere zware dag komen? */
  const naastZwaar = (dag: number): boolean =>
    (dag === 0 ? vorigeDagZwaar : zwaarGeplaatst.has(dag - 1)) || zwaarGeplaatst.has(dag + 1)

  for (const [index, sessie] of actief.entries()) {
    const zwaar = isZwareSessie(sessie)
    const magNietOpBeperkt = ['interval', 'zwaar', 'gemiddeld'].includes(sessie.intensiteit)

    // Dagen waar een sessie die nog moet komen zijn eigen plek heeft. Die pakken
    // we niet af zolang er een neutrale dag vrij is — anders verschuift één
    // geblokkeerde dinsdag de hele week als een rij dominostenen.
    const geclaimd = new Set(actief.slice(index + 1).map(s => s.dag))

    const beschikbaar = vrijeDagen.filter(d => !gebruikt.has(d))

    const ringen = [
      // 1. Alles klopt: geen hersteldag, geen zware dag ernaast, niemands plek ingepikt.
      beschikbaar.filter(d => !beschermdeRustdagen.has(d) && !geclaimd.has(d) && !(zwaar && naastZwaar(d))),
      // 2. Mag van een ander z'n dag af, maar herstel blijft herstel.
      beschikbaar.filter(d => !beschermdeRustdagen.has(d) && !(zwaar && naastZwaar(d))),
      // 3. Alleen nog de hersteldagen over — liever een zware week dan een gat.
      beschikbaar.filter(d => !beschermdeRustdagen.has(d)),
      beschikbaar,
    ]

    let kandidaten = ringen.find(r => r.length > 0) ?? []
    if (kandidaten.length === 0) continue // Week te vol of alles geblokkeerd

    // Zware sessies mogen niet op beperkte (vakantie) dagen als er alternatieven zijn
    if (magNietOpBeperkt) {
      const zonderBeperkt = kandidaten.filter(d => !beperkteDagen.has(d))
      if (zonderBeperkt.length > 0) kandidaten = zonderBeperkt
    }

    // Voorkeur: eigen dag, anders dichtstbijzijnde toegestane dag
    const dag = kandidaten.includes(sessie.dag)
      ? sessie.dag
      : [...kandidaten].sort((a, b) => Math.abs(a - sessie.dag) - Math.abs(b - sessie.dag))[0]

    gebruikt.add(dag)
    if (zwaar) zwaarGeplaatst.add(dag)

    // Belandt de sessie tóch op een beperkte vakantiedag — en in een week waarin
    // álle dagen beperkt zijn gebeurt dat onvermijdelijk — dan is "voorkeur voor
    // een andere dag" geen bescherming meer. Op zo'n dag krijg je een kortere,
    // rustigere versie: dat is wat "beperkt kunnen trainen" betekent. Zonder dit
    // plande een vakantieweek gewoon de volle mep, inclusief de langste duurloop
    // van het hele schema.
    const opBeperkteDag = beperkteDagen.has(dag)
    const aangepast = opBeperkteDag ? beperkteVersie(sessie) : sessie
    if (opBeperkteDag && zwaar) zwaarGeplaatst.delete(dag)

    resultaat.push({ ...aangepast, dag, datum: dagDatum(weekMaandag, dag), week_nummer: weekNr, volgorde: teller++ })
  }

  // Rustdagen voor overgebleven vrije dagen
  for (const dag of vrijeDagen.filter(d => !gebruikt.has(d))) {
    resultaat.push({
      dag, type: 'rust', intensiteit: 'herstel',
      beschrijving: 'Rust – geen training',
      duur_minuten: null, afstand_km: null,
      datum: dagDatum(weekMaandag, dag),
      week_nummer: weekNr, volgorde: teller++,
    })
  }

  return resultaat.sort((a, b) => a.dag - b.dag)
}

/** Geeft de maandag terug van de week die een datum bevat */
export function getMaandag(datum: Date): Date {
  const d = new Date(datum)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() // 0=zo
  d.setDate(d.getDate() + (dow === 0 ? 1 : 1 - dow))
  return d
}

/** Volgende maandag vanaf vandaag (of maandag van de huidige week als dat vandaag is) */
export function volgendeMaandag(vandaag: Date): Date {
  const d = new Date(vandaag)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  // Als vandaag maandag → start deze week, anders → volgende maandag
  const diff = dow === 1 ? 0 : (8 - dow) % 7 || 7
  d.setDate(d.getDate() + diff)
  return d
}

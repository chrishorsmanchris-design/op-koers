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

/**
 * Sorteert sessies op "wie kiest eerst zijn dag". Zware sessies gaan vóór alle
 * lichte, ongeacht hun intensiteitslabel: de lange duurloop van 170 minuten
 * staat als 'makkelijk' in het schema en verloor daarmee van elke tempoloop van
 * veertig minuten, terwijl hij juist de sessie is waar de hele week om draait.
 */
function opPrioriteit(a: PlanSessie, b: PlanSessie): number {
  const zwaar = Number(isZwareSessie(b)) - Number(isZwareSessie(a))
  if (zwaar !== 0) return zwaar
  return prioriteit(a.intensiteit, a.type) - prioriteit(b.intensiteit, b.type)
}

/**
 * Mag deze sessie op de dag direct ná een zware inspanning?
 *
 * Alleen als het herstel is. Het schema zet zelf regelmatig een herstelloop of
 * een stuk fietsen achter een lange duurloop — dat is actief herstel en hoort
 * erbij. Een duurloop van vijftig minuten in D2 hoort er niet bij, ook niet als
 * hij "makkelijk" heet.
 */
function magNaZwaar(s: PlanSessie): boolean {
  return s.type === 'cross' || s.intensiteit === 'herstel'
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
  /**
   * Dagen in deze week waar niets meer te plannen valt: al voorbij, al gelopen,
   * of bewust overgeslagen.
   */
  bezetteDagen?: number[]
  /**
   * Dagen in deze week waarop al écht een zware inspanning geleverd is. Dit is
   * het verschil tussen een schema en een trainingsplan: 25 km op donderdag is
   * geen voornemen meer maar een feit, en de hersteldag erna dus ook niet.
   * Zonder dit keek de planner alleen naar wat hij zélf had bedacht.
   */
  gelopenZwaar?: number[]
}

/**
 * Plant een weektemplate in op beschikbare dagen.
 *
 * Sessies blijven op hun eigen dag staan tenzij die dag geblokkeerd is. Het
 * plannen gebeurt in twee ronden, en die volgorde is de hele truc:
 *
 *   1. Eerst de zware sessies. Zij mogen nooit tegen een andere zware dag aan —
 *      ook niet tegen een dag waarop je al gelopen hébt, en ook niet over de
 *      weekgrens heen.
 *   2. Dán de lichte. Pas op dat moment is bekend waar het herstel moet vallen,
 *      want dat volgt uit waar de zware sessies wérkelijk staan.
 *
 * Voorheen werden de te beschermen hersteldagen vooraf bepaald uit het
 * template. Zodra een geblokkeerde dag iets liet opschuiven — en met een vaste
 * hockeydag en een vrije zondag schuift er élke week iets op — beschermde die
 * berekening dagen waar niets meer stond, en lag de echte hersteldag open voor
 * de eerste sessie die nergens anders paste.
 *
 * Past een sessie niet zonder dat herstel op te eten, dan valt hij weg. Dat is
 * geen tekortkoming van de planner maar het antwoord: bij vijf beschikbare dagen
 * en zes sessies is er geen indeling waarin alles kan, en dan is een gemiste
 * rustige duurloop goedkoper dan een gemiste hersteldag.
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
  const bezetteDagen = new Set(opties.bezetteDagen ?? [])
  const vrijeDagen = [0, 1, 2, 3, 4, 5, 6]
    .filter(d => statussen.get(d) !== 'geblokkeerd' && !bezetteDagen.has(d))
  const beperkteDagen = new Set(vrijeDagen.filter(d => statussen.get(d) === 'beperkt'))

  const vorigeDagZwaar = opties.vorigeDagZwaar ?? false

  const gebruikt = new Set<number>()
  // Waar de zware belasting daadwerkelijk ligt. Begint niet leeg: wat er deze
  // week al gelopen is telt volledig mee, want je benen weten niet of een
  // inspanning in het schema stond.
  const zwaarGeplaatst = new Set<number>(opties.gelopenZwaar ?? [])
  const resultaat: GeplandeSessie[] = []
  let teller = volgordeStart

  /** Grenst deze dag aan een zware dag? Dan mag er geen tweede zware dag naast. */
  const naastZwaar = (dag: number): boolean =>
    (dag === 0 ? vorigeDagZwaar : zwaarGeplaatst.has(dag - 1)) || zwaarGeplaatst.has(dag + 1)

  /** Is dit de dag ná een zware inspanning? Dan is het een hersteldag. */
  const naZwaar = (dag: number): boolean =>
    dag === 0 ? vorigeDagZwaar : zwaarGeplaatst.has(dag - 1)

  const actief = template.filter(s => s.type !== 'rust').sort(opPrioriteit)
  const zware = actief.filter(isZwareSessie)
  const lichte = actief.filter(s => !isZwareSessie(s))

  const plaats = (sessie: PlanSessie, toegestaan: (dag: number) => boolean): void => {
    const beschikbaar = vrijeDagen.filter(d => !gebruikt.has(d) && toegestaan(d))
    if (beschikbaar.length === 0) return // Valt weg: er is geen dag waar dit kan.

    // Zware en stevige sessies mogen niet op beperkte (vakantie)dagen als er
    // alternatieven zijn.
    const magNietOpBeperkt = ['interval', 'zwaar', 'gemiddeld'].includes(sessie.intensiteit)
    const zonderBeperkt = beschikbaar.filter(d => !beperkteDagen.has(d))
    const kandidaten = magNietOpBeperkt && zonderBeperkt.length > 0 ? zonderBeperkt : beschikbaar

    // Voorkeur: eigen dag, anders de dichtstbijzijnde toegestane dag
    const dag = kandidaten.includes(sessie.dag)
      ? sessie.dag
      : [...kandidaten].sort((a, b) => Math.abs(a - sessie.dag) - Math.abs(b - sessie.dag))[0]

    gebruikt.add(dag)

    // Belandt de sessie tóch op een beperkte vakantiedag — en in een week waarin
    // álle dagen beperkt zijn gebeurt dat onvermijdelijk — dan is "voorkeur voor
    // een andere dag" geen bescherming meer. Op zo'n dag krijg je een kortere,
    // rustigere versie: dat is wat "beperkt kunnen trainen" betekent. Zonder dit
    // plande een vakantieweek gewoon de volle mep, inclusief de langste duurloop
    // van het hele schema.
    const opBeperkteDag = beperkteDagen.has(dag)
    const aangepast = opBeperkteDag ? beperkteVersie(sessie) : sessie
    if (isZwareSessie(aangepast)) zwaarGeplaatst.add(dag)

    resultaat.push({ ...aangepast, dag, datum: dagDatum(weekMaandag, dag), week_nummer: weekNr, volgorde: teller++ })
  }

  // Ronde 1 — de zware sessies kiezen eerst, en nooit naast elkaar.
  for (const sessie of zware) plaats(sessie, d => !naastZwaar(d))

  // Ronde 2 — de lichte sessies. Op de dag ná een zware dag mag alleen herstel:
  // het schema zet daar zelf een herstelloop of een stuk fietsen, geen duurloop.
  const lichtToegestaan = (sessie: PlanSessie) => (d: number) => !naZwaar(d) || magNaZwaar(sessie)
  for (const sessie of lichte) plaats(sessie, lichtToegestaan(sessie))

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

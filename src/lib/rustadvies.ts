/**
 * Herstelcheck op de training van vandaag.
 *
 * `schema-planning.ts` zorgt dat het plán klopt: rustdagen blijven rustdagen en
 * er staan geen twee zware dagen op elkaar. Maar een plan wordt weken vooruit
 * gemaakt en de werkelijkheid houdt zich er niet aan. Je loopt 25,5 km waar 22
 * gepland stond, je schuift de lange duurloop een dag op, je hockeyt er een
 * avond tussendoor. Het schema weet daar niets van — Strava wél.
 *
 * Daarom kijkt deze module niet naar wat er gepland stond, maar naar wat er
 * daadwerkelijk in je benen zit, en legt dat naast de training van vandaag. Hij
 * verandert het schema niet: hij zegt wat er aan de hand is en laat de keuze
 * aan jou. Een app die ongevraagd trainingen schrapt is net zo onbruikbaar als
 * een app die blind "ga rennen" roept de dag na je langste loop.
 */

import { sessiePunten, sportPunten, type BelastingSessie, type BelastingSport } from './belasting'

export type RustAdviesNiveau = 'geen' | 'let_op' | 'rust'

export interface RustAdvies {
  niveau: RustAdviesNiveau
  /** Korte kop, bijv. "Gisteren 25,5 km — neem vandaag rust". */
  kop: string
  /** Waaróm we dit zeggen, in gewone taal. Altijd met de feiten erbij. */
  uitleg: string
  /** Wat vandaag wél kan, of null als er niets beters te verzinnen is. */
  alternatief: string | null
}

const GEEN_ADVIES: RustAdvies = { niveau: 'geen', kop: '', uitleg: '', alternatief: null }

/**
 * Vanaf hier vraagt een dag om herstel erna. Dezelfde grens als
 * `isZwareSessie` in schema-planning, maar dan op wat er écht gebeurd is.
 */
const ZWAAR_MINUTEN = 90
const ZWAAR_KM = 18
/** Belastingpunten op één dag waarboven de dag zwaar was, ongeacht de sport. */
const ZWAAR_PUNTEN = 110

/** Intensiteiten die vandaag te veel gevraagd zijn na een zware dag. */
const INSPANNEND = new Set(['gemiddeld', 'zwaar', 'interval'])

function dagenTerug(vandaag: string, n: number): string {
  const d = new Date(vandaag + 'T12:00:00')
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function nl(getal: number, decimalen = 1): string {
  return getal.toFixed(decimalen).replace('.', ',').replace(/,0$/, '')
}

export interface DagInspanning {
  punten: number
  km: number
  minuten: number
  zwaar: boolean
  /** Korte omschrijving van wat je die dag deed, voor in de uitleg. */
  omschrijving: string | null
}

/**
 * Wat heb je op deze datum daadwerkelijk gedaan? Alleen voltooide sessies —
 * een geplande training die je hebt laten staan kost je benen niets.
 */
export function inspanningOpDag(
  datum: string,
  sessies: BelastingSessie[],
  sporten: BelastingSport[],
): DagInspanning {
  const opDag = sessies.filter(s => s.datum === datum && s.voltooid && s.type !== 'rust')
  const sportOpDag = sporten.filter(a => a.datum === datum)

  const km = opDag.reduce((s, x) => s + (x.afstand_km ?? 0), 0)
  const minuten =
    opDag.reduce((s, x) => s + (x.duur_minuten ?? 0), 0) +
    sportOpDag.reduce((s, x) => s + x.duur_minuten, 0)
  const punten =
    opDag.reduce((s, x) => s + sessiePunten(x), 0) +
    sportOpDag.reduce((s, x) => s + sportPunten(x), 0)

  const loopMinuten = opDag
    .filter(x => x.type === 'hardlopen')
    .reduce((s, x) => s + (x.duur_minuten ?? 0), 0)

  const zwaar =
    km >= ZWAAR_KM ||
    loopMinuten >= ZWAAR_MINUTEN ||
    punten >= ZWAAR_PUNTEN ||
    opDag.some(x => x.intensiteit === 'interval' || x.intensiteit === 'zwaar')

  const delen: string[] = []
  if (km > 0) delen.push(`${nl(km)} km`)
  else if (loopMinuten > 0) delen.push(`${loopMinuten} min hardlopen`)
  for (const a of sportOpDag) delen.push(`${a.duur_minuten} min ${a.sport}`)

  return { punten, km, minuten, zwaar, omschrijving: delen.join(' + ') || null }
}

export interface RustAdviesInput {
  vandaag: string
  /** De training die vandaag op het programma staat, of null bij een rustdag. */
  gepland: Pick<BelastingSessie, 'type' | 'intensiteit' | 'duur_minuten' | 'afstand_km'> | null
  /** Of die training al afgevinkt is — dan valt er niets meer te adviseren. */
  geplandVoltooid?: boolean
  /** Voltooide sessies incl. Strava-imports, minimaal de laatste 3 dagen. */
  sessies: BelastingSessie[]
  sporten: BelastingSport[]
}

export function bepaalRustAdvies({
  vandaag,
  gepland,
  geplandVoltooid = false,
  sessies,
  sporten,
}: RustAdviesInput): RustAdvies {
  // Staat er niets, of heb je het al gedaan? Dan is er niets te waarschuwen.
  if (!gepland || gepland.type === 'rust' || geplandVoltooid) return GEEN_ADVIES

  const gisteren = inspanningOpDag(dagenTerug(vandaag, 1), sessies, sporten)
  const eergisteren = inspanningOpDag(dagenTerug(vandaag, 2), sessies, sporten)
  const alGelopenVandaag = inspanningOpDag(vandaag, sessies, sporten)

  // Vandaag al gelopen buiten het schema om: dan is de geplande training van
  // vandaag niet het probleem, die is feitelijk al ingevuld.
  if (alGelopenVandaag.punten > 0) return GEEN_ADVIES

  const inspannend = INSPANNEND.has(gepland.intensiteit ?? '')
  const langGepland = (gepland.duur_minuten ?? 0) >= 60 || (gepland.afstand_km ?? 0) >= 12
  const rustig = !inspannend && !langGepland

  const gisterenTekst = gisteren.omschrijving ? `Je deed gisteren ${gisteren.omschrijving}.` : ''

  if (gisteren.zwaar) {
    // Een herstelloop van 40 minuten ná een lange duurloop is precies waar hij
    // voor bedoeld is. Alleen wat écht inspanning vraagt is hier een probleem.
    if (rustig) return GEEN_ADVIES

    if (inspannend) {
      return {
        niveau: 'rust',
        kop: 'Je benen hebben herstel nodig',
        uitleg: `${gisterenTekst} Een inspannende training een dag later levert vooral vermoeidheid op — de winst van een lange duurloop zit in het herstel erna, niet in de training die erop volgt.`,
        alternatief: 'Neem vandaag rust, of maak er een losse herstelloop van 30-40 minuten van.',
      }
    }

    return {
      niveau: 'let_op',
      kop: 'Houd het vandaag rustig',
      uitleg: `${gisterenTekst} Deze training staat gepland als rustig, maar na zo'n dag telt hij zwaarder dan hij op papier lijkt.`,
      alternatief: 'Loop hem op herstel-tempo, of kort hem in tot 30-40 minuten.',
    }
  }

  // Twee stevige dagen op rij en vandaag een derde: ook zonder één uitschieter
  // stapelt dat op. Deze check vangt de weken waarin niets extreem was maar er
  // ook nooit een dag tussen zat.
  if (gisteren.punten > 0 && eergisteren.punten > 0 && inspannend) {
    return {
      niveau: 'let_op',
      kop: 'Derde trainingsdag op rij',
      uitleg: `Je trainde gisteren én eergisteren${gisteren.omschrijving ? ` (gisteren ${gisteren.omschrijving})` : ''}. Vandaag komt daar een inspannende training bovenop, zonder hersteldag ertussen.`,
      alternatief: 'Overweeg deze training een dag op te schuiven, of hem rustiger te lopen.',
    }
  }

  return GEEN_ADVIES
}

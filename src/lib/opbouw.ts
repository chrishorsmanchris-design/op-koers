/**
 * Opbouwrem: voorkomt dat het schema je na een onderbreking terugzet op het
 * volume dat je zou hebben gehad als je gewoon doorgetraind had.
 *
 * Een standaardschema van 14 weken gaat ervan uit dat je alle 14 weken loopt.
 * Zodra er twee weken Kenia tussen zitten klopt die aanname niet meer, maar het
 * schema weet dat niet: week 10 staat op 79 km met een duurloop van 28 km, ook
 * als je de twee weken ervoor niets gedaan hebt. Dat is precies het patroon
 * waar mensen hun kuit of achillespees mee slopen, vlak voor de wedstrijd waar
 * ze een half jaar voor getraind hebben.
 *
 * De rem meet dezelfde grootheid die `belasting.ts` achteraf gebruikt om te
 * waarschuwen — hoeveel je week afwijkt van wat je aankon — maar dan vooraf, bij
 * het maken van het plan. Daarnaast een aparte rem op de lange duurloop, want
 * die ene sessie is een groter risico dan het weektotaal suggereert: 28 km lopen
 * als je langste loop 12 km was gaat mis, ook in een verder rustige week.
 *
 * De referentie is bewust géén gemiddelde over de laatste vier weken, ook al is
 * dat de klassieke ACWR-noemer. Een schema hoort hersteldweken te bevatten, en
 * een gemiddelde straft je daarvoor af: na een rustige week valt de noemer, en
 * dan lijkt de gewone opbouwweek erna ineens een gevaarlijke sprong. In plaats
 * daarvan kijken we naar de zwáárste week die je recent gedaan hebt, met een
 * verval per week die daarna verstreken is. Wat je drie weken geleden aankon
 * kun je grotendeels nog steeds, en wat je helemáál niet gedaan hebt telt als
 * niets — precies het onderscheid dat een gemiddelde niet maakt.
 *
 * De rem schaalt alleen naar beneden. Een week die binnen de grenzen valt blijft
 * exact zoals het schema hem bedoeld heeft.
 *
 * Wat je écht gedaan hebt gaat vóór wat er gepland stond. Voor weken die voorbij
 * zijn levert de aanroeper `werkelijk` aan, uit Strava en je afgevinkte sessies.
 * Dat is het verschil tussen "je was in Kenia, dus we nemen aan dat je niets
 * gedaan hebt" en "je hebt in Kenia drie keer per week gelopen, dus je hoeft
 * niet opnieuw op te bouwen". Zonder die terugkoppeling zou de rem je straffen
 * voor een vakantie waarin je gewoon doorgetraind hebt.
 */

import { sessiePunten } from './belasting'
import type { GeplandeSessie } from './schema-planning'

/** Hoeveel de week mag uitstijgen boven de zwaarste week die je recent aankon. */
const MAX_GROEI_WEEK = 1.3
/**
 * Hoeveel van je opgebouwde niveau per week vervalt als je niets doet. Met 0,9
 * ben je na twee weken stilzitten terug op ~80%: genoeg verval om een terugkeer
 * te laten klimmen in plaats van springen, weinig genoeg om te erkennen dat een
 * vakantie je opbouw niet uitwist.
 *
 * Dat het verval (0,9) kleiner is dan de toegestane groei (1,3) is wat de rem
 * stabiel maakt: het plafond ligt altijd boven de vorige week, dus een terugkeer
 * kan alleen maar stijgen. Zonder die marge zakt de rem in zijn eigen staart.
 */
const VERVAL_PER_WEEK = 0.9
/**
 * De laagste groei die de rem ooit toestaat, precies de tegenhanger van het
 * verval hierboven: bij deze waarde ligt het plafond exact op de week ervoor.
 *
 * Zonder deze bodem kan feedback de rem in zijn eigen staart laten zakken. Een
 * groei ónder 1/0,9 betekent dat het plafond onder de vorige week uitkomt, en
 * omdat elke geremde week de referentie verlaagt gaat de week erna nóg lager —
 * tot je twee weken voor de marathon op een duurloop van 10 km staat. Je gevoel
 * mag de opbouw stilzetten, maar niet afbreken. Vind je het écht te zwaar, dan
 * hoort daar een gesprek over je doel bij, geen schema dat stilletjes wegzakt.
 */
const MIN_GROEI = 1 / VERVAL_PER_WEEK
/** Hoe ver terug we kijken naar wat je aankon. */
const TERUGBLIK_WEKEN = 6
/** Hoeveel de langste loop per week mag groeien t.o.v. wat je recent liep. */
const MAX_GROEI_LANGE_DUURLOOP = 1.3
/** Onder deze duur is een training niet meer zinvol; dan liever deze ondergrens. */
const MIN_DUUR_MINUTEN = 20
/**
 * Onder deze correctie laten we het schema met rust. Een duurloop van 22 km
 * terugbrengen naar 21,6 km beschermt niemand tegen iets, maar zet wel een
 * "aangepast"-melding in beeld die de rest ongeloofwaardig maakt.
 */
const MIN_ZINVOLLE_CORRECTIE = 0.05
/**
 * Hoeveel je feedback het plafond verschuift als je gewoon je schema draait.
 * Klein, en dat is de bedoeling: je volgt een beproefd plan, en één zware
 * dinsdag is geen reden om de opbouw om te gooien.
 */
const GEVOEL_INVLOED_NORMAAL = 0.1
/**
 * En hoeveel na een onderbreking. Fors meer, want dan is je eigen oordeel het
 * beste bewijs dat er is: het schema gaat uit van een opbouw die je niet gedaan
 * hebt, en niemand — de app niet en het PDF-schema al helemaal niet — weet waar
 * je conditie na twee weken Kenia werkelijk staat. Dat jij "te zwaar" aanvinkt
 * in je eerste week terug zegt precies datgene wat de rekensom niet weet.
 */
const GEVOEL_INVLOED_NA_ONDERBREKING = 0.25
/** Over hoeveel weken feedback meetelt. */
const GEVOEL_WEKEN = 3
/**
 * Vanaf dit gevoel grijpt de rem ook in zónder onderbreking. Rond de -0,4 zit je
 * op "meerdere trainingen zwaar, of één te zwaar" — een patroon, geen incident.
 */
const GEVOEL_DREMPEL = -0.4
/**
 * En dan nog nooit meer dan een tiende eraf. Zonder onderbreking is er geen
 * reden om aan te nemen dat het schema er structureel naast zit; dit is
 * bijsturen, geen herplannen.
 */
const MAX_TRIM_OP_GEVOEL = 0.1

/** Hoe zwaar elke rating weegt, van -1 (te zwaar) tot +1 (topdag). */
const GEVOEL_PER_RATING: Record<string, number> = {
  te_zwaar: -1,
  zwaar: -0.5,
  goed: 0,
  beter_dan_verwacht: 0.5,
  topdag: 1,
}

/**
 * Vertaalt de ratings van één week naar één getal tussen -1 en 1. `null` als je
 * die week geen feedback gegeven hebt — dat is iets anders dan "het ging goed".
 */
export function gevoelUitRatings(ratings: string[]): number | null {
  const scores = ratings.map(r => GEVOEL_PER_RATING[r]).filter(s => s !== undefined)
  if (!scores.length) return null
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

/** Wat je een week werkelijk gedaan hebt, en hoe het voelde. */
export interface WerkelijkeWeek {
  /** Belastingpunten die je die week écht gemaakt hebt. */
  punten: number
  /** Langste werkelijk gelopen afstand die week, in km. */
  langsteKm: number
  /** Gemiddeld gevoel uit je feedback, -1 tot 1. `null` = geen feedback gegeven. */
  gevoel: number | null
}

export interface OpbouwAanpassing {
  week_nummer: number
  reden: 'weekvolume' | 'lange_duurloop' | 'gevoel'
  /** Toegepaste schaalfactor, afgerond op honderdsten. */
  factor: number
  /** Wat het was en wat het werd, in km. */
  vanKm: number
  naarKm: number
  uitleg: string
}

export interface OpbouwResultaat {
  weken: GeplandeSessie[][]
  aanpassingen: OpbouwAanpassing[]
}

function punten(s: GeplandeSessie): number {
  return sessiePunten({
    datum: s.datum,
    type: s.type,
    duur_minuten: s.duur_minuten,
    afstand_km: s.afstand_km,
    intensiteit: s.intensiteit,
    voltooid: true,
  })
}

function weekKm(week: GeplandeSessie[]): number {
  return week.reduce((som, s) => som + (s.afstand_km ?? 0), 0)
}

/** Schaalt duur en afstand mee. Tempo blijft gelijk, het volume gaat omlaag. */
function schaal(s: GeplandeSessie, factor: number): GeplandeSessie {
  if (s.type === 'rust' || s.beschermd) return s
  const duur = s.duur_minuten != null
    ? Math.max(MIN_DUUR_MINUTEN, Math.round(s.duur_minuten * factor))
    : null
  // De afstand volgt de wérkelijk toegepaste duur, niet de gevraagde factor.
  // Anders staat er na afronding op de ondergrens een half uur lopen met de
  // kilometers van een duurloop erbij.
  const echteFactor = s.duur_minuten && duur ? duur / s.duur_minuten : factor
  return {
    ...s,
    duur_minuten: duur,
    afstand_km: s.afstand_km != null ? Math.round(s.afstand_km * echteFactor * 10) / 10 : null,
  }
}

/**
 * De zwaarste week uit de terugblik, met verval naar de leeftijd ervan: een week
 * van vier weken geleden telt voor 0,9⁴ mee. `historie` staat op volgorde, de
 * laatste is de meest recente.
 */
function referentie(historie: number[]): number {
  const recent = historie.slice(-TERUGBLIK_WEKEN)
  return recent.reduce((hoogste, waarde, i) => {
    const wekenGeleden = recent.length - i
    return Math.max(hoogste, waarde * VERVAL_PER_WEEK ** wekenGeleden)
  }, 0)
}

/**
 * Loopt de weken op volgorde af en remt af waar de sprong te groot wordt.
 *
 * Belangrijk: de referentie wordt opgebouwd uit de weken zoals ze ná de rem in
 * het plan staan, niet zoals het schema ze oorspronkelijk bedoelde.
 * Dat is wat de terugkeer-opbouw laat werken — je klimt in een paar weken terug
 * naar niveau in plaats van in één keer, en het schema loopt vanzelf weer met
 * het origineel mee zodra je bij bent.
 */
export function beperkOpbouw(
  weken: GeplandeSessie[][],
  /**
   * Hetzelfde plan zoals het eruit had gezien zonder vakanties, week voor week
   * op dezelfde volgorde. Dit is wat de rem "achterstand" laat betekenen. Zonder
   * die vergelijking kan de rem alleen naar het plan zelf kijken, en dan gaat
   * hij ook een ongestoord schema corrigeren: elke hersteldweek verlaagt de
   * referentie, waarna de gewone opbouwweek erna als een sprong oogt.
   */
  schemaWeken: GeplandeSessie[][],
  /**
   * Wat je werkelijk gedaan hebt, per week, op dezelfde volgorde als `weken`.
   * `null` of ontbrekend voor weken die nog moeten komen — daar is het plan het
   * beste dat we hebben.
   */
  werkelijk: (WerkelijkeWeek | null)[] = [],
): OpbouwResultaat {
  const resultaat: GeplandeSessie[][] = []
  const aanpassingen: OpbouwAanpassing[] = []

  const historiePunten: number[] = []
  const historieLangste: number[] = []
  const schemaPunten: number[] = []
  const schemaLangste: number[] = []
  const historieGevoel: (number | null)[] = []

  for (const [index, origineel] of weken.entries()) {
    let week = origineel.map(s => ({ ...s }))
    const schemaWeek = schemaWeken[index] ?? origineel
    const gedaan = werkelijk[index] ?? null

    // Het gemiddelde gevoel over de weken hiervóór. Weken zonder feedback tellen
    // niet mee: niets invullen is geen oordeel, en zou anders als "ging prima"
    // worden gelezen.
    const gevoelWaarden = historieGevoel.slice(-GEVOEL_WEKEN).filter((g): g is number => g !== null)
    const gevoel = gevoelWaarden.length
      ? gevoelWaarden.reduce((a, b) => a + b, 0) / gevoelWaarden.length
      : null

    // Loop je achter op wat het schema had opgebouwd, dan geldt de aanname
    // waarop het schema deze week baseerde niet meer. Dat is het moment waarop
    // de rem mag ingrijpen — en waarop je eigen feedback zwaarder gaat wegen.
    const aankunnen = referentie(historiePunten)
    const naOnderbreking = aankunnen < referentie(schemaPunten)
    const gevoelInvloed = naOnderbreking ? GEVOEL_INVLOED_NA_ONDERBREKING : GEVOEL_INVLOED_NORMAAL
    const gevoelFactor = 1 + (gevoel ?? 0) * gevoelInvloed
    const groei = (basis: number) => Math.max(basis * gevoelFactor, MIN_GROEI)

    // ── 1. De lange duurloop ────────────────────────────────────────────────
    // Eerst, want inkorten hiervan verlaagt ook meteen het weektotaal.
    const langsteReferentie = referentie(historieLangste)
    // Loop je niet achter op het schema, dan is een lange duurloop die het
    // schema hier neerzet precies de opbouw die je gevolgd hebt. Met rust laten.
    if (langsteReferentie > 0 && langsteReferentie < referentie(schemaLangste)) {
      const plafond = langsteReferentie * groei(MAX_GROEI_LANGE_DUURLOOP)
      const teLang = week.filter(s => !s.beschermd && (s.afstand_km ?? 0) > plafond)
      // Alles boven het plafond gaat mee terug, maar er komt één melding per week
      // over de langste loop. Vier regels "duurloop teruggebracht van 7,5 naar
      // 6,5 km" over vier gewone trainingen leest als een storing, niet als advies.
      const langste = teLang.reduce<GeplandeSessie | null>(
        (max, s) => ((s.afstand_km ?? 0) > (max?.afstand_km ?? 0) ? s : max), null)

      if (langste && plafond / langste.afstand_km! <= 1 - MIN_ZINVOLLE_CORRECTIE) {
        const van = langste.afstand_km!
        const teLangeIds = new Set(teLang.map(s => s.datum + s.volgorde))
        week = week.map(s =>
          teLangeIds.has(s.datum + s.volgorde) ? schaal(s, plafond / s.afstand_km!) : s)
        const naar = week.find(s => s.datum + s.volgorde === langste.datum + langste.volgorde)
        aanpassingen.push({
          week_nummer: langste.week_nummer,
          reden: 'lange_duurloop',
          factor: Math.round((plafond / van) * 100) / 100,
          vanKm: van,
          naarKm: naar?.afstand_km ?? 0,
          uitleg: `Lange duurloop teruggebracht van ${van} naar ${naar?.afstand_km} km — je langste loop in de weken hiervoor was ${Math.round(Math.max(0, ...historieLangste.slice(-TERUGBLIK_WEKEN)) * 10) / 10} km.`,
        })
      }
    }

    // ── 2. Het weekvolume ───────────────────────────────────────────────────
    // Wedstrijden tellen wel mee in wat je lichaam te verduren krijgt, maar
    // vallen buiten de rem: die kort je niet in.
    const schaalbaar = week.filter(s => !s.beschermd && s.type !== 'rust')
    const schaalbarePunten = schaalbaar.reduce((som, s) => som + punten(s), 0)
    const beschermdePunten = week
      .filter(s => s.beschermd)
      .reduce((som, s) => som + punten(s), 0)

    // Zonder onderbreking grijpt de rem alleen in als je feedback een patroon
    // laat zien. Het schema mag dan zijn eigen sprongen maken — dat is de opbouw
    // waar je voor gekozen hebt — maar niet tegen de klippen op.
    const gevoelsrem = !naOnderbreking && gevoel !== null && gevoel <= GEVOEL_DREMPEL
    if (aankunnen > 0 && schaalbarePunten > 0 && (naOnderbreking || gevoelsrem)) {
      // Zonder onderbreking is er geen bewijs dat het schéma ernaast zit, alleen
      // dat déze weken zwaar vallen. Dan corrigeren we hooguit een tiende, in
      // plaats van terug te klemmen op wat de rekensom zegt dat je aankunt.
      const bodem = naOnderbreking
        ? 0
        : (schaalbarePunten + beschermdePunten) * (1 - MAX_TRIM_OP_GEVOEL)
      const plafond = Math.max(aankunnen * groei(MAX_GROEI_WEEK), bodem)
      const ruimte = plafond - beschermdePunten

      if (schaalbarePunten > ruimte && ruimte > 0 &&
          ruimte / schaalbarePunten <= 1 - MIN_ZINVOLLE_CORRECTIE) {
        const factor = ruimte / schaalbarePunten
        const vanKm = weekKm(week)
        week = week.map(s => schaal(s, factor))
        const naarKm = Math.round(weekKm(week) * 10) / 10
        aanpassingen.push({
          week_nummer: week[0]?.week_nummer ?? 0,
          reden: naOnderbreking ? 'weekvolume' : 'gevoel',
          factor: Math.round(factor * 100) / 100,
          vanKm: Math.round(vanKm * 10) / 10,
          naarKm,
          uitleg: naOnderbreking
            ? `Weekvolume teruggebracht naar ${naarKm} km — na wat je de weken hiervoor gedaan hebt is ${Math.round(vanKm * 10) / 10} km een te grote sprong.`
            : `Weekvolume teruggebracht naar ${naarKm} km — je gaf de afgelopen weken aan dat de trainingen zwaar vielen.`,
        })
      }
    }

    // Historie bijwerken. Wat je werkelijk gedaan hebt gaat vóór het plan: een
    // vakantieweek waarin je toch drie keer gelopen hebt telt als die drie
    // trainingen, niet als de nul die er gepland stond.
    historiePunten.push(gedaan?.punten ?? week.reduce((som, s) => som + punten(s), 0))
    historieLangste.push(gedaan?.langsteKm ?? Math.max(0, ...week.map(s => s.afstand_km ?? 0)))
    historieGevoel.push(gedaan?.gevoel ?? null)
    schemaPunten.push(schemaWeek.reduce((som, s) => som + punten(s), 0))
    schemaLangste.push(Math.max(0, ...schemaWeek.map(s => s.afstand_km ?? 0)))

    resultaat.push(week)
  }

  return { weken: resultaat, aanpassingen }
}

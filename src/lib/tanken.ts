/**
 * Wat je onderweg nodig hebt: koolhydraten, vocht en natrium.
 *
 * Alle getallen hieronder komen uit de gezamenlijke position stand van de
 * Academy of Nutrition and Dietetics, Dietitians of Canada en het American
 * College of Sports Medicine, "Nutrition and Athletic Performance" (Thomas,
 * Erdman & Burke, Med Sci Sports Exerc 2016;48(3):543-568). Waar deze code een
 * getal noemt staat erbij uit welke tabel of alinea het komt, zodat het
 * controleerbaar is en niet op mijn woord hoeft.
 *
 * Twee dingen die in een eerdere versie van dit bestand fout stonden en die het
 * commentaar hier expliciet wil vasthouden:
 *
 * 1. Vocht werd bij warm weer opgeschroefd tot 1000 ml/uur. De richtlijn noemt
 *    0,4–0,8 L/uur als het plan dat voor de meeste sporters en evenementen
 *    werkt, en waarschuwt in dezelfde alinea dat juist recreatieve sporters
 *    régelmatig méér drinken dan ze zweten. Dat is de directe oorzaak van
 *    hyponatriëmie (bloednatrium < 135 mmol/L), en dat is gevaarlijker dan de
 *    uitdroging die het moest voorkomen. Meer adviseren dan de bovengrens is
 *    dus niet "voor de zekerheid", het is de verkeerde kant op.
 *
 * 2. Natrium ontbrak volledig, terwijl de richtlijn het expliciet noemt bij
 *    inspanning langer dan twee uur — precies het geval waarvoor deze kaart
 *    bedoeld is.
 *
 * De bereiken blijven bereiken. De richtlijn zegt er zelf bij dat de sporter
 * een plan moet uitproberen dat past bij zijn eigen doelen en maagcomfort; wat
 * iemand verdraagt is individueel en de enige manier om jouw getal te vinden is
 * onderaan beginnen en opbouwen.
 */

/** Sportgel, gemiddeld. Merken lopen van 20 tot 30 gram per zakje. */
const GRAM_PER_GEL = 22

/**
 * Eerste inname na 30 minuten. Ruim vóórdat je iets merkt: wachten tot je
 * leegloopt is te laat, omdat het 15 à 20 minuten duurt voor suiker in je bloed
 * staat.
 */
const EERSTE_MOMENT_MIN = 30
/** De laatste kwartier hoeft niet meer; dat komt niet meer aan. */
const STOP_VOOR_EINDE_MIN = 15

export type Tankniveau = 'geen' | 'mondspoeling' | 'kort' | 'lang' | 'ultra'

export interface Bereik {
  min: number
  max: number
}

export interface VoorafPlan {
  /** Koolhydraten in gram, als het gewicht bekend is. */
  koolhydraten: Bereik | null
  /** Vocht in ml, 2 tot 4 uur van tevoren. */
  vocht: Bereik | null
  tekst: string
}

export interface AchterafPlan {
  /** Koolhydraten per uur in gram, eerste vier uur. */
  koolhydratenPerUur: Bereik | null
  eiwit: Bereik | null
  tekst: string
}

export interface Tankplan {
  niveau: Tankniveau
  duurMin: number
  tempC: number | null
  gewichtKg: number | null

  koolhydratenPerUur: Bereik | null
  koolhydratenTotaal: Bereik | null
  /** Aantal gels dat ongeveer met het midden van het bereik overeenkomt. */
  gelsOngeveer: number
  momenten: number[]

  vochtPerUur: Bereik
  vochtTotaal: Bereik
  /** Natrium in milligram per uur, of null als het niet nodig is. */
  natriumMgPerUur: number | null

  vooraf: VoorafPlan
  achteraf: AchterafPlan
  waarschuwingen: string[]
}

function bereik(min: number, max: number): Bereik {
  return { min, max }
}

function afronden(b: Bereik, stap: number): Bereik {
  return bereik(Math.round(b.min / stap) * stap, Math.round(b.max / stap) * stap)
}

/**
 * Position stand, tabel "Guidelines for carbohydrate intake during exercise":
 *   < 45 min          niet nodig
 *   45–75 min         kleine hoeveelheden, inclusief mondspoeling
 *   1–2,5 uur         30–60 g/uur
 *   > 2,5–3 uur       tot 90 g/uur
 *
 * Voor de bovenste categorie noemt de richtlijn erbij dat producten met
 * meerdere transporteerbare koolhydraten (glucose-fructosemengsels) nodig zijn
 * om die opnamesnelheid te halen: één transporteiwit zit rond de 60 g/uur vast.
 */
function koolhydratenBereik(duurMin: number): { niveau: Tankniveau; perUur: Bereik | null } {
  if (duurMin < 45) return { niveau: 'geen', perUur: null }
  if (duurMin <= 75) return { niveau: 'mondspoeling', perUur: null }
  if (duurMin <= 150) return { niveau: 'lang', perUur: bereik(30, 60) }
  return { niveau: 'ultra', perUur: bereik(60, 90) }
}

/**
 * Position stand, "During exercise": het vochtplan dat bij de meeste sporters en
 * evenementen past levert 0,4 tot 0,8 L/uur op, met als doel dat het totale
 * vochttekort onder 2% van je lichaamsgewicht blijft. Zweetsnelheden lopen
 * uiteen van 0,3 tot 2,4 L/uur, dus dit bereik is een startpunt en geen recept.
 *
 * Warmte schuift je binnen dat bereik omhoog, maar nooit erbuiten. De richtlijn
 * waarschuwt in dezelfde alinea voor recreatieve sporters die harder drinken dan
 * ze zweten; dat veroorzaakt hyponatriëmie, en dat is gevaarlijker dan het
 * tekort dat het moest oplossen.
 */
function vochtBereik(tempC: number | null): Bereik {
  if (tempC === null) return bereik(400, 700)
  if (tempC <= 10) return bereik(400, 600)
  if (tempC <= 18) return bereik(450, 650)
  if (tempC <= 24) return bereik(500, 750)
  return bereik(600, 800)
}

/**
 * Position stand: natrium innemen tijdens inspanning wanneer het zweetverlies
 * groot is — bij zweetsnelheden boven 1,2 L/uur, bij "salty sweat", of bij
 * inspanning langer dan twee uur. De gemiddelde natriumconcentratie in zweet
 * ligt rond 50 mmol/L, oftewel ongeveer 1 gram per liter.
 */
const NATRIUM_MG_PER_LITER = 1000
const NATRIUM_VANAF_MIN = 120

function momentenVoor(duurMin: number, aantal: number): number[] {
  if (aantal <= 0) return []
  const laatste = duurMin - STOP_VOOR_EINDE_MIN
  if (laatste <= EERSTE_MOMENT_MIN) return [EERSTE_MOMENT_MIN]
  if (aantal === 1) return [EERSTE_MOMENT_MIN]
  const stap = (laatste - EERSTE_MOMENT_MIN) / (aantal - 1)
  return Array.from({ length: aantal }, (_, i) =>
    Math.round((EERSTE_MOMENT_MIN + i * stap) / 5) * 5
  )
}

/**
 * Position stand, "Pre-event fuelling": 1–4 g/kg koolhydraten, 1 tot 4 uur voor
 * de inspanning, en elders in dezelfde tekst "ten minste 1 g/kg in de maaltijd
 * vooraf". Twee dingen bepalen waar je in dat bereik zit, en ze werken allebei
 * als een plafond:
 *
 * 1. Hoeveel tijd je nog hebt om te verteren. Ruwweg 1 g/kg per uur; een uur
 *    voor vertrek krijg je 4 g/kg niet weg zonder er last van te hebben.
 * 2. Hoe lang je gaat lopen. Dit stond er eerst niet in, en dat maakte de
 *    portie onzin: wie drie uur voor een rustige tien kilometer ontbeet kreeg
 *    het advies om 235 gram koolhydraten te eten — bijna duizend calorieën voor
 *    een inspanning die er nog geen vierhonderd kost. De bovenkant van 1–4 g/kg
 *    hoort bij een wedstrijd of een echt lange duurloop, niet bij elke sessie.
 *
 * Vocht vooraf: 5–10 ml/kg in de 2 tot 4 uur ervoor, met lichtgele urine als
 * controle en genoeg tijd om het teveel weer kwijt te raken.
 */
function voorafPerKg(duurMin: number, urenVoor: number): number {
  const naarDuur = duurMin < 90 ? 1 : duurMin <= 150 ? 2 : 4
  const naarTijd = Math.min(4, Math.max(1, urenVoor))
  return Math.min(naarDuur, naarTijd)
}

function maakVooraf(gewichtKg: number | null, perKg: number, urenVoor: number): VoorafPlan {
  const basis =
    'Kies koolhydraten en laat vet, eiwit en vezels grotendeels weg: die vertragen de maaglediging en zijn de bekendste oorzaak van darmklachten onderweg. ' +
    'Drink zoveel dat je urine lichtgeel is, ruim genoeg van tevoren om het teveel kwijt te raken.'

  if (!gewichtKg) {
    return {
      koolhydraten: null,
      vocht: null,
      tekst:
        'Vul je gewicht in bij Instellingen, dan rekent de app dit voor je uit. ' +
        'De richtlijn werkt met 1 tot 4 gram koolhydraten per kilo lichaamsgewicht, 1 tot 4 uur van tevoren, en 5 tot 10 ml vocht per kilo in de 2 tot 4 uur ervoor. ' +
        basis,
    }
  }

  const kh = afronden(bereik(gewichtKg * perKg * 0.8, gewichtKg * perKg), 5)
  const vocht = afronden(bereik(gewichtKg * 5, gewichtKg * 10), 50)

  return {
    koolhydraten: kh,
    vocht,
    tekst:
      `Ongeveer ${kh.min}–${kh.max} g koolhydraten, zo'n ${urenVoor} uur van tevoren. ` +
      `Drink daarnaast ${vocht.min}–${vocht.max} ml in de 2 tot 4 uur ervoor. ` +
      basis,
  }
}

/**
 * Position stand: bij minder dan 8 uur tussen twee zware sessies levert 1–1,2
 * g/kg/uur koolhydraten in de eerste 4 uur het snelste herstel van glycogeen op.
 * Voor eiwit noemt de tekst 0,25–0,3 g/kg lichaamsgewicht per portie.
 */
function maakAchteraf(gewichtKg: number | null): AchterafPlan {
  if (!gewichtKg) {
    return {
      koolhydratenPerUur: null,
      eiwit: null,
      tekst:
        'De richtlijn houdt 1 tot 1,2 gram koolhydraten per kilo per uur aan in de eerste vier uur, plus 0,25 tot 0,3 gram eiwit per kilo. ' +
        'Vul je gewicht in bij Instellingen voor concrete getallen.',
    }
  }

  const kh = afronden(bereik(gewichtKg * 1.0, gewichtKg * 1.2), 5)
  const eiwit = afronden(bereik(gewichtKg * 0.25, gewichtKg * 0.3), 5)

  return {
    koolhydratenPerUur: kh,
    eiwit,
    tekst:
      `${kh.min}–${kh.max} g koolhydraten per uur in de eerste vier uur, plus ${eiwit.min}–${eiwit.max} g eiwit. ` +
      'Dat tempo geldt vooral als er binnen acht uur nog een zware sessie volgt; heb je een dag rust, dan is een normale maaltijd genoeg.',
  }
}

export function tijdTekst(minuten: number): string {
  const u = Math.floor(minuten / 60)
  const m = minuten % 60
  return u > 0 ? `${u}:${String(m).padStart(2, '0')}` : `${m} min`
}

export function bereikTekst(b: Bereik, eenheid: string): string {
  return `${b.min}–${b.max} ${eenheid}`
}

export interface TankInvoer {
  duurMin: number | null
  tempC: number | null
  gewichtKg: number | null
  /** Hoeveel uur voor de start je nog kunt eten. Bepaalt de portie vooraf. */
  urenVoor?: number
}

export function maakTankplan({
  duurMin, tempC, gewichtKg, urenVoor = 3,
}: TankInvoer): Tankplan | null {
  if (!duurMin || duurMin < 45) return null

  const { niveau: khNiveau, perUur } = koolhydratenBereik(duurMin)
  const uren = duurMin / 60
  const vochtPerUur = vochtBereik(tempC)
  const vochtTotaal = afronden(bereik(vochtPerUur.min * uren, vochtPerUur.max * uren), 50)

  const koolhydratenTotaal = perUur
    ? afronden(bereik(perUur.min * uren, perUur.max * uren), 5)
    : null

  const midden = koolhydratenTotaal ? (koolhydratenTotaal.min + koolhydratenTotaal.max) / 2 : 0
  const gelsOngeveer = Math.round(midden / GRAM_PER_GEL)
  const momenten = momentenVoor(duurMin, gelsOngeveer)

  const natriumMgPerUur =
    duurMin >= NATRIUM_VANAF_MIN || (tempC !== null && tempC >= 20)
      ? Math.round(((vochtPerUur.min + vochtPerUur.max) / 2 / 1000) * NATRIUM_MG_PER_LITER / 50) * 50
      : null

  const waarschuwingen: string[] = []

  // De belangrijkste boodschap van de hele kaart, en de enige met een risico
  // eraan vast. Daarom altijd zichtbaar bij een sessie waar gedronken wordt.
  waarschuwingen.push(
    'Drink niet méér dan je zweet. Het doel is een vochttekort onder 2% van je lichaamsgewicht, niet nul: te veel drinken verdunt je bloednatrium en dat is gevaarlijker dan licht uitdrogen. Weeg jezelf een keer voor en na een lange loop — een kilo minder is ongeveer een liter zweet, en dan weet je jouw eigen tempo.'
  )

  if (khNiveau === 'ultra') {
    waarschuwingen.push(
      'Boven de 60 gram per uur heb je een glucose-fructosemengsel nodig. Eén transportmechanisme in je darm zit rond die 60 gram vast, dus met alleen glucosegels neem je meer in dan je opneemt — en de rest blijft in je maag zitten.'
    )
  }

  if (tempC !== null && tempC >= 25) {
    waarschuwingen.push(
      `Bij ${tempC}° stijgt je zweetverlies sneller dan je kunt drinken. Vertrek vroeg, lever tempo in, en reken erop dat je met een tekort binnenkomt — dat vul je ná afloop aan.`
    )
  }

  return {
    niveau: duurMin <= 75 ? khNiveau : (duurMin <= 150 ? 'lang' : 'ultra'),
    duurMin,
    tempC,
    gewichtKg,
    koolhydratenPerUur: perUur,
    koolhydratenTotaal,
    gelsOngeveer,
    momenten,
    vochtPerUur,
    vochtTotaal,
    natriumMgPerUur,
    vooraf: maakVooraf(gewichtKg, voorafPerKg(duurMin, urenVoor), urenVoor),
    achteraf: maakAchteraf(gewichtKg),
    waarschuwingen,
  }
}

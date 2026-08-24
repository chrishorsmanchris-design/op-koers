/**
 * Wat je tijdsdoel betekent, en of je er op koers voor ligt.
 *
 * Tot nu toe was `tijdsdoel` een string die op het scherm stond en in een paar
 * prompts geplakt werd. Nergens werd uitgerekend welk tempo erbij hoort, en
 * nergens werd getoetst of het kan. Dat is precies de vraag waar je het hele
 * schema voor draait, en juist die vraag bleef onbeantwoord.
 *
 * Hier gebeuren twee dingen. Eerst: wat vraagt je doel van je, in seconden per
 * kilometer. Daarna: waar kom je volgens je eigen runs op uit.
 *
 * De voorspelling gebruikt Riegel — de standaardformule om een prestatie over
 * de ene afstand naar de andere te vertalen. Belangrijk om te weten: Riegel gaat
 * ervan uit dat je de afstand ook daadwerkelijk aankunt. De formule kent geen
 * "de muur". Vertaal je een scherpe 10 km naar 42 km, dan krijg je de tijd die
 * je zou lopen als je die 42 km met dezelfde relatieve inspanning uit zou
 * kunnen houden — en dat is nu juist wat marathons zo lastig maakt. Daarom
 * staat er naast de voorspelling altijd een uithoudingstoets: je langste
 * duurloop en je weekvolume. Een voorspelling van 3:10 op basis van een snelle
 * 10 km betekent niets als je langste loop 15 km is.
 */

/** Riegel-exponent. 1,06 is de klassieke waarde uit het oorspronkelijke artikel. */
const RIEGEL_EXPONENT = 1.06
/**
 * Vanaf welke afstand een run bruikbaar is om naar 42 km te vertalen.
 *
 * Riegel is een machtsfunctie zonder bovengrens: hoe verder je extrapoleert, hoe
 * meer de formule je vleit. Een 5 km doorrekenen naar 42 km is ruim acht keer de
 * afstand, en alles wat de laatste twee uur van een marathon zwaar maakt —
 * leeggelopen glycogeen, spierschade, warmte — zit niet in die som. Vanaf 10 km
 * is de sprong nog te overzien.
 */
const MIN_AFSTAND_KM = 10
/**
 * Wie nog geen 10 km gelopen heeft krijgt liever een voorspelling met een
 * kanttekening dan helemaal niets — maar dan wel met die kanttekening erbij.
 */
const NOOD_AFSTAND_KM = 5
/** Hoe ver terug we kijken voor je beste prestatie. */
const VOORSPELLING_WEKEN = 12
/** En over hoeveel weken we je volume middelen. */
const VOLUME_WEKEN = 4
export const MARATHON_KM = 42.195

/**
 * Hoeveel je in een goed trainingsblok nog kunt verbeteren: ongeveer 1% van je
 * marathontijd per vier weken, met een plafond van 8%.
 *
 * Bewust conservatief. Een recreatieve marathonloper wint geen kwartier in acht
 * weken, en een app die dat suggereert stuurt je een blessure in. Het plafond
 * zit er omdat de formule anders bij een doel dat nog een jaar weg ligt elke
 * ambitie goedkeurt.
 */
const VERBETERING_PER_WEEK = 0.0025
const MAX_VERBETERING = 0.08
/** Binnen deze marge van het haalbare noemen we een doel ambitieus, niet onmogelijk. */
const AMBITIEUS_MARGE = 0.03

/**
 * Wat je langste duurloop minimaal moet worden om 42 km uit te kunnen lopen.
 * Onder de 30 km mis je de ervaring van de laatste uren; onder de 25 km is het
 * geen kwestie van tempo meer maar van uitlopen.
 */
const LANGSTE_RUN_GOED = 30
const LANGSTE_RUN_KRAP = 25
/** Weekvolume waaronder een scherpe marathontijd niet gedragen wordt. */
const WEEKVOLUME_KRAP = 45

export type Haalbaarheid = 'op_koers' | 'ambitieus' | 'onrealistisch' | 'te_weinig_data'

/** Een gelopen training, met de werkelijke cijfers erin. */
export interface GelopenRun {
  datum: string
  afstand_km: number | null
  duur_minuten: number | null
}

export interface DoelAnalyse {
  /** Tempo dat je doel vraagt, in seconden per km. Null zonder tijdsdoel. */
  doelPace: number | null
  doelSeconden: number | null
  /** Voorspelde marathontijd in seconden, uit je beste recente run. */
  voorspeldSeconden: number | null
  /** Het tempo dat daarbij hoort, seconden per km. */
  voorspeldePace: number | null
  /** De run waar de voorspelling op rust — zodat je hem kunt narekenen. */
  basis: { datum: string; afstand_km: number; duur_minuten: number } | null
  /** Doel min voorspelling, in seconden. Positief = je doel is sneller dan je nu bent. */
  gat: number | null
  haalbaarheid: Haalbaarheid
  langsteRunKm: number
  weekKmGemiddeld: number
  wekenTotDoel: number
  /** Wat er aan je uithoudingsvermogen nog ontbreekt; leeg als het klopt. */
  waarschuwingen: string[]
  /** Eén zin die het samenvat, klaar om te tonen. */
  samenvatting: string
}

// ─── Omrekenen ───────────────────────────────────────────────────────────────

/** Parseert "3:15:00" of "3:15" naar seconden. Null als het geen tijd is. */
export function tijdNaarSeconden(tijd: string | null | undefined): number | null {
  if (!tijd) return null
  const delen = tijd.trim().split(':').map(Number)
  if (delen.some(isNaN)) return null
  if (delen.length === 3) return delen[0] * 3600 + delen[1] * 60 + delen[2]
  // Twee delen bij een marathon zijn uren en minuten, niet minuten en seconden:
  // "3:15" is 3 uur 15, geen 3 minuten 15.
  if (delen.length === 2) return delen[0] * 3600 + delen[1] * 60
  return null
}

/**
 * Formatteert seconden naar "3:15:32".
 *
 * Eerst afronden, dán opdelen. Andersom levert 359,6 seconden "5:60" op, omdat
 * de minuten naar beneden en de seconden naar boven gaan.
 */
export function secondenNaarTijd(seconden: number): string {
  const heel = Math.round(seconden)
  const u = Math.floor(heel / 3600)
  const m = Math.floor((heel % 3600) / 60)
  return `${u}:${String(m).padStart(2, '0')}:${String(heel % 60).padStart(2, '0')}`
}

/** Formatteert seconden per km naar "4:37". */
export function paceNaarTekst(secondenPerKm: number): string {
  const heel = Math.round(secondenPerKm)
  return `${Math.floor(heel / 60)}:${String(heel % 60).padStart(2, '0')}`
}

/**
 * Riegel: T₂ = T₁ × (D₂/D₁)^1,06. Vertaalt een prestatie naar een andere afstand.
 */
export function riegel(
  afstandKm: number, duurSeconden: number, naarKm: number = MARATHON_KM,
): number {
  return duurSeconden * (naarKm / afstandKm) ** RIEGEL_EXPONENT
}

// ─── Analyse ─────────────────────────────────────────────────────────────────

function dagenTussen(van: string, tot: string): number {
  return Math.round(
    (new Date(tot + 'T12:00:00').getTime() - new Date(van + 'T12:00:00').getTime()) / 86400000)
}

/**
 * Legt je tijdsdoel naast wat je runs laten zien.
 *
 * @param runs      Voltooide hardloopsessies met werkelijke afstand en duur.
 * @param tijdsdoel Zoals ingevuld bij je doel, bijvoorbeeld "3:15:00".
 * @param doelDatum Datum van de wedstrijd.
 * @param vandaag   yyyy-mm-dd.
 */
export function analyseerDoel(
  runs: GelopenRun[], tijdsdoel: string | null, doelDatum: string, vandaag: string,
): DoelAnalyse {
  const doelSeconden = tijdNaarSeconden(tijdsdoel)
  const doelPace = doelSeconden ? doelSeconden / MARATHON_KM : null
  const wekenTotDoel = Math.max(0, Math.round(dagenTussen(vandaag, doelDatum) / 7))

  const inPeriode = (r: GelopenRun) =>
    (r.duur_minuten ?? 0) > 0 &&
    dagenTussen(r.datum, vandaag) <= VOORSPELLING_WEKEN * 7 &&
    dagenTussen(r.datum, vandaag) >= 0

  // Liefst runs van 10 km of langer. Zijn die er niet, dan vallen we terug op
  // 5 km, maar dan weet de lezer dat de voorspelling op los zand staat.
  let bruikbaar = runs.filter(r => inPeriode(r) && (r.afstand_km ?? 0) >= MIN_AFSTAND_KM)
  const korteBasis = bruikbaar.length === 0
  if (korteBasis) {
    bruikbaar = runs.filter(r => inPeriode(r) && (r.afstand_km ?? 0) >= NOOD_AFSTAND_KM)
  }

  // Je beste equivalente prestatie, niet je gemiddelde. Rustige duurlopen zijn
  // bewust langzaam; die zeggen niets over wat je kúnt. Door per run de
  // equivalente marathontijd uit te rekenen en de snelste te nemen, wint vanzelf
  // de run waarin je het diepst gegaan bent.
  let basis: DoelAnalyse['basis'] = null
  let voorspeldSeconden: number | null = null
  for (const r of bruikbaar) {
    const equivalent = riegel(r.afstand_km!, r.duur_minuten! * 60)
    if (voorspeldSeconden === null || equivalent < voorspeldSeconden) {
      voorspeldSeconden = equivalent
      basis = { datum: r.datum, afstand_km: r.afstand_km!, duur_minuten: r.duur_minuten! }
    }
  }

  // De langste loop gaat over álle runs in het venster, niet alleen over de
  // runs die lang genoeg zijn om mee te voorspellen: anders zou iemand die
  // uitsluitend rondjes van 4 km loopt "langste duurloop: 0 km" te zien krijgen.
  const inVenster = runs.filter(r => {
    const d = dagenTussen(r.datum, vandaag)
    return d >= 0 && d <= VOORSPELLING_WEKEN * 7
  })
  const langsteRunKm = Math.max(0, ...inVenster.map(r => r.afstand_km ?? 0))
  const recent = runs.filter(r => {
    const d = dagenTussen(r.datum, vandaag)
    return d >= 0 && d <= VOLUME_WEKEN * 7
  })
  const weekKmGemiddeld = Math.round(
    recent.reduce((som, r) => som + (r.afstand_km ?? 0), 0) / VOLUME_WEKEN * 10) / 10

  const waarschuwingen: string[] = []
  if (korteBasis && basis) {
    waarschuwingen.push(`De voorspelling rust op een run van ${basis.afstand_km} km. Dat is ruim acht keer doorgerekend naar de marathon, en zulke sommen vallen altijd te gunstig uit. Loop een keer 10 km of langer stevig door voor een eerlijker beeld.`)
  }
  if (langsteRunKm > 0 && langsteRunKm < LANGSTE_RUN_KRAP) {
    waarschuwingen.push(`Je langste duurloop is ${Math.round(langsteRunKm)} km. Voor een marathon wil je richting ${LANGSTE_RUN_GOED} km — snelheid over 10 km voorspelt weinig over de laatste tien kilometer van een marathon.`)
  } else if (langsteRunKm >= LANGSTE_RUN_KRAP && langsteRunKm < LANGSTE_RUN_GOED) {
    waarschuwingen.push(`Je langste duurloop is ${Math.round(langsteRunKm)} km. Dat is genoeg om uit te lopen, maar voor een scherpe tijd wil je er nog richting ${LANGSTE_RUN_GOED} km.`)
  }
  if (weekKmGemiddeld > 0 && weekKmGemiddeld < WEEKVOLUME_KRAP) {
    waarschuwingen.push(`Je loopt gemiddeld ${weekKmGemiddeld} km per week. Een marathontijd wordt gedragen door volume; onder de ${WEEKVOLUME_KRAP} km wordt een scherp doel zwaar.`)
  }

  if (!voorspeldSeconden || !doelSeconden) {
    return {
      doelPace, doelSeconden, voorspeldSeconden, voorspeldePace: null, basis,
      gat: null, haalbaarheid: 'te_weinig_data',
      langsteRunKm, weekKmGemiddeld, wekenTotDoel, waarschuwingen,
      samenvatting: !doelSeconden
        ? 'Je hebt nog geen tijdsdoel ingevuld, dus er valt niets naast te leggen.'
        : `Nog te weinig runs van ${NOOD_AFSTAND_KM} km of langer om een tijd te voorspellen.`,
    }
  }

  // Wat je met de resterende weken nog redelijkerwijs kunt worden.
  const winst = Math.min(MAX_VERBETERING, VERBETERING_PER_WEEK * wekenTotDoel)
  const haalbaarSeconden = voorspeldSeconden * (1 - winst)
  const gat = voorspeldSeconden - doelSeconden

  let haalbaarheid: Haalbaarheid
  if (doelSeconden >= haalbaarSeconden) haalbaarheid = 'op_koers'
  else if (doelSeconden >= haalbaarSeconden * (1 - AMBITIEUS_MARGE)) haalbaarheid = 'ambitieus'
  else haalbaarheid = 'onrealistisch'

  // Uithoudingsvermogen kan een doel niet redden, maar wel relativeren: ligt je
  // snelheid op koers terwijl je nooit verder komt dan 18 km of nauwelijks
  // kilometers maakt, dan is "op koers" een halve waarheid. Snelheid over een
  // korte afstand is de makkelijkste helft van een marathon.
  const uithoudingKrap =
    (langsteRunKm > 0 && langsteRunKm < LANGSTE_RUN_KRAP) ||
    (weekKmGemiddeld > 0 && weekKmGemiddeld < WEEKVOLUME_KRAP) ||
    korteBasis
  if (haalbaarheid === 'op_koers' && uithoudingKrap) haalbaarheid = 'ambitieus'

  const doelTekst = secondenNaarTijd(doelSeconden)
  const voorspeldTekst = secondenNaarTijd(voorspeldSeconden)
  const verschilMin = Math.round(Math.abs(gat) / 60)
  // `gat` is voorspelling min doel: positief betekent dat je doel de scherpere
  // tijd is. Dat onderscheid moet in de zin terug te vinden zijn, anders staat
  // er "sneller dan je doel" bij een tijd die er 33 seconden boven ligt.
  const doelIsScherper = gat > 0
  const verschilTekst = verschilMin < 1
    ? 'vrijwel gelijk aan'
    : `${verschilMin} min ${doelIsScherper ? 'langzamer' : 'sneller'} dan`

  const samenvatting =
    haalbaarheid === 'op_koers'
      ? `Je runs wijzen op ${voorspeldTekst}, ${verschilTekst} je doel van ${doelTekst}. Met ${wekenTotDoel} weken training erbij ligt het binnen bereik.`
    : haalbaarheid === 'ambitieus'
      ? doelIsScherper
        ? `Je runs wijzen nu op ${voorspeldTekst}. Je doel van ${doelTekst} ligt ${verschilMin} min sneller: haalbaar met ${wekenTotDoel} weken training, maar het moet wel gebeuren.`
        : `Je snelheid is er (${voorspeldTekst}), maar die rust op korte afstanden. Voor ${doelTekst} over 42 km moet de basis eronder nog groeien — zie hieronder.`
      : `Je runs wijzen nu op ${voorspeldTekst}, en je doel van ${doelTekst} ligt ${verschilMin} min sneller. Dat is in ${wekenTotDoel} weken meer dan realistisch te winnen is.`

  return {
    doelPace, doelSeconden, voorspeldSeconden,
    voorspeldePace: voorspeldSeconden / MARATHON_KM,
    basis, gat, haalbaarheid,
    langsteRunKm, weekKmGemiddeld, wekenTotDoel, waarschuwingen, samenvatting,
  }
}

/**
 * Compacte regel voor in een prompt. De coach kreeg tot nu toe alleen de string
 * "3:15:00" mee en had daarmee geen idee of dat kansrijk was — laat staan welk
 * tempo erbij hoort.
 */
export function doelVoorPrompt(a: DoelAnalyse): string {
  if (!a.doelSeconden) return 'Tijdsdoel: geen (finishen)'
  const regels = [
    `Tijdsdoel: ${secondenNaarTijd(a.doelSeconden)} = ${paceNaarTekst(a.doelPace!)}/km wedstrijdtempo`,
  ]
  if (a.voorspeldSeconden) {
    regels.push(
      `Voorspelling uit werkelijke runs (Riegel): ${secondenNaarTijd(a.voorspeldSeconden)} = ${paceNaarTekst(a.voorspeldePace!)}/km`,
      `Beoordeling: ${a.haalbaarheid} — ${a.samenvatting}`,
      `Beste recente run: ${a.basis!.afstand_km} km in ${a.basis!.duur_minuten} min (${a.basis!.datum})`,
    )
  } else {
    regels.push('Voorspelling: nog te weinig runs van 5 km of langer.')
  }
  regels.push(`Langste duurloop: ${Math.round(a.langsteRunKm)} km | weekvolume: ${a.weekKmGemiddeld} km | weken tot doel: ${a.wekenTotDoel}`)
  if (a.waarschuwingen.length) regels.push(`Let op: ${a.waarschuwingen.join(' ')}`)
  return regels.join('\n')
}

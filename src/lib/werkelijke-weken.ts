/**
 * Vertaalt wat je werkelijk gedaan hebt naar de weekmaat waarin de opbouwrem
 * rekent.
 *
 * De rem in `opbouw.ts` kijkt naar de weken vóór een week om te bepalen of de
 * sprong te groot is. Zonder deze vertaling zou hij daarvoor het plán gebruiken,
 * en dan klopt de conclusie precies dán niet wanneer het ertoe doet: als je in
 * de vakantie waarin niets gepland stond tóch drie keer per week gelopen hebt,
 * hoef je bij thuiskomst niet opnieuw op te bouwen. Andersom net zo — twee weken
 * grieperig op de bank telt niet als de trainingsweken die er stonden.
 *
 * Alleen wéken die helemaal voorbij zijn krijgen een werkelijke waarde. De week
 * die nu loopt is half gebeurd en half gepland; die half meten zou hem stelselmatig
 * te laag inschatten, en dan remt het schema af op een week die nog moet komen.
 */

import { sessiePunten } from './belasting'
import { gevoelUitRatings, type WerkelijkeWeek } from './opbouw'

/** Een voltooide sessie zoals hij uit de database komt, met feedback erbij. */
export interface VoltooideSessie {
  datum: string
  type: string
  duur_minuten: number | null
  afstand_km: number | null
  intensiteit: string | null
  /** Wat Strava gemeten heeft. Gaat vóór de geplande waarden als het er is. */
  werkelijke_duur?: number | null
  werkelijke_afstand?: number | null
  /** Jouw oordeel over de sessie: te_zwaar t/m topdag. */
  rating?: string | null
}

function datumPlus(datum: string, dagen: number): string {
  const d = new Date(datum + 'T12:00:00')
  d.setDate(d.getDate() + dagen)
  return d.toISOString().split('T')[0]
}

/**
 * Rekent per week uit wat je werkelijk gedaan hebt.
 *
 * @param sessies      Voltooide sessies, in willekeurige volgorde.
 * @param weekMaandagen De maandag van elke week uit het plan, op planvolgorde.
 * @param vandaag       yyyy-mm-dd; weken die hierna eindigen blijven `null`.
 */
export function bepaalWerkelijkeWeken(
  sessies: VoltooideSessie[],
  weekMaandagen: string[],
  vandaag: string,
): (WerkelijkeWeek | null)[] {
  return weekMaandagen.map(maandag => {
    const eind = datumPlus(maandag, 6)
    // De lopende week is nog niet af; die laten we aan het plan.
    if (eind >= vandaag) return null

    const vanDeWeek = sessies.filter(s => s.datum >= maandag && s.datum <= eind)
    // Een week zonder sessies is een echte nul — dat is precies de informatie
    // die de rem nodig heeft — maar alleen als we die week ook echt konden zien.
    // Daarom is de aanroeper verantwoordelijk voor een volledige periode.

    const punten = vanDeWeek.reduce((som, s) => som + sessiePunten({
      datum: s.datum,
      type: s.type,
      duur_minuten: s.werkelijke_duur ?? s.duur_minuten,
      afstand_km: s.werkelijke_afstand ?? s.afstand_km,
      intensiteit: s.intensiteit,
      voltooid: true,
    }), 0)

    const langsteKm = Math.max(0, ...vanDeWeek.map(
      s => s.werkelijke_afstand ?? s.afstand_km ?? 0))

    const gevoel = gevoelUitRatings(
      vanDeWeek.map(s => s.rating).filter((r): r is string => !!r))

    return { punten: Math.round(punten), langsteKm, gevoel }
  })
}

/** De maandagen van de laatste `aantal` volledige weken, oudste eerst. */
export function laatsteWeekMaandagen(vandaag: string, aantal: number): string[] {
  const d = new Date(vandaag + 'T12:00:00')
  const dow = d.getDay()
  const dezeMaandag = datumPlus(vandaag, dow === 0 ? -6 : 1 - dow)
  return Array.from({ length: aantal }, (_, i) =>
    datumPlus(dezeMaandag, -(aantal - i) * 7))
}

/** Hoeveel weken terug we kijken of er een dip in zit. */
const ONDERBREKING_VENSTER = 3
/** Onder dit deel van je normale niveau noemen we een week een onderbreking. */
const ONDERBREKING_DREMPEL = 0.5

/**
 * Zit er in je laatste weken een gat — vakantie, ziekte, een drukke periode?
 *
 * Dit bepaalt niet óf je plan aangepast wordt, maar hoe hard je eigen feedback
 * daarin meetelt. Loop je je schema gewoon af, dan is dat schema het beste
 * bewijs over wat je aankunt en is één zware training een incident. Kom je terug
 * van twee weken niets, dan is er geen betrouwbare aanname meer over je vorm en
 * is wat jij rapporteert het scherpste signaal dat er is.
 *
 * @param punten Weekbelasting op volgorde, de laatste is de meest recente.
 */
export function recenteOnderbreking(punten: number[]): boolean {
  const recent = punten.slice(-ONDERBREKING_VENSTER)
  const daarvoor = punten.slice(-ONDERBREKING_VENSTER - 4, -ONDERBREKING_VENSTER)
  const niveau = Math.max(0, ...daarvoor)
  // Zonder een periode ervóór om mee te vergelijken valt er niets vast te
  // stellen: een beginnende hardloper heeft geen dip, die heeft nog geen niveau.
  if (niveau <= 0) return false
  return recent.some(p => p < niveau * ONDERBREKING_DREMPEL)
}

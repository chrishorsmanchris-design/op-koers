/**
 * Het uurweer ophalen, serverkant.
 *
 * De loopmoment-kaart doet dit al in de browser, maar het ochtendbericht wordt
 * door een cron geschreven — daar is geen browser. Dezelfde bron, dezelfde
 * velden, zodat de kaart en het bericht niet los van elkaar gaan drijven.
 */

import type { UurWeer } from './looptijd'

/** Zelfde vaste punt als het tankplan: geen locatiepopup voor één temperatuur. */
const LAT = 52.3676
const LON = 4.9041

/**
 * De gevoelstemperatuur en regenkans per uur voor één dag.
 *
 * Geeft een lege lijst terug als het weerbericht niet bereikbaar is. Een
 * ochtendbericht zonder looptip is jammer; een ochtendbericht dat helemaal niet
 * verschijnt omdat een weer-API hikt, is erger.
 */
export async function haalUurWeer(datum: string): Promise<UurWeer[]> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
      `&hourly=apparent_temperature,precipitation_probability&timezone=Europe/Amsterdam&forecast_days=3`,
      { next: { revalidate: 1800 } },
    )
    if (!res.ok) return []
    const data = await res.json() as {
      hourly?: { time?: string[]; apparent_temperature?: number[]; precipitation_probability?: number[] }
    }
    const tijden = data.hourly?.time
    const gevoelens = data.hourly?.apparent_temperature
    if (!tijden || !gevoelens) return []

    const uren: UurWeer[] = []
    tijden.forEach((t, i) => {
      if (!t.startsWith(datum)) return
      const gevoel = gevoelens[i]
      if (typeof gevoel !== 'number') return
      uren.push({
        uur: Number(t.slice(11, 13)),
        gevoel,
        regenKans: data.hourly?.precipitation_probability?.[i] ?? 0,
      })
    })
    return uren
  } catch {
    return []
  }
}

import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  TempoZone,
  paceNaarSeconden,
  secondenNaarPace,
  mergeTempoZones,
  zonesInTekst,
} from '@/lib/tempo-zones'

// Minimaal aantal gematchte sessies in de kalibratie-window voordat we een zone bijstellen
export const MIN_SAMPLES = 3
// Alleen bijstellen als het gemiddelde werkelijke tempo minimaal dit percentage afwijkt
export const AFWIJKING_DREMPEL = 0.04
// Hoe ver we richting het waargenomen tempo bewegen per kalibratie-run (voorkomt schokkerige aanpassingen)
export const BLEND_FACTOR = 0.5
// Kalibratie-window: kijk naar de laatste N dagen aan voltooide activiteiten
export const WINDOW_DAGEN = 42

export type KalibratieResultaat = {
  bijgewerkt: number
  totaal: number
  details: Record<string, unknown>[]
  fout?: string
}

/**
 * Stelt de tempozones van elke gebruiker bij op basis van werkelijk gelopen tempo.
 *
 * Draait op een service-role client: er is geen ingelogde gebruiker bij een cron,
 * dus RLS zou een gewone client volledig blokkeren.
 */
export async function kalibreerTempoZones(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<KalibratieResultaat> {
  const vanaf = new Date(Date.now() - WINDOW_DAGEN * 86400000).toISOString().split('T')[0]

  const { data: profielen, error: profielenFout } = await supabase
    .from('profiles')
    .select('id, naam, tempo_zones, push_subscription')

  if (profielenFout) {
    return { bijgewerkt: 0, totaal: 0, details: [], fout: `Profielen ophalen mislukt: ${profielenFout.message}` }
  }
  if (!profielen?.length) return { bijgewerkt: 0, totaal: 0, details: [] }

  let bijgewerkt = 0
  const details: Record<string, unknown>[] = []

  for (const profiel of profielen as Record<string, unknown>[]) {
    try {
      const userId = profiel.id as string
      const huidigeZones = mergeTempoZones(profiel.tempo_zones as TempoZone[] | null)

      // Voltooide hardloopsessies met werkelijke resultaten in de kalibratie-window
      const { data: sessies } = await supabase
        .from('training_sessions')
        .select('id, beschrijving, datum, session_feedback(werkelijke_afstand, werkelijke_duur)')
        .eq('user_id', userId)
        .eq('type', 'hardlopen')
        .eq('voltooid', true)
        .gte('datum', vanaf)

      if (!sessies?.length) continue

      // Verzamel per zone-label de werkelijke tempo's (sec/km) uit sessies die die zone bevatten
      const perZone: Record<string, number[]> = {}
      for (const s of sessies as Record<string, unknown>[]) {
        const feedback = (s.session_feedback as Record<string, unknown>[] | null)?.[0]
        const afstand = feedback?.werkelijke_afstand as number | null
        const duur = feedback?.werkelijke_duur as number | null
        if (!afstand || !duur) continue

        const zones = zonesInTekst(s.beschrijving as string, huidigeZones)
        // Alleen eenduidige (single-zone) sessies gebruiken zodat we het tempo niet aan de verkeerde zone toekennen
        if (zones.length !== 1) continue

        const werkelijkeSecPerKm = (duur * 60) / afstand
        const label = zones[0].label
        if (!perZone[label]) perZone[label] = []
        perZone[label].push(werkelijkeSecPerKm)
      }

      const nieuweZones: TempoZone[] = huidigeZones.map(zone => {
        const metingen = perZone[zone.label]
        if (!metingen || metingen.length < MIN_SAMPLES) return zone

        const gemiddeldeSec = metingen.reduce((a, b) => a + b, 0) / metingen.length
        const huidigeSec = paceNaarSeconden(zone.pace)
        const afwijking = Math.abs(gemiddeldeSec - huidigeSec) / huidigeSec
        if (afwijking < AFWIJKING_DREMPEL) return zone

        const nieuweSec = huidigeSec + (gemiddeldeSec - huidigeSec) * BLEND_FACTOR
        return { ...zone, pace: secondenNaarPace(nieuweSec) }
      })

      const isGewijzigd = nieuweZones.some((z, i) => z.pace !== huidigeZones[i].pace)
      if (!isGewijzigd) continue

      await supabase.from('profiles').update({
        tempo_zones: nieuweZones,
        tempo_zones_updated_at: new Date().toISOString(),
      } as never).eq('id', userId)

      bijgewerkt++
      const wijzigingen = nieuweZones
        .filter((z, i) => z.pace !== huidigeZones[i].pace)
        .map(z => {
          const oud = huidigeZones.find(o => o.label === z.label)
          return `${z.label}: ${oud?.pace} → ${z.pace}`
        })
      details.push({ userId, wijzigingen })

      const pushSub = profiel.push_subscription
      if (pushSub) {
        try {
          const naam = (profiel.naam as string)?.split(' ')[0] ?? 'Atleet'
          await webpush.sendNotification(
            pushSub as webpush.PushSubscription,
            JSON.stringify({
              title: '📊 Tempozones bijgewerkt',
              body: `${naam}, op basis van je recente runs zijn je tempozones aangescherpt: ${wijzigingen.join(', ')}.`,
              url: '/schema',
            })
          )
        } catch { /* stille fail push */ }
      }
    } catch { /* stille fail per gebruiker — ga door met de rest */ }
  }

  return { bijgewerkt, totaal: profielen.length, details }
}

import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { TEMPO_ZONES, TempoZone, paceNaarSeconden, secondenNaarPace, mergeTempoZones, zonesInTekst } from '@/lib/tempo-zones'

export const maxDuration = 60

// Minimaal aantal gematchte sessies in de kalibratie-window voordat we een zone bijstellen
const MIN_SAMPLES = 3
// Alleen bijstellen als het gemiddelde werkelijke tempo minimaal dit percentage afwijkt
const AFWIJKING_DREMPEL = 0.04
// Hoe ver we richting het waargenomen tempo bewegen per kalibratie-run (voorkomt schokkerige aanpassingen)
const BLEND_FACTOR = 0.5
// Kalibratie-window: kijk naar de laatste N dagen aan voltooide activiteiten
const WINDOW_DAGEN = 42

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const querySecret = req.nextUrl.searchParams.get('secret')
  const cronSecret = process.env.CRON_SECRET
  const geautoriseerd =
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret ||
    req.headers.get('x-cron-secret') === cronSecret
  if (!geautoriseerd) {
    return NextResponse.json({ error: 'Ongeautoriseerd' }, { status: 401 })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt in Vercel omgevingsvariabelen.',
      bijgewerkt: 0,
    }, { status: 500 })
  }

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )
  } catch { /* push optioneel — kalibratie werkt ook zonder */ }

  const vanaf = new Date(Date.now() - WINDOW_DAGEN * 86400000).toISOString().split('T')[0]

  const { data: profielen, error: profielenFout } = await supabase
    .from('profiles')
    .select('id, naam, tempo_zones, push_subscription')

  if (profielenFout) {
    return NextResponse.json({ error: `Profielen ophalen mislukt: ${profielenFout.message}`, bijgewerkt: 0 }, { status: 500 })
  }
  if (!profielen?.length) return NextResponse.json({ bijgewerkt: 0 })

  let bijgewerkt = 0
  const details: Record<string, unknown>[] = []

  for (const profiel of profielen) {
    try {
      const userId = (profiel as Record<string, unknown>).id as string
      const huidigeZones = mergeTempoZones((profiel as Record<string, unknown>).tempo_zones as TempoZone[] | null)

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

      const pushSub = (profiel as Record<string, unknown>).push_subscription
      if (pushSub) {
        try {
          const naam = ((profiel as Record<string, unknown>).naam as string)?.split(' ')[0] ?? 'Atleet'
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

  return NextResponse.json({ bijgewerkt, totaal: profielen.length, details, standaard: TEMPO_ZONES })
}

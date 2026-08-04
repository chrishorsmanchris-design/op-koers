import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { kalibreerTempoZones } from '@/lib/tempo-kalibratie'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )

  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Ongeautoriseerd' }, { status: 401 })
  }

  // Service-role client: een cron heeft geen sessiecookie, dus RLS zou een
  // gewone client volledig blokkeren — de select op profiles gaf dan stilletjes
  // niets terug en er ging nooit een samenvatting de deur uit.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt in Vercel omgevingsvariabelen.',
      verstuurd: 0,
    }, { status: 500 })
  }
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Tempozone-kalibratie draait mee in deze cron (Vercel Hobby staat er maar twee toe).
  // Eerst kalibreren, dan pas de samenvatting: zo horen beide pushberichten bij
  // dezelfde week en gaat een zonewijziging niet verloren als de review faalt.
  const kalibratie = await kalibreerTempoZones(supabase)

  // Week: maandag t/m vandaag (zondag)
  const nu = new Date()
  const maandag = new Date(nu)
  maandag.setDate(nu.getDate() - 6)
  const weekStart = maandag.toISOString().split('T')[0]
  const weekEind = nu.toISOString().split('T')[0]

  // Haal alle gebruikers op met een push subscription
  const { data: profielen } = await supabase
    .from('profiles')
    .select('id, naam, push_subscription')
    .not('push_subscription', 'is', null)

  if (!profielen?.length) return NextResponse.json({ verstuurd: 0, kalibratie })

  let verstuurd = 0

  for (const profiel of profielen) {
    try {
      // Haal voltooide sessies van deze week op
      const { data: sessies } = await supabase
        .from('training_sessions')
        .select('type, afstand_km, voltooid')
        .eq('user_id', profiel.id)
        .eq('voltooid', true)
        .gte('datum', weekStart)
        .lte('datum', weekEind)

      const aantalTrainingen = sessies?.length ?? 0
      const totaalKm = sessies
        ?.filter(s => s.afstand_km)
        .reduce((som, s) => som + (s.afstand_km ?? 0), 0) ?? 0

      const naam = profiel.naam?.split(' ')[0] ?? 'Atleet'

      let samenvatting: string
      if (aantalTrainingen === 0) {
        samenvatting = `Deze week geen trainingen voltooid. Nieuwe week, nieuwe kans! 💪`
      } else if (totaalKm > 0) {
        samenvatting = `Je hebt deze week ${totaalKm.toFixed(1)} km gelopen en ${aantalTrainingen} ${aantalTrainingen === 1 ? 'training' : 'trainingen'} gedaan. Goed bezig, ${naam}!`
      } else {
        samenvatting = `Je hebt deze week ${aantalTrainingen} ${aantalTrainingen === 1 ? 'training' : 'trainingen'} gedaan. Goed bezig, ${naam}!`
      }

      const titel = 'Week samenvatting 📊'

      await webpush.sendNotification(
        profiel.push_subscription as webpush.PushSubscription,
        JSON.stringify({ title: titel, body: samenvatting, url: '/coach' })
      )
      verstuurd++
    } catch {
      // Stille fail per gebruiker — ga door met de rest
    }
  }

  return NextResponse.json({
    verstuurd,
    totaal: profielen.length,
    week: { start: weekStart, eind: weekEind },
    kalibratie,
  })
}

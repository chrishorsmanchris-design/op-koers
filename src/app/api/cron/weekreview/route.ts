import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

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

  const supabase = await createClient()

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

  if (!profielen?.length) return NextResponse.json({ verstuurd: 0 })

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

  return NextResponse.json({ verstuurd, totaal: profielen.length, week: { start: weekStart, eind: weekEind } })
}

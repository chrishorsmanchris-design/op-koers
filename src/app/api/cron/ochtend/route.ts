import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

const claude = new Anthropic()

export async function GET(req: NextRequest) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  // Beveilig de cron endpoint
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Ongeautoriseerd' }, { status: 401 })
  }

  const supabase = await createClient()
  const vandaag = new Date().toISOString().split('T')[0]

  // ── Strava sync voor alle gekoppelde gebruikers ─────────────────────────────
  const { data: stravaProfielen } = await supabase
    .from('profiles')
    .select('id, strava_refresh_token')
    .not('strava_refresh_token', 'is', null)

  if (stravaProfielen?.length) {
    for (const sp of stravaProfielen) {
      try {
        const refreshToken = (sp as Record<string, unknown>).strava_refresh_token as string
        const tokenRes = await fetch('https://www.strava.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: process.env.STRAVA_CLIENT_ID?.trim(),
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
        })
        if (!tokenRes.ok) continue
        const { access_token } = await tokenRes.json()

        const na = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60 // afgelopen 2 dagen
        const actRes = await fetch(
          `https://www.strava.com/api/v3/athlete/activities?after=${na}&per_page=20`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        )
        if (!actRes.ok) continue
        const activiteiten = await actRes.json()
        const userId = (sp as Record<string, unknown>).id as string

        for (const run of activiteiten.filter((a: Record<string, unknown>) => a.type === 'Run')) {
          const datum = (run.start_date_local as string).split('T')[0]
          const afstandKm = Math.round((run.distance as number) / 10) / 100
          const duurMin = Math.round((run.moving_time as number) / 60)

          const { data: sessies } = await supabase.from('training_sessions').select('id')
            .eq('user_id', userId).eq('datum', datum).eq('type', 'hardlopen').limit(1)

          if (sessies?.length) {
            await supabase.from('training_sessions').update({ voltooid: true, runkeeper_id: String(run.id) } as never)
              .eq('id', sessies[0].id).eq('user_id', userId)
          } else {
            const d = new Date(datum + 'T12:00:00')
            const dag = d.getDay() || 7; d.setDate(d.getDate() + 4 - dag)
            const jaarStart = new Date(d.getFullYear(), 0, 1)
            const week = Math.ceil(((d.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7)
            await supabase.from('training_sessions').insert({
              user_id: userId, datum, type: 'hardlopen',
              beschrijving: (run.name as string) ?? `Spontane run — ${afstandKm} km`,
              duur_minuten: duurMin, afstand_km: afstandKm,
              intensiteit: 'makkelijk', voltooid: true, overgeslagen: false,
              runkeeper_id: String(run.id), week_nummer: week, volgorde: 0,
            } as never)
          }
        }
      } catch { /* stille fail per gebruiker */ }
    }
  }

  // ── Haal alle gebruikers op met een push subscription ───────────────────────
  const { data: profielen } = await supabase
    .from('profiles')
    .select('id, naam, push_subscription, wil_core, core_per_week, fysio_per_week')
    .not('push_subscription', 'is', null)

  if (!profielen?.length) return NextResponse.json({ verstuurd: 0 })

  let verstuurd = 0

  for (const profiel of profielen) {
    try {
      // Haal training van vandaag op
      const { data: sessies } = await supabase
        .from('training_sessions')
        .select('type, beschrijving, duur_minuten, afstand_km, intensiteit')
        .eq('user_id', profiel.id)
        .eq('datum', vandaag)
        .eq('voltooid', false)
        .eq('overgeslagen', false)

      // Haal streak en recente sessies op
      const { data: recenteSessies } = await supabase
        .from('training_sessions')
        .select('datum, type, voltooid, overgeslagen, afstand_km')
        .eq('user_id', profiel.id)
        .eq('voltooid', true)
        .gte('datum', new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0])
        .order('datum', { ascending: false })

      const naam = profiel.naam?.split(' ')[0] ?? 'Atleet'
      const trainingSessie = sessies?.find(s => s.type === 'hardlopen' || s.type === 'krachttraining' || s.type === 'cross')
      const heeftFysio = true // altijd relevant als ze physical exercises hebben
      const aantalRecentSessies = recenteSessies?.length ?? 0

      // Bepaal context voor AI
      const context = [
        trainingSessie ? `Training vandaag: ${trainingSessie.beschrijving} (${trainingSessie.duur_minuten} min${trainingSessie.afstand_km ? `, ${trainingSessie.afstand_km}km` : ''})` : 'Geen looptraining vandaag',
        `Recente sessies (14 dagen): ${aantalRecentSessies}`,
        profiel.wil_core ? 'Core stability: actief' : '',
        heeftFysio ? 'Heeft fysio oefeningen' : '',
      ].filter(Boolean).join('. ')

      // Genereer AI bericht
      const response = await claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Schrijf een korte motiverende push notificatie (max 90 tekens) voor hardloper ${naam}. Context: ${context}. Toon: vriendelijk coach, Nederlands, geen emoji aan het begin. Geef ALLEEN de tekst terug.`
        }]
      })

      const bericht = response.content[0].type === 'text'
        ? response.content[0].text.trim().slice(0, 100)
        : trainingSessie
          ? `Goedemorgen ${naam}! Je training staat klaar. Laten we gaan! 🏃`
          : `Goedemorgen ${naam}! Vergeet je fysio en core niet vandaag. 💪`

      const titel = trainingSessie
        ? `🏃 Training vandaag — ${trainingSessie.beschrijving?.slice(0, 30)}`
        : profiel.wil_core
          ? '🧘 Core & Fysio vandaag'
          : '🩺 Fysio vandaag'

      await webpush.sendNotification(
        profiel.push_subscription as webpush.PushSubscription,
        JSON.stringify({ title: titel, body: bericht, url: '/dashboard' })
      )
      verstuurd++
    } catch {
      // Stille fail per gebruiker — ga door met de rest
    }
  }

  return NextResponse.json({ verstuurd, totaal: profielen.length })
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID?.trim(),
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.access_token ?? null
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { data: profiel } = await supabase
    .from('profiles')
    .select('strava_refresh_token')
    .eq('id', user.id)
    .single()

  const refreshToken = (profiel as Record<string, unknown>)?.strava_refresh_token as string | null
  if (!refreshToken) return NextResponse.json({ error: 'Strava niet gekoppeld' }, { status: 400 })

  const accessToken = await getAccessToken(refreshToken)
  if (!accessToken) return NextResponse.json({ error: 'Token ophalen mislukt' }, { status: 500 })

  // Haal activiteiten op van de afgelopen 90 dagen
  const na = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60
  const activiteitenRes = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${na}&per_page=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!activiteitenRes.ok) return NextResponse.json({ error: 'Activiteiten ophalen mislukt' }, { status: 500 })
  const activiteiten = await activiteitenRes.json()

  const runs = activiteiten.filter((a: Record<string, unknown>) => a.type === 'Run')

  let gesynct = 0
  for (const run of runs) {
    const datum = (run.start_date_local as string).split('T')[0]

    const { data: sessies } = await supabase
      .from('training_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('datum', datum)
      .eq('type', 'hardlopen')
      .limit(1)

    if (!sessies?.length) continue
    const sessieId = sessies[0].id

    // Bereken actuele waarden uit Strava
    const afstandKm = Math.round((run.distance as number) / 10) / 100
    const duurMin = Math.round((run.moving_time as number) / 60)
    const hartslagGem = run.average_heartrate ? Math.round(run.average_heartrate as number) : null
    const hartslagMax = run.max_heartrate ? Math.round(run.max_heartrate as number) : null

    // Markeer sessie als voltooid + sla Strava ID op
    await supabase.from('training_sessions').update({
      voltooid: true,
      runkeeper_id: String(run.id),
    } as never).eq('id', sessieId)

    // Upsert session_feedback met Strava data
    const { data: bestaandeFeedback } = await supabase
      .from('session_feedback')
      .select('id')
      .eq('session_id', sessieId)
      .maybeSingle()

    if (bestaandeFeedback) {
      await supabase.from('session_feedback').update({
        werkelijke_afstand: afstandKm,
        werkelijke_duur: duurMin,
        hartslag_gem: hartslagGem,
        hartslag_max: hartslagMax,
      } as never).eq('id', bestaandeFeedback.id)
    } else {
      await supabase.from('session_feedback').insert({
        session_id: sessieId,
        user_id: user.id,
        rating: 'goed',
        werkelijke_afstand: afstandKm,
        werkelijke_duur: duurMin,
        hartslag_gem: hartslagGem,
        hartslag_max: hartslagMax,
        notitie: `Strava sync — ${(run.name as string) ?? ''}`,
      } as never)
    }

    gesynct++
  }

  return NextResponse.json({ gesynct, totaal: runs.length })
}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
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

  // Match Strava runs met training_sessions op datum
  const runs = activiteiten.filter((a: Record<string, unknown>) => a.type === 'Run')

  let gesynct = 0
  for (const run of runs) {
    const datum = (run.start_date_local as string).split('T')[0]

    // Vind bijpassende training_sessie
    const { data: sessies } = await supabase
      .from('training_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('datum', datum)
      .eq('type', 'hardlopen')
      .is('runkeeper_id', null)
      .limit(1)

    if (sessies && sessies.length > 0) {
      await supabase.from('training_sessions').update({
        voltooid: true,
        runkeeper_id: String(run.id),
        werkelijke_afstand: Math.round((run.distance as number) / 10) / 100,
      } as never).eq('id', sessies[0].id)
      gesynct++
    }
  }

  return NextResponse.json({ gesynct, totaal: runs.length })
}

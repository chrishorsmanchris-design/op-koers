import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function isoWeeknummer(datum: string): number {
  const d = new Date(datum + 'T12:00:00')
  const dag = d.getDay() || 7
  d.setDate(d.getDate() + 4 - dag)
  const jaarStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7)
}

// GET: Strava webhook validatie
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ 'hub.challenge': challenge })
  }
  return NextResponse.json({ error: 'Ongeautoriseerd' }, { status: 403 })
}

// POST: Strava stuurt activiteit-events
export async function POST(req: NextRequest) {
  const body = await req.json()

  // Alleen nieuwe activiteiten verwerken
  if (body.object_type !== 'activity' || body.aspect_type !== 'create') {
    return NextResponse.json({ ok: true })
  }

  const athleteId = body.owner_id as number
  const activityId = body.object_id as number

  const supabase = await createClient()

  // Vind de gebruiker op basis van Strava athlete ID
  const { data: profiel } = await supabase
    .from('profiles')
    .select('id, strava_refresh_token')
    .eq('strava_athlete_id', athleteId)
    .maybeSingle()

  if (!profiel?.strava_refresh_token) return NextResponse.json({ ok: true })

  // Haal access token op
  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID?.trim(),
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: profiel.strava_refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  if (!tokenRes.ok) return NextResponse.json({ ok: true })
  const { access_token } = await tokenRes.json()

  // Haal activiteitsdetails op
  const actRes = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  if (!actRes.ok) return NextResponse.json({ ok: true })
  const activity = await actRes.json()

  // Alleen hardloopsessies
  if (activity.type !== 'Run') return NextResponse.json({ ok: true })

  const datum = (activity.start_date_local as string).split('T')[0]
  const afstandKm = Math.round((activity.distance as number) / 10) / 100
  const duurMin = Math.round((activity.moving_time as number) / 60)
  const hartslagGem = activity.average_heartrate ? Math.round(activity.average_heartrate as number) : null
  const hartslagMax = activity.max_heartrate ? Math.round(activity.max_heartrate as number) : null
  const routePolyline = (activity.map as Record<string, unknown> | undefined)?.summary_polyline as string | null ?? null

  // Zoek bestaande geplande sessie op deze datum
  const { data: geplandeSessies } = await supabase
    .from('training_sessions')
    .select('id')
    .eq('user_id', profiel.id)
    .eq('datum', datum)
    .eq('type', 'hardlopen')
    .is('runkeeper_id', null)
    .limit(1)

  let sessieId: string

  if (geplandeSessies?.length) {
    // Koppel aan bestaande sessie
    sessieId = geplandeSessies[0].id
    await supabase.from('training_sessions').update({
      voltooid: true,
      runkeeper_id: String(activityId),
    } as never).eq('id', sessieId)
  } else {
    // Maak nieuwe sessie aan voor spontane run
    const { data: nieuw } = await supabase
      .from('training_sessions')
      .insert({
        user_id: profiel.id,
        datum,
        type: 'hardlopen',
        beschrijving: (activity.name as string) ?? `Spontane run — ${afstandKm} km`,
        duur_minuten: duurMin,
        afstand_km: afstandKm,
        intensiteit: 'makkelijk',
        voltooid: true,
        overgeslagen: false,
        runkeeper_id: String(activityId),
        week_nummer: isoWeeknummer(datum),
        volgorde: 0,
      } as never)
      .select('id')
      .single()

    if (!nieuw) return NextResponse.json({ ok: true })
    sessieId = (nieuw as Record<string, string>).id
  }

  // Sla Strava data op in session_feedback
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
      route_polyline: routePolyline,
    } as never).eq('id', bestaandeFeedback.id)
  } else {
    await supabase.from('session_feedback').insert({
      session_id: sessieId,
      user_id: profiel.id,
      rating: 'goed',
      werkelijke_afstand: afstandKm,
      werkelijke_duur: duurMin,
      hartslag_gem: hartslagGem,
      hartslag_max: hartslagMax,
      route_polyline: routePolyline,
      notitie: `Strava — ${(activity.name as string) ?? ''}`,
    } as never)
  }

  return NextResponse.json({ ok: true })
}

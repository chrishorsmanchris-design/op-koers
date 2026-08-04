import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getStravaAccessToken, vindOfMaakSessie } from '@/lib/strava-sync'

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

  // Strava roept ons aan zonder ingelogde gebruiker, dus zonder sessie-cookie.
  // Met de anon-client blokkeert RLS (auth.uid() = user_id) élke lees- en
  // schrijfactie hier stilletjes — de webhook deed feitelijk niets. Daarom de
  // service-role client, net als bij de cronjobs.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Strava-webhook: SUPABASE_SERVICE_ROLE_KEY ontbreekt')
    return NextResponse.json({ ok: true })
  }
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Vind de gebruiker op basis van Strava athlete ID
  const { data: profiel } = await supabase
    .from('profiles')
    .select('id, strava_refresh_token')
    .eq('strava_athlete_id', athleteId)
    .maybeSingle()

  if (!profiel?.strava_refresh_token) return NextResponse.json({ ok: true })

  // Haal access token op
  const access_token = await getStravaAccessToken(profiel.strava_refresh_token)
  if (!access_token) return NextResponse.json({ ok: true })

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

  // Zoek/koppel/maak de sessie — dedupeert eerst op het exacte Strava activity-ID
  const sessieId = await vindOfMaakSessie(
    supabase, profiel.id, { ...activity, id: activityId }, datum, afstandKm, duurMin
  )
  if (!sessieId) return NextResponse.json({ ok: true })

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

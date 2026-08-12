import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Koppelt een losse Strava-run handmatig aan een geplande sessie.
 *
 * Waarom handmatig en niet automatisch: koppelen op datum alleen gaat mis zodra
 * je een andere afstand loopt dan gepland — dan zou een rondje van 5 km als
 * "lange duurloop" je historie en je tempozones vervuilen. De gebruiker weet
 * wél welke run bij welke training hoorde, dus die beslist.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { strava_sessie_id, plan_sessie_id } = await req.json()
  if (!strava_sessie_id || !plan_sessie_id) {
    return NextResponse.json({ error: 'Beide sessie-ids zijn verplicht' }, { status: 400 })
  }
  if (strava_sessie_id === plan_sessie_id) {
    return NextResponse.json({ error: 'Dit is dezelfde sessie' }, { status: 400 })
  }

  // Beide rijen ophalen en controleren dat ze van deze gebruiker zijn. Zonder
  // die check zou iemand met een geraden id andermans sessies kunnen samenvoegen.
  const { data: rijen } = await supabase
    .from('training_sessions')
    .select('id, user_id, runkeeper_id, afstand_km, duur_minuten')
    .eq('user_id', user.id)
    .in('id', [strava_sessie_id, plan_sessie_id])

  const strava = rijen?.find(r => r.id === strava_sessie_id)
  const plan = rijen?.find(r => r.id === plan_sessie_id)

  if (!strava || !plan) {
    return NextResponse.json({ error: 'Sessie niet gevonden' }, { status: 404 })
  }
  if (!strava.runkeeper_id) {
    return NextResponse.json({ error: 'De bronsessie komt niet van Strava' }, { status: 400 })
  }
  if (plan.runkeeper_id) {
    return NextResponse.json({ error: 'Die training is al aan een activiteit gekoppeld' }, { status: 400 })
  }

  // 1. Meetwaarden van de Strava-rij naar de feedback van de geplande sessie.
  const { data: stravaFeedback } = await supabase
    .from('session_feedback')
    .select('*')
    .eq('session_id', strava_sessie_id)
    .maybeSingle()

  if (stravaFeedback) {
    const meting = stravaFeedback as Record<string, unknown>
    const { data: planFeedback } = await supabase
      .from('session_feedback')
      .select('id')
      .eq('session_id', plan_sessie_id)
      .maybeSingle()

    if (planFeedback) {
      // COALESCE-gedrag: een handmatig ingevulde waarde blijft staan als Strava
      // er niets voor heeft.
      await supabase.from('session_feedback').update({
        werkelijke_afstand: meting.werkelijke_afstand,
        werkelijke_duur: meting.werkelijke_duur,
        hartslag_gem: meting.hartslag_gem,
        hartslag_max: meting.hartslag_max,
        route_polyline: meting.route_polyline,
      } as never).eq('id', (planFeedback as Record<string, string>).id)
    } else {
      await supabase.from('session_feedback').insert({
        session_id: plan_sessie_id,
        user_id: user.id,
        rating: meting.rating ?? 'goed',
        werkelijke_afstand: meting.werkelijke_afstand,
        werkelijke_duur: meting.werkelijke_duur,
        hartslag_gem: meting.hartslag_gem,
        hartslag_max: meting.hartslag_max,
        route_polyline: meting.route_polyline,
        notitie: 'Gekoppeld vanuit Strava',
      } as never)
    }
  }

  // 2. De losse Strava-rij weg. Moet vóór stap 3: anders bestaan er even twee
  //    rijen met hetzelfde runkeeper_id en slaat de unieke index aan.
  const { error: deleteFout } = await supabase
    .from('training_sessions')
    .delete()
    .eq('id', strava_sessie_id)

  if (deleteFout) {
    return NextResponse.json({ error: `Opruimen mislukt: ${deleteFout.message}` }, { status: 500 })
  }

  // 3. Strava leidend maken op de geplande sessie.
  const { error: updateFout } = await supabase
    .from('training_sessions')
    .update({
      runkeeper_id: strava.runkeeper_id,
      afstand_km: strava.afstand_km ?? plan.afstand_km,
      duur_minuten: strava.duur_minuten ?? plan.duur_minuten,
      voltooid: true,
      overgeslagen: false,
    } as never)
    .eq('id', plan_sessie_id)

  if (updateFout) {
    return NextResponse.json({ error: `Koppelen mislukt: ${updateFout.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

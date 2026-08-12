import { SupabaseClient } from '@supabase/supabase-js'

function isoWeeknummer(datum: string): number {
  const d = new Date(datum + 'T12:00:00')
  const dag = d.getDay() || 7
  d.setDate(d.getDate() + 4 - dag)
  const jaarStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7)
}

/**
 * Wisselt een refresh token in voor een access token.
 *
 * Strava kan bij elke refresh een NIEUW refresh token teruggeven (rotatie). Geven
 * we dat niet door aan de aanroeper, dan blijft het oude token in de database
 * staan en faalt elke volgende refresh — de koppeling lijkt dan spontaan kapot.
 */
export async function getStravaAccessToken(
  refreshToken: string
): Promise<string | null> {
  const { accessToken } = await haalStravaToken(refreshToken)
  return accessToken
}

export async function haalStravaToken(refreshToken: string): Promise<{
  accessToken: string | null
  nieuwRefreshToken: string | null
  fout?: string
}> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID?.trim(),
      client_secret: process.env.STRAVA_CLIENT_SECRET?.trim(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const tekst = await res.text().catch(() => '')
    return {
      accessToken: null,
      nieuwRefreshToken: null,
      fout: `Strava token ${res.status}: ${tekst.slice(0, 200)}`,
    }
  }

  const data = await res.json()
  return {
    accessToken: data.access_token ?? null,
    nieuwRefreshToken: (data.refresh_token as string | undefined) ?? null,
  }
}

/**
 * Vindt (of maakt) de training_session die bij een specifieke Strava-activiteit hoort.
 *
 * Strava is leidend: zodra een activiteit aan een geplande sessie gekoppeld is,
 * overschrijven we afstand en duur met wat er écht gelopen is. De geplande waarden
 * ("18 km") zijn een voornemen; de Strava-waarden zijn een feit.
 *
 * Dedupeert op het exacte Strava activity-ID. Let op: die dedupe alléén is niet
 * genoeg — de sync wordt vanaf meerdere plekken tegelijk getriggerd (dashboard én
 * activiteitenpagina), dus twee syncs kunnen allebei stap 1 passeren voordat één
 * van beide klaar is. Daarom vangt stap 3 een unique-violation op de database-index
 * (user_id, runkeeper_id) af en pakt dan alsnog de sessie die de andere sync
 * aanmaakte. Zonder die index blijft de race bestaan; zie
 * supabase/migration_strava_uniek.sql.
 */
export async function vindOfMaakSessie(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  run: Record<string, unknown>,
  datum: string,
  afstandKm: number,
  duurMin: number
): Promise<string | null> {
  const activityId = String(run.id)

  const werkelijk = {
    voltooid: true,
    overgeslagen: false,
    afstand_km: afstandKm,
    duur_minuten: duurMin,
    runkeeper_id: activityId,
  }

  // Stap 1: is deze exacte activiteit al eerder gesynct? Dan nooit opnieuw aanmaken,
  // wel bijwerken — Strava corrigeert afstand/duur soms na afloop.
  const { data: reedsGesynct } = await supabase
    .from('training_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('runkeeper_id', activityId)
    .limit(1)

  if (reedsGesynct?.length) {
    const sessieId = reedsGesynct[0].id
    await supabase.from('training_sessions')
      .update(werkelijk as never).eq('id', sessieId)
    return sessieId
  }

  // Stap 2: koppel aan een geplande, nog niet gesynchroniseerde sessie op dezelfde
  // datum. Of de gebruiker hem zelf al afgevinkt heeft maakt niet uit — juist dán
  // moeten we koppelen in plaats van een tweede rij aanmaken. Bij meerdere kandidaten
  // pakken we de sessie waarvan de geplande afstand het dichtst bij de werkelijke
  // ligt, zodat een dubbele loopdag niet de verkeerde sessie claimt.
  const { data: sessies } = await supabase
    .from('training_sessions')
    .select('id, afstand_km')
    .eq('user_id', userId)
    .eq('datum', datum)
    .eq('type', 'hardlopen')
    .is('runkeeper_id', null)

  if (sessies?.length) {
    const beste = [...sessies].sort((a, b) =>
      Math.abs((a.afstand_km ?? 0) - afstandKm) - Math.abs((b.afstand_km ?? 0) - afstandKm)
    )[0]
    await supabase.from('training_sessions')
      .update(werkelijk as never).eq('id', beste.id)
    return beste.id
  }

  // Stap 3: geen match — maak een nieuwe spontane sessie aan
  const { data: nieuw, error } = await supabase
    .from('training_sessions')
    .insert({
      user_id: userId,
      datum,
      type: 'hardlopen',
      beschrijving: (run.name as string) ?? `Spontane run — ${afstandKm} km`,
      intensiteit: 'makkelijk',
      week_nummer: isoWeeknummer(datum),
      volgorde: 0,
      ...werkelijk,
    } as never)
    .select('id')
    .single()

  if (nieuw) return (nieuw as Record<string, string>).id

  // 23505 = unique_violation: een parallelle sync was ons net voor. Geen fout —
  // pak gewoon de sessie die zij heeft aangemaakt.
  if (error?.code === '23505') {
    const { data: gewonnen } = await supabase
      .from('training_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('runkeeper_id', activityId)
      .limit(1)
    if (gewonnen?.length) return gewonnen[0].id
  }

  return null
}

/**
 * Synct Strava-hardloopactiviteiten van de afgelopen 90 dagen naar training_sessions
 * + session_feedback. Gedeeld tussen de sync-route (handmatig), de callback-route
 * (direct na koppelen) en de webhook-route (per activiteit).
 */
export async function syncStravaRuns(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  refreshToken: string
): Promise<{ gesynct: number; totaal: number; error?: string }> {
  const { accessToken, nieuwRefreshToken, fout } = await haalStravaToken(refreshToken)
  if (!accessToken) {
    return { gesynct: 0, totaal: 0, error: fout ?? 'Token ophalen mislukt' }
  }

  // Roteerde Strava het refresh token? Dan meteen opslaan, anders werkt de
  // volgende sync niet meer.
  if (nieuwRefreshToken && nieuwRefreshToken !== refreshToken) {
    await supabase
      .from('profiles')
      .update({ strava_refresh_token: nieuwRefreshToken } as never)
      .eq('id', userId)
  }

  const na = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60
  const activiteitenRes = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${na}&per_page=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!activiteitenRes.ok) {
    // Zonder de status erbij is dit niet te diagnosticeren: 401 betekent dat de
    // koppeling ingetrokken is, 429 dat we tegen Strava's limiet aanlopen
    // (200 per 15 min). Dat vraagt om totaal verschillende acties.
    const tekst = await activiteitenRes.text().catch(() => '')
    const limiet = activiteitenRes.headers.get('x-ratelimit-usage')
    // 403 met resource "Application" gaat NIET over deze gebruiker: Strava heeft
    // dan de API-applicatie zelf op inactief gezet. Opnieuw koppelen helpt niet;
    // dat moet je in je Strava-ontwikkelaarsinstellingen oplossen.
    const appInactief =
      activiteitenRes.status === 403 &&
      tekst.includes('"Application"') &&
      tekst.includes('Inactive')

    const uitleg = appInactief
      ? 'De Strava-app staat op inactief. Controleer strava.com/settings/api — meestal moet je daar nieuwe API-voorwaarden accepteren. Opnieuw koppelen helpt niet.'
      : activiteitenRes.status === 401
        ? 'Strava-koppeling is verlopen of ingetrokken — koppel opnieuw via Instellingen.'
        : activiteitenRes.status === 429
          ? `Strava-limiet bereikt${limiet ? ` (gebruik: ${limiet})` : ''} — probeer het over een kwartier opnieuw.`
          : tekst.slice(0, 200)
    return {
      gesynct: 0,
      totaal: 0,
      error: `Activiteiten ophalen mislukt (${activiteitenRes.status}): ${uitleg}`,
    }
  }

  const activiteiten = await activiteitenRes.json()

  const runs = activiteiten.filter((a: Record<string, unknown>) => a.type === 'Run')

  let gesynct = 0
  for (const run of runs) {
    const datum = (run.start_date_local as string).split('T')[0]

    const afstandKm = Math.round((run.distance as number) / 10) / 100
    const duurMin = Math.round((run.moving_time as number) / 60)
    const hartslagGem = run.average_heartrate ? Math.round(run.average_heartrate as number) : null
    const hartslagMax = run.max_heartrate ? Math.round(run.max_heartrate as number) : null
    const routePolyline = (run.map as Record<string, unknown> | undefined)?.summary_polyline as string | null ?? null

    const sessieId = await vindOfMaakSessie(supabase, userId, run, datum, afstandKm, duurMin)
    if (!sessieId) continue

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
        user_id: userId,
        rating: 'goed',
        werkelijke_afstand: afstandKm,
        werkelijke_duur: duurMin,
        hartslag_gem: hartslagGem,
        hartslag_max: hartslagMax,
        route_polyline: routePolyline,
        notitie: `Strava sync — ${(run.name as string) ?? ''}`,
      } as never)
    }

    gesynct++
  }

  return { gesynct, totaal: runs.length }
}

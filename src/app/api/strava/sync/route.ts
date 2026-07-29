import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncStravaRuns } from '@/lib/strava-sync'

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

  const resultaat = await syncStravaRuns(supabase, user.id, refreshToken)
  if (resultaat.error) return NextResponse.json({ error: resultaat.error }, { status: 500 })

  return NextResponse.json(resultaat)
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ActiviteitenClient } from './ActiviteitenClient'

export default async function ActiviteitenPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const vandaag = new Date().toISOString().split('T')[0]

  const [{ data: sessies }, { data: fysioSessies }, { data: coreSessies }, { data: profiel }, { data: sportActiviteiten }] = await Promise.all([
    supabase
      .from('training_sessions')
      .select('id, datum, type, beschrijving, duur_minuten, afstand_km, intensiteit, voltooid, overgeslagen, week_nummer')
      .eq('user_id', user.id)
      .eq('voltooid', true)
      .neq('type', 'rust')
      .order('datum', { ascending: false })
      .limit(200),
    supabase
      .from('physio_sessions')
      .select('id, datum, voltooid')
      .eq('user_id', user.id)
      .eq('voltooid', true)
      .order('datum', { ascending: false })
      .limit(100),
    supabase
      .from('training_sessions')
      .select('id, datum, voltooid')
      .eq('user_id', user.id)
      .eq('type', 'core')
      .eq('voltooid', true)
      .order('datum', { ascending: false })
      .limit(100),
    supabase.from('profiles').select('naam, strava_refresh_token').eq('id', user.id).single(),
    supabase
      .from('sport_activities')
      .select('id, datum, sport, duur_minuten, intensiteit, notitie')
      .eq('user_id', user.id)
      .order('datum', { ascending: false })
      .limit(200),
  ])

  return (
    <ActiviteitenClient
      sessies={sessies ?? []}
      fysioSessies={fysioSessies ?? []}
      coreSessies={coreSessies ?? []}
      sportActiviteiten={sportActiviteiten ?? []}
      heeftStrava={!!(profiel?.strava_refresh_token)}
      vandaag={vandaag}
    />
  )
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SchemaClient } from './SchemaClient'

export default async function SchemaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: sessies }, { data: doel }, { data: profiel }, { data: fysioOefeningen }] = await Promise.all([
    supabase.from('training_sessions')
      .select('*, session_feedback(*)')
      .eq('user_id', user.id)
      .order('datum', { ascending: true }),
    supabase.from('goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('actief', true)
      .single(),
    supabase.from('profiles').select('wil_core, core_per_week, fysio_per_week, tempo_zones, tempo_zones_updated_at').eq('id', user.id).single(),
    supabase.from('physio_exercises').select('id').eq('user_id', user.id).eq('actief', true),
  ])

  return (
    <SchemaClient
      sessies={sessies ?? []}
      doel={doel}
      userId={user.id}
      wilCore={profiel?.wil_core ?? false}
      heeftFysio={(fysioOefeningen?.length ?? 0) > 0}
      tempoZones={(profiel as Record<string, unknown>)?.tempo_zones as never ?? null}
      tempoZonesUpdatedAt={(profiel as Record<string, unknown>)?.tempo_zones_updated_at as string ?? null}
    />
  )
}

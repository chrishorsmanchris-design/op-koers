import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient } from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const vandaag = new Date().toISOString().split('T')[0]

  const [{ data: profiel }, { data: sessies }, { data: fysioOefeningen }, { data: doelen }, { data: activiteiten }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('training_sessions')
      .select('*, session_feedback(*)')
      .eq('user_id', user.id)
      .gte('datum', vandaag)
      .order('datum', { ascending: true })
      .limit(10),
    supabase.from('physio_exercises')
      .select('*')
      .eq('user_id', user.id)
      .eq('actief', true),
    supabase.from('goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('actief', true)
      .order('datum', { ascending: true })
      .limit(1),
    supabase.from('recurring_activities')
      .select('*')
      .eq('user_id', user.id),
  ])

  if (profiel && !(profiel as Record<string, unknown>).onboarding_voltooid) {
    redirect('/onboarding')
  }

  return (
    <DashboardClient
      profiel={profiel}
      sessies={sessies ?? []}
      fysioOefeningen={fysioOefeningen ?? []}
      doel={doelen?.[0] ?? null}
      vandaag={vandaag}
      activiteiten={activiteiten ?? []}
    />
  )
}

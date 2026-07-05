import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InstellingenClient } from './InstellingenClient'
import { AnalyticsClient } from './AnalyticsClient'
import { Suspense } from 'react'
import { TabLayout } from './TabLayout'

async function InstellingenData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const zesMandenGeleden = new Date()
  zesMandenGeleden.setMonth(zesMandenGeleden.getMonth() - 6)
  const vanafDatum = zesMandenGeleden.toISOString().split('T')[0]

  const [
    { data: profiel },
    { data: doelen },
    { data: vakanties },
    { data: resultaten },
    { data: activiteiten },
    { data: sessies },
    { data: fysioSessies },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('goals').select('*').eq('user_id', user.id).order('datum', { ascending: false }),
    supabase.from('vacations').select('*').eq('user_id', user.id).order('start_datum', { ascending: true }),
    supabase.from('previous_results').select('*').eq('user_id', user.id).order('datum', { ascending: false }),
    supabase.from('recurring_activities').select('*').eq('user_id', user.id).order('dag_van_week', { ascending: true }),
    supabase.from('training_sessions')
      .select('*, session_feedback(*)')
      .eq('user_id', user.id)
      .gte('datum', vanafDatum)
      .lte('datum', new Date().toISOString().split('T')[0])
      .order('datum', { ascending: true }),
    supabase.from('physio_sessions')
      .select('datum, voltooid')
      .eq('user_id', user.id)
      .gte('datum', vanafDatum)
      .order('datum', { ascending: true }),
  ])

  return (
    <TabLayout
      instellingen={
        <InstellingenClient
          profiel={profiel}
          doelen={doelen ?? []}
          vakanties={vakanties ?? []}
          resultaten={resultaten ?? []}
          activiteiten={activiteiten ?? []}
        />
      }
      analytics={
        <AnalyticsClient
          sessies={sessies ?? []}
          fysioSessies={fysioSessies ?? []}
          profiel={profiel}
          doel={doelen?.find(d => d.actief) ?? null}
        />
      }
    />
  )
}

export default function InstellingenPage() {
  return (
    <Suspense fallback={<div className="p-8 text-[#8888a8]">Laden...</div>}>
      <InstellingenData />
    </Suspense>
  )
}

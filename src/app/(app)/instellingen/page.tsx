import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { InstellingenClient } from './InstellingenClient'
import { Suspense } from 'react'

async function InstellingenData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profiel }, { data: doelen }, { data: vakanties }, { data: resultaten }, { data: activiteiten }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('goals').select('*').eq('user_id', user.id).order('datum', { ascending: false }),
    supabase.from('vacations').select('*').eq('user_id', user.id).order('start_datum', { ascending: true }),
    supabase.from('previous_results').select('*').eq('user_id', user.id).order('datum', { ascending: false }),
    supabase.from('recurring_activities').select('*').eq('user_id', user.id).order('dag_van_week', { ascending: true }),
  ])

  return <InstellingenClient profiel={profiel} doelen={doelen ?? []} vakanties={vakanties ?? []} resultaten={resultaten ?? []} activiteiten={activiteiten ?? []} />
}

export default function InstellingenPage() {
  return (
    <Suspense fallback={<div className="p-8 text-[#6b6560]">Laden...</div>}>
      <InstellingenData />
    </Suspense>
  )
}

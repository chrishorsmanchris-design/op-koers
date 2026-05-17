import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SchemaClient } from './SchemaClient'

export default async function SchemaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: sessies }, { data: doel }] = await Promise.all([
    supabase.from('training_sessions')
      .select('*, session_feedback(*)')
      .eq('user_id', user.id)
      .order('datum', { ascending: true }),
    supabase.from('goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('actief', true)
      .single(),
  ])

  return <SchemaClient sessies={sessies ?? []} doel={doel} userId={user.id} />
}

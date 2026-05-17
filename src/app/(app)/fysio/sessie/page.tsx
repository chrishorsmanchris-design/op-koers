import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SessieClient } from './SessieClient'

export default async function FysioSessiePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: oefeningen } = await supabase
    .from('physio_exercises')
    .select('*')
    .eq('user_id', user.id)
    .eq('actief', true)
    .order('created_at', { ascending: true })

  return <SessieClient oefeningen={oefeningen ?? []} />
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FysioClient } from './FysioClient'

export default async function FysioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: oefeningen } = await supabase
    .from('physio_exercises')
    .select('*')
    .eq('user_id', user.id)
    .eq('actief', true)
    .order('created_at', { ascending: true })

  return <FysioClient oefeningen={oefeningen ?? []} />
}

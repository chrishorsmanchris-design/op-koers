import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FysioClient } from './FysioClient'

export default async function FysioPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: oefeningen }, { data: profiel }] = await Promise.all([
    supabase.from('physio_exercises').select('*').eq('user_id', user.id).eq('actief', true).order('created_at', { ascending: true }),
    supabase.from('profiles').select('physio_klacht').eq('id', user.id).single(),
  ])

  return <FysioClient oefeningen={oefeningen ?? []} physioKlacht={profiel?.physio_klacht ?? null} />
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BibliotheekClient } from './BibliotheekClient'

export default async function BibliotheekPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: oefeningen } = await supabase
    .from('physio_exercises')
    .select('id, naam, categorie, sets, reps, duur_seconden, beschrijving, actief')
    .eq('user_id', user.id)
    .eq('actief', true)

  const actieveOefeningIds = (oefeningen ?? []).map((o: { id: string }) => o.id)

  return <BibliotheekClient actieveOefeningIds={actieveOefeningIds} />
}

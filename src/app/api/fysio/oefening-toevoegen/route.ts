import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const body = await req.json()
  const { naam, categorie, sets, reps, duur_seconden, beschrijving } = body

  if (!naam || !categorie) {
    return NextResponse.json({ error: 'Naam en categorie zijn verplicht' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('physio_exercises')
    .insert({
      user_id: user.id,
      naam,
      categorie,
      sets: sets ?? null,
      reps: reps ?? null,
      duur_seconden: duur_seconden ?? null,
      beschrijving: beschrijving ?? null,
      actief: true,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ id: data.id })
}

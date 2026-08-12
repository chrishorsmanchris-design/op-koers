import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Maakt of vervangt de persoonlijke sleutel waarmee de iOS Shortcut mag posten.
 *
 * Rotatie is hier hetzelfde als intrekken: er is maar één sleutel per gebruiker,
 * dus zodra je een nieuwe maakt kan de oude niets meer. Dat is precies wat je
 * wilt als je vermoedt dat hij ergens rondslingert.
 */

function nieuweSleutel(): string {
  // 32 willekeurige bytes uit de crypto-RNG. Niet Math.random(): die is
  // voorspelbaar en dus ongeschikt voor iets dat als wachtwoord dienstdoet.
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const token = nieuweSleutel()
  const { error } = await supabase
    .from('profiles')
    .update({ health_token: token } as never)
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: `Sleutel opslaan mislukt: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ token })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { error } = await supabase
    .from('profiles')
    .update({ health_token: null } as never)
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: `Intrekken mislukt: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

const claude = new Anthropic()

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const vandaag = new Date().toISOString().split('T')[0]
  const veertienDagenGeleden = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]

  const [{ data: profiel }, { data: doel }, { data: vandaagSessies }, { data: recenteSessies }] = await Promise.all([
    supabase.from('profiles').select('naam, wil_core, fysio_per_week').eq('id', user.id).single(),
    supabase.from('goals').select('naam, datum, tijdsdoel').eq('user_id', user.id).eq('actief', true).single(),
    supabase.from('training_sessions').select('type, beschrijving, duur_minuten, afstand_km, intensiteit').eq('user_id', user.id).eq('datum', vandaag).eq('voltooid', false).eq('overgeslagen', false),
    supabase.from('training_sessions').select('datum, type, voltooid, overgeslagen, afstand_km, duur_minuten').eq('user_id', user.id).gte('datum', veertienDagenGeleden).lte('datum', vandaag).order('datum', { ascending: false }),
  ])

  const naam = profiel?.naam?.split(' ')[0] ?? 'Atleet'
  const voltooid = recenteSessies?.filter(s => s.voltooid) ?? []
  const overgeslagen = recenteSessies?.filter(s => s.overgeslagen) ?? []
  const kmDezeWeek = voltooid.filter(s => s.datum >= getMaandag(vandaag)).reduce((sum, s) => sum + (s.afstand_km ?? 0), 0)
  const dagenTotDoel = doel ? Math.ceil((new Date(doel.datum).getTime() - Date.now()) / 86400000) : null

  const vandaagTraining = vandaagSessies?.find(s => ['hardlopen', 'krachttraining', 'cross'].includes(s.type))

  const context = [
    `Naam: ${naam}`,
    doel ? `Doel: ${doel.naam} over ${dagenTotDoel} dagen (tijdsdoel: ${doel.tijdsdoel ?? 'finishen'})` : '',
    `Laatste 14 dagen: ${voltooid.length} voltooid, ${overgeslagen.length} overgeslagen`,
    `Km deze week: ${kmDezeWeek.toFixed(1)}km`,
    vandaagTraining ? `Vandaag gepland: ${vandaagTraining.beschrijving} (${vandaagTraining.duur_minuten}min${vandaagTraining.afstand_km ? `, ${vandaagTraining.afstand_km}km` : ''})` : 'Geen looptraining vandaag',
    profiel?.wil_core ? 'Doet core stability' : '',
  ].filter(Boolean).join('\n')

  try {
    const response = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      messages: [{
        role: 'user',
        content: `Je bent een persoonlijke atletiekcoach. Schrijf een kort, persoonlijk bericht (2-3 zinnen, max 150 tekens) aan je atleet voor vandaag. Wees motiverend maar realistisch. Refereer aan de werkelijke data. Geen generieke teksten. Taal: Nederlands. Geen emoji tenzij het echt past.

Atleetinfo:
${context}

Geef ALLEEN het bericht terug, geen aanhalingstekens of uitleg.`
      }]
    })

    const bericht = response.content[0].type === 'text' ? response.content[0].text.trim() : null
    return NextResponse.json({ bericht, datum: vandaag })
  } catch {
    return NextResponse.json({ bericht: null })
  }
}

function getMaandag(datum: string): string {
  const d = new Date(datum + 'T12:00:00')
  const dag = d.getDay()
  d.setDate(d.getDate() - (dag === 0 ? 6 : dag - 1))
  return d.toISOString().split('T')[0]
}

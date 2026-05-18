import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const claude = new Anthropic()

const RATING_AANPASSING = {
  te_zwaar: -0.2,
  zwaar: -0.1,
  goed: 0,
  beter_dan_verwacht: 0.05,
  topdag: 0.1,
}

export async function POST(req: NextRequest) {
  const { sessie_id, rating } = await req.json()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const vandaag = new Date().toISOString().split('T')[0]
  const factor = RATING_AANPASSING[rating as keyof typeof RATING_AANPASSING] ?? 0

  // Haal de voltooide sessie op voor context
  const { data: voltooidesSessie } = await supabase
    .from('training_sessions')
    .select('beschrijving, duur_minuten, afstand_km, intensiteit, type')
    .eq('id', sessie_id)
    .single()

  // Haal komende sessies op
  const { data: komendeSessies } = await supabase
    .from('training_sessions')
    .select('id, datum, beschrijving, duur_minuten, afstand_km, intensiteit, type')
    .eq('user_id', user.id)
    .gt('datum', vandaag)
    .eq('voltooid', false)
    .eq('type', 'hardlopen') // alleen loopsessies aanpassen
    .order('datum', { ascending: true })
    .limit(10)

  if (!komendeSessies || komendeSessies.length === 0 || factor === 0) {
    return NextResponse.json({ aangepast: false })
  }

  // Haal recente feedback op voor patroonherkenning
  const { data: recenteFeedback } = await supabase
    .from('session_feedback')
    .select('rating, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const feedbackHistorie = recenteFeedback?.map(f => f.rating).join(', ') ?? ''

  const aantalAanpassen = rating === 'te_zwaar' ? 5 : rating === 'topdag' ? 3 : 2

  const prompt = `Je bent een atletiekcoach. Pas het trainingsschema aan op basis van feedback.

VOLTOOIDE SESSIE: ${voltooidesSessie?.beschrijving ?? ''} (${voltooidesSessie?.duur_minuten}min, ${voltooidesSessie?.afstand_km}km, ${voltooidesSessie?.intensiteit})
FEEDBACK: "${rating}"
RECENTE FEEDBACK HISTORIE: ${feedbackHistorie || 'geen'}

REGELS:
${rating === 'te_zwaar' ? `- Atleet is overbelast. Verlaag de komende ${aantalAanpassen} sessies: minder km, lagere intensiteit, kortere duur.` : ''}
${rating === 'zwaar' ? `- Training was pittig. Verlaag de komende ${aantalAanpassen} sessies licht.` : ''}
${rating === 'beter_dan_verwacht' || rating === 'topdag' ? `- Atleet presteert goed. Verhoog de komende ${aantalAanpassen} sessies licht: iets meer km of hogere intensiteit.` : ''}
- Bewaar de globale structuur van het schema.
- Verander ALLEEN de sessies die aanpassing nodig hebben.
- Beschrijving max 55 tekens.

KOMENDE SESSIES (pas maximaal ${aantalAanpassen} aan):
${komendeSessies.slice(0, aantalAanpassen + 2).map(s =>
  `{"id":"${s.id}","datum":"${s.datum}","beschrijving":"${s.beschrijving}","duur_minuten":${s.duur_minuten},"afstand_km":${s.afstand_km},"intensiteit":"${s.intensiteit}"}`
).join('\n')}

Geef ALLEEN geldige JSON terug:
{"aanpassingen":[{"id":"<exact id uit bovenstaande lijst>","duur_minuten":40,"afstand_km":7.0,"intensiteit":"makkelijk","beschrijving":"..."}],"uitleg":"Korte uitleg"}`

  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: 'Je bent een atletiekcoach. Geef altijd geldige JSON terug.',
    messages: [{ role: 'user', content: prompt }],
  })

  const tekst = response.content[0].type === 'text' ? response.content[0].text : '{}'

  let aanpassingen
  try {
    const match = tekst.match(/\{[\s\S]*\}/)
    aanpassingen = JSON.parse(match?.[0] ?? '{}')
  } catch {
    return NextResponse.json({ aangepast: false })
  }

  // Aanpassingen doorvoeren
  for (const aanpassing of aanpassingen.aanpassingen ?? []) {
    await supabase
      .from('training_sessions')
      .update({
        duur_minuten: aanpassing.duur_minuten,
        afstand_km: aanpassing.afstand_km,
        beschrijving: aanpassing.beschrijving,
      } as never)
      .eq('id', aanpassing.id)
      .eq('user_id', user.id)
  }

  return NextResponse.json({ aangepast: true, uitleg: aanpassingen.uitleg })
}

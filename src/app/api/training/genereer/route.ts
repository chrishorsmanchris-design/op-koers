import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 300

const claude = new Anthropic()

const DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const [
      { data: profiel },
      { data: doel },
      { data: vakanties },
      { data: resultaten },
      { data: activiteiten },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('goals').select('*').eq('user_id', user.id).eq('actief', true).single(),
      supabase.from('vacations').select('*').eq('user_id', user.id),
      supabase.from('previous_results').select('*').eq('user_id', user.id),
      supabase.from('recurring_activities').select('*').eq('user_id', user.id),
    ])

    if (!doel) return NextResponse.json({ error: 'Geen actief doel gevonden' }, { status: 400 })

    const vandaag = new Date().toISOString().split('T')[0]
    const wekenTotDoel = Math.min(
      Math.ceil((new Date(doel.datum).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 7)),
      30
    )

    const activiteitenTekst = activiteiten && activiteiten.length > 0
      ? activiteiten.map(a => {
          const blok = [a.blokkeert_hardlopen && 'hardlopen', a.blokkeert_fysio && 'fysio'].filter(Boolean).join(' en ')
          return `- ${a.naam}: elke ${DAGEN[a.dag_van_week]}${a.tijdstip ? ` (${a.tijdstip})` : ''} — blokkeert: ${blok}`
        }).join('\n')
      : 'Geen'

    const prompt = `Je bent een ervaren atletiekcoach. Maak een persoonlijk trainingsschema gebaseerd op Hal Higdon/Jack Daniels methoden.

PROFIEL:
- Niveau: ${profiel?.km_per_week ?? '?'} km/week, ${profiel?.runs_per_week ?? '?'} runs/week
- Doel: ${doel.naam} (${doel.type}) op ${doel.datum}
- Tijdsdoel: ${doel.tijdsdoel ?? 'niet bepaald'}
- Weken: ${wekenTotDoel}
- Eerdere resultaten: ${resultaten?.map(r => `${r.type}: ${r.tijd}`).join(', ') || 'geen'}
- Herstellend van kuitblessure — start conservatief

VAKANTIES:
${vakanties?.map(v => `- ${v.naam}: ${v.start_datum} t/m ${v.eind_datum} (trainen: ${v.kan_trainen})`).join('\n') || 'Geen'}

VASTE ACTIVITEITEN (plan GEEN hardlopen op deze dagen):
${activiteitenTekst}

Genereer het schema als JSON. Alleen hardloopsessies en rustdagen (max 4-5 sessies/week). Geen hardlopen op geblokkeerde dagen.

{"sessies":[{"datum":"YYYY-MM-DD","type":"hardlopen|rust|krachttraining|cross","beschrijving":"...","duur_minuten":45,"afstand_km":8.0,"intensiteit":"herstel|makkelijk|gemiddeld|zwaar|interval","week_nummer":1,"volgorde":1}],"uitleg":"..."}`

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: 'Geef alleen geldige JSON terug. Geen markdown, geen uitleg buiten de JSON.',
      messages: [{ role: 'user', content: prompt }],
    })

    const tekst = response.content[0].type === 'text' ? response.content[0].text : ''

    let schema
    try {
      schema = JSON.parse(tekst)
    } catch {
      const jsonMatch = tekst.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try { schema = JSON.parse(jsonMatch[0]) } catch { /* fall through */ }
      }
      if (!schema) return NextResponse.json({ error: 'Schema kon niet worden geparsed', tekst }, { status: 500 })
    }

    if (!schema.sessies || !Array.isArray(schema.sessies)) {
      return NextResponse.json({ error: 'Geen sessies in schema', schema }, { status: 500 })
    }

    // Verwijder bestaande toekomstige sessies voor dit doel
    await supabase.from('training_sessions')
      .delete()
      .eq('user_id', user.id)
      .eq('goal_id', doel.id)
      .gte('datum', vandaag)

    const sessiesOmOpslaan = schema.sessies
      .filter((s: { datum: string }) => s.datum >= vandaag)
      .map((s: Record<string, unknown>) => ({ ...s, user_id: user.id, goal_id: doel.id }))

    const { error: insertError } = await supabase.from('training_sessions').insert(sessiesOmOpslaan)
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    return NextResponse.json({ uitleg: schema.uitleg, aantalSessies: sessiesOmOpslaan.length })
  } catch (e) {
    console.error('Genereer fout:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

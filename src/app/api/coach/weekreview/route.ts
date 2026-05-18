import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

const claude = new Anthropic()

function getMaandag(datum: string): string {
  const d = new Date(datum + 'T12:00:00')
  const dag = d.getDay()
  d.setDate(d.getDate() - (dag === 0 ? 6 : dag - 1))
  return d.toISOString().split('T')[0]
}

function getVorigeMaandag(datum: string): string {
  const d = new Date(getMaandag(datum) + 'T12:00:00')
  d.setDate(d.getDate() - 7)
  return d.toISOString().split('T')[0]
}

function getVorigZondag(datum: string): string {
  const d = new Date(getMaandag(datum) + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

export async function GET() {
  // Only generate on Mondays
  const vandaag = new Date()
  if (vandaag.getDay() !== 1) {
    return NextResponse.json({ weekreview: null })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const vandaagStr = vandaag.toISOString().split('T')[0]
  const vorigeMaandag = getVorigeMaandag(vandaagStr)
  const vorigZondag = getVorigZondag(vandaagStr)

  const [{ data: sessies }, { data: fysioSessies }, { data: coreSessies }] = await Promise.all([
    supabase
      .from('training_sessions')
      .select('datum, type, voltooid, overgeslagen, afstand_km, duur_minuten, intensiteit')
      .eq('user_id', user.id)
      .gte('datum', vorigeMaandag)
      .lte('datum', vorigZondag)
      .order('datum', { ascending: true }),
    supabase
      .from('physio_sessions')
      .select('datum')
      .eq('user_id', user.id)
      .gte('datum', vorigeMaandag)
      .lte('datum', vorigZondag),
    supabase
      .from('training_sessions')
      .select('datum, voltooid')
      .eq('user_id', user.id)
      .eq('type', 'core')
      .gte('datum', vorigeMaandag)
      .lte('datum', vorigZondag),
  ])

  const voltooid = (sessies ?? []).filter(s => s.voltooid)
  const overgeslagen = (sessies ?? []).filter(s => (s as { overgeslagen?: boolean }).overgeslagen)
  const kmTotaal = voltooid.reduce((sum, s) => sum + (s.afstand_km ?? 0), 0)
  const fysioCount = fysioSessies?.length ?? 0
  const coreCount = (coreSessies ?? []).filter(s => s.voltooid).length

  // Calculate average pace if possible
  const loopSessies = voltooid.filter(s => s.type === 'hardlopen' && s.afstand_km && s.duur_minuten)
  const gemPace =
    loopSessies.length > 0
      ? loopSessies.reduce((sum, s) => sum + (s.duur_minuten ?? 0) / (s.afstand_km ?? 1), 0) /
        loopSessies.length
      : null

  const paceStr = gemPace
    ? `${Math.floor(gemPace)}:${String(Math.round((gemPace % 1) * 60)).padStart(2, '0')} min/km`
    : null

  const context = [
    `Week: ${vorigeMaandag} t/m ${vorigZondag}`,
    `Trainingen voltooid: ${voltooid.length}`,
    `Trainingen overgeslagen: ${overgeslagen.length}`,
    `Totale km gelopen: ${kmTotaal.toFixed(1)} km`,
    paceStr ? `Gemiddeld tempo: ${paceStr}` : '',
    `Fysio sessies: ${fysioCount}`,
    `Core sessies: ${coreCount}`,
    voltooid.length > 0
      ? `Sessies: ${voltooid.map(s => `${s.type}${s.afstand_km ? ` ${s.afstand_km}km` : ''}`).join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  const message = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system:
      'Je bent een atletiekcoach. Schrijf een wekelijkse review (3-4 zinnen). Bespreek: wat ging goed, aandachtspunt, motivatie voor komende week. Taal: Nederlands.',
    messages: [
      {
        role: 'user',
        content: `Schrijf een weekreview op basis van deze trainingsdata:\n${context}`,
      },
    ],
  })

  const weekreview =
    message.content[0].type === 'text' ? message.content[0].text : null

  return NextResponse.json({ weekreview })
}

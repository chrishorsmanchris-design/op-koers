import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { planWeek, getMaandag, type Vakantie } from '@/lib/schema-planning'
import { PDF_PLAN } from '@/lib/pdf-plan'

export const maxDuration = 120

// ─── Hoofdroute ───────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    // Haal alle benodigde data op
    const [
      { data: doel },
      { data: profiel },
      { data: vakanties },
      { data: activiteiten },
    ] = await Promise.all([
      supabase.from('goals').select('*').eq('user_id', user.id).eq('actief', true).single(),
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('vacations').select('*').eq('user_id', user.id),
      supabase.from('recurring_activities').select('*').eq('user_id', user.id).eq('blokkeert_hardlopen', true),
    ])

    if (!doel) return NextResponse.json({ error: 'Geen actief doel gevonden' }, { status: 400 })

    // Permanent geblokkeerde dagen (hockey etc.)
    const geblokkeerd = new Set<number>(activiteiten?.map(a => a.dag_van_week) ?? [])

    // Beschikbare dagen: uren > 0 in beschikbaarheid EN niet geblokkeerd
    const dagSleutels = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
    const beschikbaarheidMap = (profiel as Record<string, unknown>)?.beschikbaarheid as Record<string, number> | null
      ?? { ma: 2, di: 0, wo: 2, do: 3, vr: 2, za: 3, zo: 0 }
    const beschikbaar = [0, 1, 2, 3, 4, 5, 6].filter(d =>
      !geblokkeerd.has(d) && (beschikbaarheidMap[dagSleutels[d]] ?? 0) > 0
    )

    // Vakanties als simpele array
    const vakantieArray: Vakantie[] = (vakanties ?? []).map(v => ({
      start_datum: v.start_datum,
      eind_datum: v.eind_datum,
      kan_trainen: v.kan_trainen,
    }))

    // Datumberekeningen
    const vandaag = new Date()
    const marathonDatum = new Date(doel.datum)

    // Fase 2 start: PDF week 1 maandag = marathonDatum - 97 dagen, afgerond naar maandag
    const fase2Start = getMaandag(new Date(marathonDatum.getTime() - 97 * 86400000))

    // Fase 1 start: huidige maandag (niet de volgende, anders mist de huidige week)
    const fase1Start = getMaandag(vandaag)

    // Aantal pre-plan weken (fase 1)
    const prePlanWeken = Math.max(0, Math.round((fase2Start.getTime() - fase1Start.getTime()) / (7 * 86400000)))

    // Verwijder alleen niet-voltooide toekomstige sessies — bewaar trainingshistorie
    const vandaagStr = new Date().toISOString().split('T')[0]
    await supabase.from('training_sessions').delete()
      .eq('user_id', user.id)
      .eq('voltooid', false)
      .gte('datum', vandaagStr)

    const alleSessies: object[] = []
    let volgorde = 1

    // ── Fase 1: opbouwfase op basis van PDF week 1 (niet AI) ────────────────
    // Gebruik PDF week 1 als template zodat de methodiek consistent blijft met het plan.
    // Schaal het volume licht terug voor de eerste weken (85% → 92% → 100%).
    if (prePlanWeken > 0) {
      const schaalFactoren = [0.75, 0.85, 0.90, 0.95, 1.0]  // max 5 pre-plan weken

      for (let i = 0; i < prePlanWeken; i++) {
        const weekNr = i + 1
        const weekMaandag = new Date(fase1Start)
        weekMaandag.setDate(weekMaandag.getDate() + i * 7)
        const schaal = schaalFactoren[Math.min(i, schaalFactoren.length - 1)]

        // Gebruik PDF week 1 als basis, schaal duur en afstand
        const pdfWeek1 = PDF_PLAN[0].map(s => ({
          ...s,
          duur_minuten: s.duur_minuten ? Math.round(s.duur_minuten * schaal) : null,
          afstand_km: s.afstand_km ? Math.round(s.afstand_km * schaal * 10) / 10 : null,
        }))

        const gepland = planWeek(pdfWeek1, weekMaandag, geblokkeerd, vakantieArray, weekNr, volgorde)
        volgorde += gepland.length

        for (const s of gepland) {
          alleSessies.push({
            user_id: user.id,
            goal_id: doel.id,
            datum: s.datum,
            type: s.type,
            beschrijving: s.duur_minuten
              ? `${s.beschrijving} (opbouw ${Math.round(schaal * 100)}%)`
              : s.beschrijving,
            duur_minuten: s.duur_minuten,
            afstand_km: s.afstand_km,
            intensiteit: s.intensiteit,
            voltooid: false,
            overgeslagen: false,
            volgorde: s.volgorde,
            week_nummer: s.week_nummer,
          })
        }
      }
    }

    // ── Fase 2: PDF-schema met constraint-aware scheduling ───────────────────
    for (let i = 0; i < PDF_PLAN.length; i++) {
      const weekNr = prePlanWeken + i + 1
      const weekMaandag = new Date(fase2Start)
      weekMaandag.setDate(weekMaandag.getDate() + i * 7)

      const gepland = planWeek(PDF_PLAN[i], weekMaandag, geblokkeerd, vakantieArray, weekNr, volgorde)
      volgorde += gepland.length

      for (const s of gepland) {
        alleSessies.push({
          user_id: user.id,
          goal_id: doel.id,
          datum: s.datum,
          type: s.type,
          beschrijving: s.beschrijving,
          duur_minuten: s.duur_minuten,
          afstand_km: s.afstand_km,
          intensiteit: s.intensiteit,
          voltooid: false,
          overgeslagen: false,
          volgorde: s.volgorde,
          week_nummer: s.week_nummer,
        })
      }
    }

    // ── Core & Fysio sessies toevoegen ───────────────────────────────────────
    const wilCore = (profiel as Record<string, unknown>)?.wil_core as boolean ?? false
    const corePerWeek = (profiel as Record<string, unknown>)?.core_per_week as number ?? 2
    const fysioPerWeek = (profiel as Record<string, unknown>)?.fysio_per_week as number ?? 3

    // Groepeer ingeplande sessies per (datum) voor makkelijk opzoeken
    const datumNaarSessies = new Map<string, typeof alleSessies>()
    for (const s of alleSessies) {
      const datum = (s as Record<string, unknown>).datum as string
      if (!datumNaarSessies.has(datum)) datumNaarSessies.set(datum, [])
      datumNaarSessies.get(datum)!.push(s)
    }

    // Voor elke week: voeg core/fysio toe volgens de juiste regels:
    // - Fysio: uitsluitend op rustdagen (nooit samen met een duurloop of interval)
    // - Core: voorkeur rustdagen (krachtoefeningen); als er geen zijn: herstelloopdagen (nooit op duurloop/interval)
    const totaalWeken = prePlanWeken + 14
    for (let w = 0; w < totaalWeken; w++) {
      const weekNr = w + 1
      const weekMaandag = w < prePlanWeken
        ? new Date(fase1Start.getTime() + w * 7 * 86400000)
        : new Date(fase2Start.getTime() + (w - prePlanWeken) * 7 * 86400000)

      const rustDagen: string[] = []        // geen hardlopen → geschikt voor fysio én core
      const herstelloopDagen: string[] = [] // alleen herstel-intensiteit → geschikt voor core

      for (let d = 0; d < 7; d++) {
        const datum = new Date(weekMaandag)
        datum.setDate(datum.getDate() + d)
        const datumStr = datum.toISOString().split('T')[0]
        const sessiesOpDag = (datumNaarSessies.get(datumStr) ?? []) as Record<string, unknown>[]
        const loopSessies = sessiesOpDag.filter(s => s.type === 'hardlopen')

        if (loopSessies.length === 0) {
          // Rustdag of lege dag — ideaal voor fysio en core
          rustDagen.push(datumStr)
        } else if (loopSessies.every(s => s.intensiteit === 'herstel')) {
          // Uitsluitend herstelloop — acceptabel voor core, niet voor fysio
          herstelloopDagen.push(datumStr)
        }
        // Duurloop/gemiddeld/zwaar/interval → fysio én core worden hier nooit gepland
      }

      // Fysio: alleen op rustdagen
      if (fysioPerWeek > 0) {
        for (let i = 0; i < Math.min(fysioPerWeek, rustDagen.length); i++) {
          alleSessies.push({
            user_id: user.id, goal_id: doel.id,
            datum: rustDagen[i],
            type: 'core', intensiteit: 'herstel',
            beschrijving: 'Fysio oefeningen – 15-20 min',
            duur_minuten: 20, afstand_km: null,
            voltooid: false, overgeslagen: false,
            volgorde: volgorde++, week_nummer: weekNr,
          })
        }
      }

      // Core: voorkeur rustdagen, daarna herstelloopdagen
      if (wilCore && corePerWeek > 0) {
        const coreDagen = rustDagen.length > 0 ? rustDagen : herstelloopDagen
        for (let i = 0; i < Math.min(corePerWeek, coreDagen.length); i++) {
          alleSessies.push({
            user_id: user.id, goal_id: doel.id,
            datum: coreDagen[i],
            type: 'core', intensiteit: 'herstel',
            beschrijving: 'Core stability – 20-30 min',
            duur_minuten: 25, afstand_km: null,
            voltooid: false, overgeslagen: false,
            volgorde: volgorde++, week_nummer: weekNr,
          })
        }
      }
    }

    // Invoegen in batches
    for (let i = 0; i < alleSessies.length; i += 100) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('training_sessions').insert(alleSessies.slice(i, i + 100) as any)
      if (error) return NextResponse.json({ error: `Invoegfout: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      aantalSessies: alleSessies.length,
      fase1Weken: prePlanWeken,
      fase2Weken: 14,
      startDatum: fase1Start.toISOString().split('T')[0],
      marathonDatum: doel.datum,
      bericht: prePlanWeken > 0
        ? `${alleSessies.length} sessies aangemaakt: ${prePlanWeken} weken opbouwfase + 14 weken PDF-schema (${fase1Start.toISOString().split('T')[0]} t/m ${doel.datum})`
        : `${alleSessies.length} sessies aangemaakt: 14 weken PDF-schema (${fase2Start.toISOString().split('T')[0]} t/m ${doel.datum})`,
    })

  } catch (err) {
    console.error('Import-volledig fout:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── Schema scheduling utilities ─────────────────────────────────────────────
// Verdeelt sessies over beschikbare dagen rekening houdend met:
//   - Permanent geblokkeerde dagen (bijv. hockey op di/zo)
//   - Vakantiedagen (nee = geblokkeerd, beperkt = alleen lichte sessies)
//   - Prioriteit: interval > gemiddeld > makkelijk > herstel

export type PlanSessie = {
  dag: number // 0=ma … 6=zo (voorkeur)
  type: 'hardlopen' | 'rust' | 'cross'
  intensiteit: 'herstel' | 'makkelijk' | 'gemiddeld' | 'zwaar' | 'interval'
  beschrijving: string
  duur_minuten: number | null
  afstand_km: number | null
}

export type Vakantie = {
  start_datum: string
  eind_datum: string
  kan_trainen: 'ja' | 'nee' | 'beperkt'
}

export type GeplandeSessie = PlanSessie & {
  datum: string
  week_nummer: number
  volgorde: number
}

// Lager getal = hogere prioriteit (krijgt eerst een vrije dag)
function prioriteit(intensiteit: string, type: string): number {
  if (type === 'rust') return 10
  switch (intensiteit) {
    case 'interval': return 1
    case 'zwaar':    return 2
    case 'gemiddeld': return 3
    case 'makkelijk': return 4
    case 'herstel':   return 5
    default:          return 6
  }
}

function dagDatum(weekMaandag: Date, offset: number): string {
  const d = new Date(weekMaandag)
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

type DagStatus = 'vrij' | 'beperkt' | 'geblokkeerd'

function dagStatussen(
  weekMaandag: Date,
  permanentGeblokkeerd: Set<number>,
  vakanties: Vakantie[]
): Map<number, DagStatus> {
  const map = new Map<number, DagStatus>()
  for (let dag = 0; dag < 7; dag++) {
    if (permanentGeblokkeerd.has(dag)) { map.set(dag, 'geblokkeerd'); continue }
    const datum = dagDatum(weekMaandag, dag)
    let status: DagStatus = 'vrij'
    for (const v of vakanties) {
      if (datum >= v.start_datum && datum <= v.eind_datum) {
        if (v.kan_trainen === 'nee') { status = 'geblokkeerd'; break }
        if (v.kan_trainen === 'beperkt' && status === 'vrij') status = 'beperkt'
      }
    }
    map.set(dag, status)
  }
  return map
}

/**
 * Plant een weektemplate in op beschikbare dagen.
 * Interval/zware sessies hebben hoogste prioriteit en worden nooit op beperkte dagen gezet.
 * Sessies die nergens passen worden stilletjes weggelaten.
 */
export function planWeek(
  template: PlanSessie[],
  weekMaandag: Date,
  permanentGeblokkeerd: Set<number>,
  vakanties: Vakantie[],
  weekNr: number,
  volgordeStart: number
): GeplandeSessie[] {
  const statussen = dagStatussen(weekMaandag, permanentGeblokkeerd, vakanties)
  const vrijeDagen = [0, 1, 2, 3, 4, 5, 6].filter(d => statussen.get(d) !== 'geblokkeerd')
  const beperkteDagen = new Set(vrijeDagen.filter(d => statussen.get(d) === 'beperkt'))

  // Sorteer: rust apart, actieve sessies op prioriteit
  const actief = template
    .filter(s => s.type !== 'rust')
    .sort((a, b) => prioriteit(a.intensiteit, a.type) - prioriteit(b.intensiteit, b.type))

  const gebruikt = new Set<number>()
  const resultaat: GeplandeSessie[] = []
  let teller = volgordeStart

  for (const sessie of actief) {
    const isZwaar = ['interval', 'zwaar', 'gemiddeld'].includes(sessie.intensiteit)

    // Kandidaten: vrije, nog niet gebruikte dagen
    let kandidaten = vrijeDagen.filter(d => !gebruikt.has(d))

    // Zware sessies mogen niet op beperkte (vakantie) dagen als er alternatieven zijn
    if (isZwaar) {
      const zwaar = kandidaten.filter(d => !beperkteDagen.has(d))
      if (zwaar.length > 0) kandidaten = zwaar
    }

    if (kandidaten.length === 0) continue // Week te vol of alles geblokkeerd

    // Voorkeur: eigen dag, anders dichtstbijzijnde vrije dag
    const dag = kandidaten.includes(sessie.dag)
      ? sessie.dag
      : kandidaten.sort((a, b) => Math.abs(a - sessie.dag) - Math.abs(b - sessie.dag))[0]

    gebruikt.add(dag)
    resultaat.push({ ...sessie, dag, datum: dagDatum(weekMaandag, dag), week_nummer: weekNr, volgorde: teller++ })
  }

  // Rustdagen voor overgebleven vrije dagen
  for (const dag of vrijeDagen.filter(d => !gebruikt.has(d))) {
    resultaat.push({
      dag, type: 'rust', intensiteit: 'herstel',
      beschrijving: 'Rust – geen training',
      duur_minuten: null, afstand_km: null,
      datum: dagDatum(weekMaandag, dag),
      week_nummer: weekNr, volgorde: teller++,
    })
  }

  return resultaat.sort((a, b) => a.dag - b.dag)
}

/** Geeft de maandag terug van de week die een datum bevat */
export function getMaandag(datum: Date): Date {
  const d = new Date(datum)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay() // 0=zo
  d.setDate(d.getDate() + (dow === 0 ? 1 : 1 - dow))
  return d
}

/** Volgende maandag vanaf vandaag (of maandag van de huidige week als dat vandaag is) */
export function volgendeMaandag(vandaag: Date): Date {
  const d = new Date(vandaag)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  // Als vandaag maandag → start deze week, anders → volgende maandag
  const diff = dow === 1 ? 0 : (8 - dow) % 7 || 7
  d.setDate(d.getDate() + diff)
  return d
}

import { DashboardClient } from '@/app/(app)/dashboard/DashboardClient'

const vandaag = new Date().toISOString().split('T')[0]
const weekStart = (() => {
  const d = new Date()
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return d.toISOString().split('T')[0]
})()

const d = (offset: number) => {
  const date = new Date(weekStart + 'T12:00:00')
  date.setDate(date.getDate() + offset)
  return date.toISOString().split('T')[0]
}

const mockSessies = [
  { id: '1', datum: d(0), type: 'hardlopen', intensiteit: 'makkelijk', beschrijving: 'Duurloop rustig tempo', duur_minuten: 50, afstand_km: 8, voltooid: true, overgeslagen: false, week_nummer: 8, session_feedback: [], user_id: 'x', created_at: '', goal_id: null },
  { id: '2', datum: vandaag, type: 'hardlopen', intensiteit: 'interval', beschrijving: 'Intervaltraining 8×800m op 10K-tempo', duur_minuten: 65, afstand_km: 12, voltooid: false, overgeslagen: false, week_nummer: 8, session_feedback: [], user_id: 'x', created_at: '', goal_id: null },
  { id: '3', datum: d(3), type: 'hardlopen', intensiteit: 'gemiddeld', beschrijving: 'Tempoduurloop 6 km', duur_minuten: 35, afstand_km: 6, voltooid: false, overgeslagen: false, week_nummer: 8, session_feedback: [], user_id: 'x', created_at: '', goal_id: null },
  { id: '4', datum: d(5), type: 'hardlopen', intensiteit: 'zwaar', beschrijving: 'Lange duurloop 18 km', duur_minuten: 105, afstand_km: 18, voltooid: false, overgeslagen: false, week_nummer: 8, session_feedback: [], user_id: 'x', created_at: '', goal_id: null },
]

const mockDoel = {
  id: 'goal-1', naam: 'TCS Amsterdam Marathon', type: 'marathon' as const,
  datum: '2026-10-18', tijdsdoel: '3:15:00', actief: true, user_id: 'x', created_at: '',
}

const mockProfiel = {
  id: 'x', naam: 'Christiaan', email: '', km_per_week: 40, runs_per_week: 4,
  wil_core: true, core_per_week: 2, fysio_per_week: 3, wil_cross: false,
  max_hartslag: 185, strava_refresh_token: null, strava_athlete_id: null,
  strava_athlete_naam: null, runkeeper_token: null, push_subscription: null,
  physio_klacht: null, geboortedatum: null, created_at: '', updated_at: '',
}

export default function PreviewPage() {
  return (
    <div className="max-w-sm mx-auto min-h-screen bg-[#faf8f5]">
      <DashboardClient
        profiel={mockProfiel as never}
        sessies={mockSessies as never}
        alleSessies={mockSessies.map(s => ({ datum: s.datum, voltooid: s.voltooid, overgeslagen: s.overgeslagen }))}
        fysioOefeningen={[{ id: 'f1', naam: 'Heupflexor stretch', actief: true } as never]}
        fysioSessies={[]}
        doel={mockDoel as never}
        vandaag={vandaag}
        weekStart={weekStart}
        activiteiten={[]}
      />
    </div>
  )
}

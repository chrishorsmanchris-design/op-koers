'use client'
import { ArrowLeft, Timer, MapPin, Heart } from 'lucide-react'
import { formatDuur } from '@/lib/utils'
import { parseWorkout } from '@/lib/workout-parser'
import { hartslagBereik, maximaleHartslag, zonesInTekst, type TempoZone } from '@/lib/tempo-zones'

interface Props {
  beschrijving: string
  duur_minuten: number | null
  afstand_km: number | null
  intensiteit?: string | null
  zones?: TempoZone[]
  /** Nodig om zones naar slagen per minuut te vertalen; zonder dit blijft het tempo. */
  maxHartslag?: number | null
  onSluiten: () => void
}

function ZoneBadge({ zone, maxHartslag }: { zone: TempoZone; maxHartslag?: number | null }) {
  const hr = hartslagBereik(zone, maxHartslag)
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#f97316]/10 text-[#f97316]">
      {zone.label} · {zone.pace}/km
      {hr && <span className="text-[#f97316]/70"> · {hr.min}–{hr.max} bpm</span>}
    </span>
  )
}

export function WorkoutModal({
  beschrijving, duur_minuten, afstand_km, intensiteit, zones, maxHartslag, onSluiten,
}: Props) {
  const workout = parseWorkout(beschrijving, duur_minuten, zones)

  // De zwaarste zone die in de beschrijving genoemd wordt bepaalt het plafond.
  // Uit de hele tekst en niet per blok: het gaat om één getal waar je de hele
  // sessie onder blijft, en dat is de bovenkant van het zwaarste stuk.
  const zonesInSessie = zonesInTekst(beschrijving, zones)
  const plafond = maximaleHartslag(zonesInSessie, maxHartslag)
  const zwaarste = zonesInSessie.length
    ? zonesInSessie.reduce((a, b) => (b.hrMax > a.hrMax ? b : a))
    : null

  // Schermvullend scherm i.p.v. bottom sheet: geen dvh/scroll-lock-trucs nodig,
  // want `inset-0` sizeert zichzelf al op de viewport en er is geen achterliggende
  // pagina die kan "meelekken" — dit scherm scrolt gewoon als een normale pagina.
  return (
    <div className="fixed inset-0 z-[60] bg-[#111118] flex flex-col">
      <div
        className="flex items-center gap-3 px-4 pb-3 shrink-0 border-b border-[#2d2d3e]"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <button onClick={onSluiten} className="p-1.5 -ml-1.5 text-white" aria-label="Terug">
          <ArrowLeft size={22} />
        </button>
        <p className="text-xs font-semibold text-[#f97316] uppercase tracking-wide">{workout.soort}</p>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-4"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <h3 className="font-bold text-white text-xl leading-snug mb-3">{beschrijving}</h3>

        <div className="flex items-center gap-4 mb-5 text-sm text-[#8888a8]">
          {duur_minuten != null && (
            <span className="flex items-center gap-1"><Timer size={13} />{formatDuur(duur_minuten)}</span>
          )}
          {afstand_km != null && afstand_km > 0 && (
            <span className="flex items-center gap-1"><MapPin size={13} />{afstand_km} km</span>
          )}
          {intensiteit && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#222230] font-semibold uppercase">
              {intensiteit}
            </span>
          )}
        </div>

        {/* Het antwoord op "hoe hard mag ik maximaal" hoort bovenaan te staan en
            niet weggestopt in een badge bij een blok. */}
        {zwaarste && (
          <div className="rounded-2xl bg-[#222230] border border-[#2d2d3e] p-3.5 mb-5">
            <div className="flex items-center gap-2 mb-1">
              <Heart size={13} className="text-red-400" />
              <p className="text-[10px] font-semibold text-[#55556a] uppercase tracking-wide">
                Niet harder dan
              </p>
            </div>
            {plafond ? (
              <>
                <p className="text-2xl font-bold text-white leading-none">
                  {plafond} <span className="text-sm font-semibold text-[#8888a8]">bpm</span>
                </p>
                <p className="text-xs text-[#8888a8] mt-1.5 leading-relaxed">
                  Bovengrens van {zwaarste.label}, de zwaarste zone in deze sessie.{' '}
                  {zwaarste.gevoel}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-white leading-snug">{zwaarste.gevoel}</p>
                <p className="text-xs text-[#8888a8] mt-1.5 leading-relaxed">
                  Vul je maximale hartslag in bij Instellingen, dan staat hier een getal.
                  Tot die tijd is dit de betere controle: hij heeft geen kalibratie nodig.
                </p>
              </>
            )}
          </div>
        )}

        <p className="text-[10px] font-semibold text-[#55556a] uppercase tracking-wide mb-2">Opbouw</p>
        <div className="flex flex-col gap-2">
          {workout.blokken.map((blok, i) => (
            <div key={i} className="rounded-2xl bg-[#222230] border border-[#2d2d3e] p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white">{blok.titel}</p>
                {blok.duur_minuten != null && (
                  <span className="text-xs text-[#8888a8] shrink-0">{formatDuur(blok.duur_minuten)}</span>
                )}
              </div>
              {blok.detail && <p className="text-xs text-[#8888a8] mt-1">{blok.detail}</p>}
              {blok.zones.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {blok.zones.map(z => <ZoneBadge key={z.label} zone={z} maxHartslag={maxHartslag} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

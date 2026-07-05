'use client'

interface Props {
  naam: string
  tijdsdoel?: string | null
  dagenTotDoel: number
  procentVoltooid: number // 0-100
  onClick?: () => void
}

/**
 * Prominente race-countdown hero-kaart voor het dashboard. Toont het grote
 * aantal dagen tot de wedstrijd samen met een dunne voortgangsbalk die laat
 * zien hoeveel van het volledige trainingsplan al is afgewerkt.
 */
export function RaceCountdownHero({ naam, tijdsdoel, dagenTotDoel, procentVoltooid, onClick }: Props) {
  const weken = Math.max(0, Math.ceil(dagenTotDoel / 7))

  return (
    <button
      onClick={onClick}
      className="w-full rounded-3xl bg-gradient-to-br from-[#f97316] to-[#c2410c] p-5 text-left overflow-hidden relative"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-1">
            🏁 {naam}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-black text-white leading-none">{dagenTotDoel}</span>
            <span className="text-sm font-semibold text-white/80">dagen te gaan</span>
          </div>
          <p className="text-xs text-white/70 mt-1.5">
            Nog {weken} {weken === 1 ? 'week' : 'weken'}
            {tijdsdoel ? ` · doeltijd ${tijdsdoel}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all"
            style={{ width: `${Math.min(100, Math.max(0, procentVoltooid))}%` }}
          />
        </div>
        <p className="text-[10px] text-white/70 mt-1.5">{Math.round(procentVoltooid)}% van het plan voltooid</p>
      </div>
    </button>
  )
}

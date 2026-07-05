'use client'

interface Props {
  voltooid: number
  totaal: number
  size?: number
}

/** Kleine ring die laat zien hoeveel van de trainingen deze week al zijn afgerond. */
export function ConsistencyRing({ voltooid, totaal, size = 44 }: Props) {
  const pct = totaal > 0 ? Math.min(1, voltooid / totaal) : 0
  const stroke = 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = c * pct

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#2d2d3e" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={pct >= 1 ? '#4ade80' : '#f97316'}
          strokeWidth={stroke} fill="none"
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-white">{voltooid}/{totaal}</span>
      </div>
    </div>
  )
}

'use client'
export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const GESLACHT_OPTIES = [
  { value: 'man', label: 'Man' },
  { value: 'vrouw', label: 'Vrouw' },
  { value: 'anders', label: 'Anders' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [geboortedatum, setGeboortedatum] = useState('')
  const [geslacht, setGeslacht] = useState('')
  const [maxHartslag, setMaxHartslag] = useState('')
  const [laden, setLaden] = useState(false)

  async function afronden() {
    setLaden(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('profiles').update({
      geboortedatum: geboortedatum || null,
      geslacht: geslacht || null,
      max_hartslag: maxHartslag ? parseInt(maxHartslag) : null,
      onboarding_voltooid: true,
    } as never).eq('id', user.id)

    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#f5f3f0] flex flex-col p-6">
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full gap-8">
        <div className="text-center">
          <div className="text-6xl mb-4">🏃</div>
          <h1 className="text-3xl font-bold text-[#1a1612]">Welkom bij Op Koers</h1>
          <p className="text-[#6b6560] mt-2">Snel nog een paar basisgegevens, dan ben je klaar.</p>
        </div>

        <div className="flex flex-col gap-5">
          <Input
            id="geboortedatum"
            type="date"
            label="Geboortedatum (optioneel)"
            value={geboortedatum}
            onChange={e => setGeboortedatum(e.target.value)}
          />

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[#a09990]">Geslacht (optioneel)</label>
            <div className="flex gap-2">
              {GESLACHT_OPTIES.map(o => (
                <button
                  key={o.value}
                  onClick={() => setGeslacht(g => g === o.value ? '' : o.value)}
                  className={cn(
                    'flex-1 py-3 rounded-2xl text-sm font-medium border-2 transition-all',
                    geslacht === o.value
                      ? 'border-[#f97316] bg-[#f97316]/10 text-[#f97316]'
                      : 'border-[#e8e3dc] text-[#6b6560]'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-[#1a1612] mb-2 block">
              Max hartslag (optioneel)
            </label>
            <p className="text-xs text-[#6b6560] mb-2">Staat op je sporthorloge of hartslagmeter. Gemiddeld ~220 min leeftijd.</p>
            <input
              type="number"
              placeholder="bijv. 182"
              value={maxHartslag}
              onChange={e => setMaxHartslag(e.target.value)}
              className="w-full border border-[#e8e3dc] rounded-2xl px-4 py-3 text-[#1a1612] focus:outline-none focus:border-[#f97316]"
              min="100" max="220"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button size="lg" onClick={afronden} loading={laden}>
            Aan de slag
          </Button>
          <button
            onClick={() => afronden()}
            className="text-sm text-[#6b6560] text-center py-2"
          >
            Sla over
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'
export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const [naam, setNaam] = useState('')
  const [email, setEmail] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [fout, setFout] = useState('')
  const [laden, setLaden] = useState(false)
  const [bevestigingNodig, setBevestigingNodig] = useState(false)
  const router = useRouter()

  async function registreren(e: React.FormEvent) {
    e.preventDefault()
    setLaden(true)
    setFout('')
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password: wachtwoord,
      options: { data: { naam } },
    })
    if (error) {
      setFout(error.message)
      setLaden(false)
      return
    }
    // Als email bevestiging vereist is (identities leeg = al bestaand account)
    if (data.user && !data.session) {
      setBevestigingNodig(true)
      setLaden(false)
    } else {
      router.push('/onboarding')
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f3f0] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-5xl mb-3">🏃</div>
          <h1 className="text-3xl font-bold text-[#1a1612]">Op Koers</h1>
          <p className="text-[#6b6560] mt-1">Maak een account aan</p>
        </div>

        {bevestigingNodig ? (
          <div className="text-center bg-white rounded-3xl p-6">
            <div className="text-4xl mb-3">📬</div>
            <h2 className="text-lg font-bold text-[#1a1612] mb-2">Check je e-mail</h2>
            <p className="text-[#6b6560] text-sm mb-4">
              We hebben een bevestigingslink gestuurd naar <span className="text-[#1a1612] font-medium">{email}</span>. Klik op de link om verder te gaan.
            </p>
            <p className="text-xs text-[#6b6560]">
              Of schakel e-mailbevestiging uit in Supabase → Authentication → Email
            </p>
          </div>
        ) : (
        <form onSubmit={registreren} className="flex flex-col gap-4">
          <Input
            id="naam"
            type="text"
            label="Naam"
            value={naam}
            onChange={e => setNaam(e.target.value)}
            placeholder="Jouw naam"
            autoComplete="name"
            required
          />
          <Input
            id="email"
            type="email"
            label="E-mail"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="jij@email.com"
            autoComplete="email"
            required
          />
          <Input
            id="wachtwoord"
            type="password"
            label="Wachtwoord"
            value={wachtwoord}
            onChange={e => setWachtwoord(e.target.value)}
            placeholder="Minimaal 6 tekens"
            autoComplete="new-password"
            minLength={6}
            required
          />
          {fout && <p className="text-sm text-red-400 text-center">{fout}</p>}
          <Button type="submit" size="lg" loading={laden} className="mt-2">
            Account aanmaken
          </Button>
        </form>

        )}
        <p className="text-center text-[#6b6560] mt-6 text-sm">
          Al een account?{' '}
          <Link href="/login" className="text-[#f97316] font-medium">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}

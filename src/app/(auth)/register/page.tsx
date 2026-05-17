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
  const router = useRouter()

  async function registreren(e: React.FormEvent) {
    e.preventDefault()
    setLaden(true)
    setFout('')
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password: wachtwoord,
      options: { data: { naam } },
    })
    if (error) {
      setFout(error.message)
      setLaden(false)
    } else {
      router.push('/onboarding')
    }
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-5xl mb-3">🏃</div>
          <h1 className="text-3xl font-bold text-white">Op Koers</h1>
          <p className="text-[#6b7280] mt-1">Maak een account aan</p>
        </div>

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

        <p className="text-center text-[#6b7280] mt-6 text-sm">
          Al een account?{' '}
          <Link href="/login" className="text-[#f97316] font-medium">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}

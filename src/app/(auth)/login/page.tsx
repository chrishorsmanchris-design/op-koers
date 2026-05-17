'use client'
export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [fout, setFout] = useState('')
  const [laden, setLaden] = useState(false)
  const router = useRouter()

  async function inloggen(e: React.FormEvent) {
    e.preventDefault()
    setLaden(true)
    setFout('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: wachtwoord })
    if (error) {
      setFout('E-mail of wachtwoord onjuist')
      setLaden(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f3f0] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-5xl mb-3">🏃</div>
          <h1 className="text-3xl font-bold text-[#1a1612]">Op Koers</h1>
          <p className="text-[#6b6560] mt-1">Log in om verder te gaan</p>
        </div>

        <form onSubmit={inloggen} className="flex flex-col gap-4">
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
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
          {fout && <p className="text-sm text-red-400 text-center">{fout}</p>}
          <Button type="submit" size="lg" loading={laden} className="mt-2">
            Inloggen
          </Button>
        </form>

        <p className="text-center text-[#6b6560] mt-6 text-sm">
          Nog geen account?{' '}
          <Link href="/register" className="text-[#f97316] font-medium">
            Registreer je
          </Link>
        </p>
      </div>
    </div>
  )
}

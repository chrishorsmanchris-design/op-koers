import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/instellingen?strava=geweigerd`)
  }

  // Wissel code voor tokens
  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID?.trim(),
      client_secret: process.env.STRAVA_CLIENT_SECRET?.trim(),
      code,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/instellingen?strava=fout`)
  }

  const tokens = await tokenRes.json()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login`)

  await supabase.from('profiles').update({
    strava_refresh_token: tokens.refresh_token,
    strava_athlete_id: tokens.athlete?.id ?? null,
  } as never).eq('id', user.id)

  // Meteen eerste sync draaien
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/strava/sync`, { method: 'POST' })

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/instellingen?strava=gekoppeld`)
}

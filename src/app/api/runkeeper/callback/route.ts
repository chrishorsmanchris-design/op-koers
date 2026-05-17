import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/instellingen', req.url))

  const tokenRes = await fetch('https://runkeeper.com/apps/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.RUNKEEPER_CLIENT_ID!,
      client_secret: process.env.RUNKEEPER_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/runkeeper/callback`,
    }),
  })

  const { access_token } = await tokenRes.json()
  if (!access_token) return NextResponse.redirect(new URL('/instellingen?error=runkeeper', req.url))

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  await supabase.from('profiles').update({ runkeeper_token: access_token } as never).eq('id', user.id)
  return NextResponse.redirect(new URL('/instellingen?runkeeper=ok', req.url))
}

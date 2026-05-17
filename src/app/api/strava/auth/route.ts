import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = process.env.STRAVA_CLIENT_ID?.trim()
  if (!clientId) return NextResponse.json({ error: 'Strava niet geconfigureerd' }, { status: 500 })

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL?.trim()}/api/strava/callback`,
    approval_prompt: 'auto',
    scope: 'activity:read_all',
  })
  return NextResponse.redirect(`https://www.strava.com/oauth/authorize?${params}`)
}

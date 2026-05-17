import { NextResponse } from 'next/server'

export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.RUNKEEPER_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/runkeeper/callback`,
  })
  return NextResponse.redirect(`https://runkeeper.com/apps/authorize?${params}`)
}

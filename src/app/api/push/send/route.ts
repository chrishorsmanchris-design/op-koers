import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { title, body, url } = await req.json()

  const { data: profiel } = await supabase
    .from('profiles').select('push_subscription').eq('id', user.id).single()

  if (!profiel?.push_subscription) {
    return NextResponse.json({ error: 'Geen push subscription' }, { status: 400 })
  }

  try {
    await webpush.sendNotification(
      profiel.push_subscription as webpush.PushSubscription,
      JSON.stringify({ title, body, url: url ?? '/dashboard' })
    )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Push mislukt' }, { status: 500 })
  }
}

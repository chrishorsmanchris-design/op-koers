import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { data: profiel } = await supabase
    .from('profiles').select('push_subscription').eq('id', user.id).single()

  const checks = {
    vapidPublicKey:  !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    vapidPrivateKey: !!process.env.VAPID_PRIVATE_KEY,
    vapidEmail:      !!process.env.VAPID_EMAIL,
    cronSecret:      !!process.env.CRON_SECRET,
    pushSubscription: !!profiel?.push_subscription,
    subscriptionPreview: profiel?.push_subscription
      ? JSON.stringify(profiel.push_subscription).slice(0, 80) + '…'
      : null,
  }

  const allesOk = checks.vapidPublicKey && checks.vapidPrivateKey && checks.vapidEmail && checks.pushSubscription

  return NextResponse.json({ allesOk, checks })
}

import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { TEMPO_ZONES } from '@/lib/tempo-zones'
import { kalibreerTempoZones } from '@/lib/tempo-kalibratie'

export const maxDuration = 60

// Deze route staat niet meer in vercel.json — de kalibratie draait mee in
// /api/cron/weekreview, omdat Vercel Hobby maar twee cronjobs toestaat.
// Het endpoint blijft bestaan zodat je de kalibratie handmatig kunt aftrappen.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const querySecret = req.nextUrl.searchParams.get('secret')
  const cronSecret = process.env.CRON_SECRET
  const geautoriseerd =
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret ||
    req.headers.get('x-cron-secret') === cronSecret
  if (!geautoriseerd) {
    return NextResponse.json({ error: 'Ongeautoriseerd' }, { status: 401 })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      error: 'SUPABASE_SERVICE_ROLE_KEY ontbreekt in Vercel omgevingsvariabelen.',
      bijgewerkt: 0,
    }, { status: 500 })
  }

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )
  } catch { /* push optioneel — kalibratie werkt ook zonder */ }

  const resultaat = await kalibreerTempoZones(supabase)
  if (resultaat.fout) {
    return NextResponse.json({ error: resultaat.fout, bijgewerkt: 0 }, { status: 500 })
  }

  return NextResponse.json({ ...resultaat, standaard: TEMPO_ZONES })
}

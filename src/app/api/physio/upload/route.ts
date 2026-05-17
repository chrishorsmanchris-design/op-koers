import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const claude = new Anthropic()

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const formData = await req.formData()
  const bestand = formData.get('bestand') as File
  if (!bestand) return NextResponse.json({ error: 'Geen bestand' }, { status: 400 })

  const buffer = await bestand.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const isPdf = bestand.type === 'application/pdf'

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: 'Je bent een fysiotherapeut-assistent. Extraheer oefeningen uit het document. Geef altijd geldige JSON terug.',
    messages: [{
      role: 'user',
      content: [
        {
          type: isPdf ? 'document' : 'image',
          source: {
            type: 'base64',
            media_type: bestand.type as 'application/pdf' | 'image/jpeg' | 'image/png',
            data: base64,
          },
        } as never,
        {
          type: 'text',
          text: `Extraheer alle fysiotherapie-oefeningen uit dit document. Geef ze terug als JSON:
{
  "oefeningen": [
    {
      "naam": "Naam van de oefening",
      "beschrijving": "Gedetailleerde uitleg hoe de oefening uitgevoerd moet worden",
      "sets": 3,
      "reps": 10,
      "duur_seconden": null,
      "categorie": "core|kuit|heup|rug|anders",
      "zoekterm": "Engels zoekterm voor YouTube (bijv. 'dead bug core exercise')"
    }
  ]
}
Als een veld niet beschikbaar is, gebruik null. Geef reps of duur_seconden, niet beide.`,
        }
      ]
    }],
  })

  const tekst = response.content[0].type === 'text' ? response.content[0].text : ''
  let data
  try {
    const match = tekst.match(/\{[\s\S]*\}/)
    data = JSON.parse(match?.[0] ?? '{}')
  } catch {
    return NextResponse.json({ error: 'Kon oefeningen niet parsen' }, { status: 500 })
  }

  // YouTube video's zoeken voor elke oefening
  const oefeningenMetVideo = await Promise.all(
    (data.oefeningen ?? []).map(async (oef: Record<string, unknown>) => {
      const video = await zoekYouTubeVideo(oef.zoekterm as string)
      return { ...oef, video_url: video?.url ?? null, video_start_seconden: video?.start ?? 0 }
    })
  )

  // Opslaan in database
  const { data: opgeslagen, error } = await supabase.from('physio_exercises').insert(
    oefeningenMetVideo.map((oef: Record<string, unknown>) => ({
      user_id: user.id,
      naam: oef.naam,
      beschrijving: oef.beschrijving,
      sets: oef.sets,
      reps: oef.reps,
      duur_seconden: oef.duur_seconden,
      categorie: oef.categorie,
      video_url: oef.video_url,
      video_start_seconden: oef.video_start_seconden ?? 0,
      actief: true,
    }))
  ).select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ oefeningen: opgeslagen })
}

async function zoekYouTubeVideo(zoekterm: string): Promise<{ url: string; start: number } | null> {
  if (!zoekterm || !process.env.YOUTUBE_API_KEY) return null

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(zoekterm + ' physiotherapy exercise')}&type=video&videoDuration=short&maxResults=1&key=${process.env.YOUTUBE_API_KEY}`
    )
    const json = await res.json()
    const videoId = json.items?.[0]?.id?.videoId
    if (!videoId) return null

    // Haal video details op voor chapters/beschrijving
    const detailRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`
    )
    const detail = await detailRes.json()
    const beschrijving = detail.items?.[0]?.snippet?.description ?? ''

    // Zoek timestamp in beschrijving (bijv. "0:30 Exercise name")
    const timestampMatch = beschrijving.match(/(\d+):(\d{2})\s+(?:exercise|oefening|start)/i)
    const startSeconden = timestampMatch
      ? parseInt(timestampMatch[1]) * 60 + parseInt(timestampMatch[2])
      : 0

    return { url: `https://www.youtube.com/watch?v=${videoId}&t=${startSeconden}`, start: startSeconden }
  } catch {
    return null
  }
}

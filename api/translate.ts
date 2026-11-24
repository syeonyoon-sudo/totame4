// Vercel Serverless Function — 역 안내판 사진 OCR + 번역
// 환경변수: GOOGLE_CLOUD_API_KEY (Cloud Vision API + Cloud Translation API 사용 설정 필요)
// 요청: POST /api/translate { image: base64(JPEG), target: 'en' | 'zh-CN' | 'ja' | 'ko' }
declare const process: { env: Record<string, string | undefined> }

export async function POST(request: Request): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  const key = process.env.GOOGLE_CLOUD_API_KEY
  if (!key) return json({ error: 'not_configured' }, 503)
  let body: { image?: string; target?: string }
  try {
    body = (await request.json()) as { image?: string; target?: string }
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!body.image || body.image.length > 6_000_000) return json({ error: 'bad_image' }, 400)
  const target = ['en', 'zh-CN', 'ja', 'ko'].includes(body.target ?? '') ? body.target! : 'en'
  try {
    const v = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requests: [{ image: { content: body.image }, features: [{ type: 'TEXT_DETECTION' }], imageContext: { languageHints: ['ko'] } }] }),
    })
    const vj = (await v.json()) as { responses?: { fullTextAnnotation?: { text?: string } }[] }
    const text = vj.responses?.[0]?.fullTextAnnotation?.text?.trim() ?? ''
    if (!text) return json({ text: '', translated: '' })
    const tr = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: text, target, format: 'text' }),
    })
    const tj = (await tr.json()) as { data?: { translations?: { translatedText?: string }[] } }
    return json({ text, translated: tj.data?.translations?.[0]?.translatedText ?? '' })
  } catch {
    return json({ error: 'upstream_failed' }, 502)
  }
}

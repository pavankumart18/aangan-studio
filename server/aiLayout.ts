import Anthropic from '@anthropic-ai/sdk'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * POST /api/ai-layout — asks Claude for a furniture layout for one room.
 * Runs server-side (Vite dev/preview middleware) so the API key never reaches the browser.
 * Credentials are resolved by the SDK (ANTHROPIC_API_KEY, or an `ant auth login` profile).
 */

export interface AiLayoutRequest {
  room: { name: string; type: string; w: number; d: number }
  walls: { side: string; facing: string; exterior: boolean; doors: [number, number][]; windows: [number, number][]; sunHours: number }[]
  style: string
  vastu: boolean
  city: string
  date: string
  brief?: string
  catalog: { kind: string; label: string; w: number; d: number; h: number }[]
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'items'],
  properties: {
    summary: { type: 'string', description: 'Two or three sentences explaining the design intent.' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'x', 'y', 'rot', 'reason'],
        properties: {
          kind: { type: 'string', description: 'A kind from the catalogue.' },
          x: { type: 'number', description: 'Centre x in metres from the room left wall.' },
          y: { type: 'number', description: 'Centre y in metres from the room top wall.' },
          rot: { type: 'integer', enum: [0, 90, 180, 270] },
          reason: { type: 'string', description: 'One short sentence on why it goes here.' },
        },
      },
    },
  },
} as const

const SYSTEM = `You are a senior interior designer laying out furniture in a residential room plan.
Coordinates: metres, room-local. x runs from the left wall (0) to the right wall (room width); y runs from the top wall (0) to the bottom wall (room depth).
Rotation (degrees, clockwise on plan) sets which way the FRONT of a piece faces: 0 = faces down/+y (back against the top wall), 180 = faces up (back against the bottom wall), 270 = faces right/+x (back against the left wall), 90 = faces left/-x (back against the right wall).
A piece of width w and depth d at rot 0/180 spans w along x and d along y; at 90/270 the spans swap.
Rules: everything fully inside the room; no overlaps; keep a clear 0.9 m swing in front of every door span; keep ≥0.75 m walkways; tall pieces (wardrobe, bookshelf, fridge) must not cover windows; TVs and desks should avoid facing into strong direct sun; use only catalogue kinds; place backs about 0.06 m off the wall face.
Respect the requested style and, when Vastu is on, traditional Vastu orientations, but never at the cost of comfort or circulation.`

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

const send = (res: ServerResponse, code: number, body: unknown) => {
  res.statusCode = code
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

let client: Anthropic | null = null

export async function aiLayoutHandler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
  const t0 = Date.now()
  let input: AiLayoutRequest
  try {
    input = JSON.parse(await readBody(req))
  } catch {
    return send(res, 400, { error: 'Invalid JSON body' })
  }
  try {
    client ??= new Anthropic()
    const prompt = [
      `Room: "${input.room.name}" (${input.room.type}), ${input.room.w.toFixed(2)} m wide × ${input.room.d.toFixed(2)} m deep.`,
      `Location: ${input.city}, date ${input.date}. Style: ${input.style}. Vastu guidance: ${input.vastu ? 'on' : 'off'}.`,
      'Walls (door/window spans are [start, end] metres along the wall, measured from the room left wall for top/bottom walls and from the top wall for left/right walls):',
      ...input.walls.map(
        (w) =>
          `- ${w.side} wall faces ${w.facing}${w.exterior ? ' (exterior)' : ' (interior)'}; doors ${JSON.stringify(w.doors)}; windows ${JSON.stringify(w.windows)}; direct sun through its windows ≈ ${w.sunHours.toFixed(1)} h`,
      ),
      `Catalogue (kind: label, w × d × h m): ${input.catalog.map((c) => `${c.kind}: ${c.label}, ${c.w}×${c.d}×${c.h}`).join('; ')}`,
      input.brief ? `Client brief: ${input.brief}` : '',
      'Propose a complete, livable layout for this room.',
    ]
      .filter(Boolean)
      .join('\n')

    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })
    if (msg.stop_reason === 'refusal') return send(res, 422, { error: 'Claude declined this request.' })
    if (msg.stop_reason === 'max_tokens') return send(res, 502, { error: 'Response was cut off; try again.' })
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    const parsed = JSON.parse(text) as { summary: string; items: { kind: string; x: number; y: number; rot: number; reason: string }[] }
    const ms = Date.now() - t0
    console.info(`[aangan] ai-layout ${input.room.name}: ${parsed.items.length} items in ${ms} ms (${msg.usage.input_tokens} in / ${msg.usage.output_tokens} out tokens)`)
    return send(res, 200, { ...parsed, ms, model: msg.model })
  } catch (err) {
    const ms = Date.now() - t0
    if (err instanceof Anthropic.AuthenticationError) return send(res, 401, { error: 'No valid Anthropic credentials on the server. Set ANTHROPIC_API_KEY and restart the dev server.', ms })
    if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'Rate limited — wait a moment and retry.', ms })
    if (err instanceof Anthropic.APIError) return send(res, 502, { error: `Claude API error: ${err.message}`, ms })
    if (err instanceof SyntaxError) return send(res, 502, { error: 'Could not parse the layout returned by Claude.', ms })
    const m = err instanceof Error ? err.message : String(err)
    const noCreds = /api[_ ]?key|credential|auth/i.test(m)
    return send(res, noCreds ? 401 : 500, { error: noCreds ? 'No Anthropic credentials on the server. Set ANTHROPIC_API_KEY and restart the dev server.' : m, ms })
  }
}

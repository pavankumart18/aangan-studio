import type { jsPDF as JsPDF } from 'jspdf'
import type { Project } from './types'
import { buildWalls, EXT_T, INT_T, bearingToVec } from './walls'
import { onLevel, lvl } from './levels'
import { CATALOG_MAP, ROOM_TYPE_MAP } from './catalog'
import { analyse, estimate, SQFT } from './insights'
import { STYLES } from './styles'
import { DIR_LONG, fmtTime } from './sun'

const A3 = { w: 420, h: 297 }
const M = 10
const TB = { x: 318, w: 92 } // title block column
const DRAW = { x: 14, y: 14, w: 300, h: 269 }

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const tint = (hex: string, t: number): [number, number, number] => rgb(hex).map((v) => Math.round(v + (255 - v) * t)) as [number, number, number]
const ft = (m: number) => {
  const i = Math.round(m * 39.3701)
  return `${Math.floor(i / 12)}'${i % 12}"`
}

function poly(doc: JsPDF, pts: [number, number][], style: 'S' | 'F' | 'FD') {
  const [x0, y0] = pts[0]
  const deltas = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]])
  doc.lines(deltas, x0, y0, [1, 1], style, true)
}

function dim(doc: JsPDF, x1: number, y1: number, x2: number, y2: number, label: string, vertical: boolean) {
  doc.setDrawColor(90)
  doc.setLineWidth(0.15)
  doc.line(x1, y1, x2, y2)
  for (const [x, y] of [
    [x1, y1],
    [x2, y2],
  ])
    doc.line(x - 0.9, y + 0.9, x + 0.9, y - 0.9)
  doc.setFontSize(6.5)
  doc.setTextColor(60)
  if (vertical) doc.text(label, x1 - 1.2, (y1 + y2) / 2, { angle: 90, align: 'center' })
  else doc.text(label, (x1 + x2) / 2, y1 - 1.2, { align: 'center' })
}

function northArrow(doc: JsPDF, cx: number, cy: number, deg: number) {
  const r = 7
  doc.setDrawColor(60)
  doc.setLineWidth(0.25)
  doc.circle(cx, cy, r, 'S')
  const rot = (x: number, y: number): [number, number] => {
    const a = (deg * Math.PI) / 180
    return [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]
  }
  doc.setFillColor(224, 122, 63)
  poly(doc, [rot(0, -r + 1), rot(2.6, 3), rot(0, 1.4), rot(-2.6, 3)], 'F')
  const [tx, ty] = rot(0, -r - 2.5)
  doc.setFontSize(8)
  doc.setTextColor(40)
  doc.setFont('helvetica', 'bold')
  doc.text('N', tx, ty + 1, { align: 'center' })
  doc.setFont('helvetica', 'normal')
}

function frame(doc: JsPDF) {
  doc.setDrawColor(40)
  doc.setLineWidth(0.5)
  doc.rect(M, M, A3.w - 2 * M, A3.h - 2 * M)
  doc.setLineWidth(0.3)
  doc.line(TB.x - 2, M, TB.x - 2, A3.h - M)
}

function titleHeader(doc: JsPDF, p: Project, sheet: string, n: number, total: number, scaleLabel: string) {
  const x = TB.x + 2
  let y = M + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(224, 122, 63)
  doc.text('AANGAN STUDIO', x, y)
  doc.setTextColor(20)
  doc.setFontSize(13)
  y += 7
  doc.text(doc.splitTextToSize(p.name, TB.w - 6), x, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  y += 7
  doc.text(sheet, x, y)
  doc.setFontSize(7.5)
  doc.setTextColor(90)
  y += 6
  const rows = [
    ['Scale', scaleLabel],
    ['Date', new Date().toLocaleDateString()],
    ['Sheet', `${n} of ${total}`],
    ['Location', `${p.plot.city} (${p.plot.lat.toFixed(3)}, ${p.plot.lng.toFixed(3)})`],
    ['Style', STYLES[p.style].label],
    ['Plot', `${p.plot.width.toFixed(2)} × ${p.plot.depth.toFixed(2)} m (${ft(p.plot.width)} × ${ft(p.plot.depth)})`],
  ]
  for (const [k, v] of rows) {
    doc.text(k, x, y)
    doc.setTextColor(30)
    doc.text(v, x + 18, y)
    doc.setTextColor(90)
    y += 4.4
  }
  return y
}

function footer(doc: JsPDF) {
  doc.setFontSize(6)
  doc.setTextColor(130)
  doc.text(
    doc.splitTextToSize('Concept design drawing. All dimensions in metres unless noted; verify on site. Structural design, services and statutory approvals by licensed professionals.', TB.w - 6),
    TB.x + 2,
    A3.h - M - 8,
  )
}

function drawLevel(doc: JsPDF, full: Project, level: number, sheetNo: number, total: number) {
  const p = onLevel(full, level)
  const plot = full.plot
  const avail = { w: DRAW.w - 44, h: DRAW.h - 44 }
  const scales = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500]
  const S = scales.find((s) => (plot.width * 1000) / s <= avail.w && (plot.depth * 1000) / s <= avail.h) ?? 500
  const k = 1000 / S // mm per metre
  const ox = DRAW.x + 22 + (avail.w - plot.width * k) / 2
  const oy = DRAW.y + 22 + (avail.h - plot.depth * k) / 2
  const X = (x: number) => ox + x * k
  const Y = (y: number) => oy + y * k

  frame(doc)
  // plot boundary
  doc.setDrawColor(95, 125, 69)
  doc.setLineWidth(0.35)
  doc.setLineDashPattern([2.5, 1.2], 0)
  doc.rect(X(0), Y(0), plot.width * k, plot.depth * k)
  doc.setLineDashPattern([], 0)

  // overall plot dimensions
  dim(doc, X(0), Y(0) - 16, X(plot.width), Y(0) - 16, `${plot.width.toFixed(2)} m (${ft(plot.width)})`, false)
  dim(doc, X(0) - 16, Y(0), X(0) - 16, Y(plot.depth), `${plot.depth.toFixed(2)} m (${ft(plot.depth)})`, true)

  // ghost of the floor below
  if (level > 0) {
    const below = onLevel(full, level - 1)
    doc.setDrawColor(190)
    doc.setLineWidth(0.15)
    doc.setLineDashPattern([1, 1], 0)
    for (const r of below.rooms) doc.rect(X(r.x), Y(r.y), r.w * k, r.d * k)
    doc.setLineDashPattern([], 0)
  }

  // rooms
  for (const r of p.rooms) {
    doc.setFillColor(...tint(ROOM_TYPE_MAP[r.type].color, 0.62))
    doc.rect(X(r.x), Y(r.y), r.w * k, r.d * k, 'F')
  }

  // furniture (light linework under walls)
  doc.setLineWidth(0.12)
  for (const f of p.furniture) {
    const def = CATALOG_MAP[f.kind]
    if (!def) continue
    const a = (f.rot * Math.PI) / 180
    const corner = (lx: number, ly: number): [number, number] => [X(f.x + lx * Math.cos(a) - ly * Math.sin(a)), Y(f.y + lx * Math.sin(a) + ly * Math.cos(a))]
    const pts: [number, number][] = [corner(-def.w / 2, -def.d / 2), corner(def.w / 2, -def.d / 2), corner(def.w / 2, def.d / 2), corner(-def.w / 2, def.d / 2)]
    const stair = f.kind.startsWith('stair')
    doc.setDrawColor(stair ? 60 : 140)
    doc.setFillColor(255, 255, 255)
    if (f.kind === 'rug') doc.setLineDashPattern([0.8, 0.6], 0)
    poly(doc, pts, f.kind === 'rug' ? 'S' : 'FD')
    doc.setLineDashPattern([], 0)
    if (stair) {
      const n = Math.round((full.wallHeight + full.slabThickness) / 0.165)
      const u = f.kind === 'stair-u'
      const flights = u ? [[-def.w / 2, 0], [0, def.w / 2]] : [[-def.w / 2, def.w / 2]]
      const run = u ? def.d - def.w / 2 : def.d
      const per = u ? Math.ceil(n / 2) : n
      for (const [x0, x1] of flights)
        for (let i = 1; i < per; i++) {
          const ly = def.d / 2 - (run / per) * i
          doc.line(...corner(x0, ly), ...corner(x1, ly))
        }
      if (u) doc.line(...corner(0, def.d / 2), ...corner(0, -def.d / 2 + def.w / 2))
      const [ax, ay] = corner(u ? -def.w / 4 : 0, def.d / 2 - 0.3)
      doc.setFontSize(6)
      doc.setTextColor(60)
      doc.text('UP', ax, ay, { align: 'center' })
    } else if (def.w * k > 11) {
      const [cx, cy] = corner(0, 0)
      doc.setFontSize(4.8)
      doc.setTextColor(140)
      doc.text(def.label, cx, cy + 0.8, { align: 'center' })
    }
  }
  // stairs arriving from below
  if (level > 0) {
    for (const f of onLevel(full, level - 1).furniture.filter((f) => f.kind.startsWith('stair'))) {
      const def = CATALOG_MAP[f.kind]
      const a = (f.rot * Math.PI) / 180
      const corner = (lx: number, ly: number): [number, number] => [X(f.x + lx * Math.cos(a) - ly * Math.sin(a)), Y(f.y + lx * Math.sin(a) + ly * Math.cos(a))]
      doc.setDrawColor(80)
      doc.setLineDashPattern([1.2, 0.8], 0)
      poly(doc, [corner(-def.w / 2, -def.d / 2), corner(def.w / 2, -def.d / 2), corner(def.w / 2, def.d / 2), corner(-def.w / 2, def.d / 2)], 'S')
      doc.setLineDashPattern([], 0)
      const [cx, cy] = corner(0, 0)
      doc.setFontSize(6)
      doc.text('DN · stair from below', cx, cy, { align: 'center' })
    }
  }

  // walls & openings
  const walls = buildWalls(p)
  for (const s of walls) {
    const t = (s.exterior ? EXT_T : INT_T) * k
    const ext = s.type === 'wall' ? t / 2 : 0
    const L = (s.end - s.start) * k
    const [rx, ry, rw, rh] = s.orient === 'h' ? [X(s.start) - ext, Y(s.fixed) - t / 2, L + 2 * ext, t] : [X(s.fixed) - t / 2, Y(s.start) - ext, t, L + 2 * ext]
    if (s.type === 'wall') {
      doc.setFillColor(40, 43, 50)
      doc.rect(rx, ry, rw, rh, 'F')
    } else if (s.type === 'window') {
      doc.setFillColor(255, 255, 255)
      doc.setDrawColor(40)
      doc.setLineWidth(0.15)
      doc.rect(rx, ry, rw, rh, 'FD')
      doc.setDrawColor(58, 143, 214)
      doc.setLineWidth(0.25)
      if (s.orient === 'h') doc.line(X(s.start), Y(s.fixed), X(s.end), Y(s.fixed))
      else doc.line(X(s.fixed), Y(s.start), X(s.fixed), Y(s.end))
    } else {
      doc.setFillColor(255, 255, 255)
      doc.rect(rx, ry, rw, rh, 'F')
      const nb = s.normalBearing != null ? (s.normalBearing + 180) % 360 : s.orient === 'h' ? 180 : 90
      const [nx, ny] = bearingToVec(nb)
      const Lm = s.end - s.start
      const hinge: [number, number] = s.orient === 'h' ? [s.start, s.fixed] : [s.fixed, s.start]
      const tip: [number, number] = s.orient === 'h' ? [s.start, s.fixed + ny * Lm] : [s.fixed + nx * Lm, s.start]
      doc.setDrawColor(109, 76, 51)
      doc.setLineWidth(0.3)
      doc.line(X(hinge[0]), Y(hinge[1]), X(tip[0]), Y(tip[1]))
      doc.setLineWidth(0.12)
      const arc: [number, number][] = []
      for (let i = 0; i <= 12; i++) {
        const th = (i / 12) * (Math.PI / 2)
        const along = Math.sin(th) * Lm
        const off = Math.cos(th) * Lm
        arc.push(s.orient === 'h' ? [X(s.start + along), Y(s.fixed + ny * off)] : [X(s.fixed + nx * off), Y(s.start + along)])
      }
      for (let i = 1; i < arc.length; i++) doc.line(arc[i - 1][0], arc[i - 1][1], arc[i][0], arc[i][1])
    }
  }

  // room labels
  for (const r of p.rooms) {
    const cx = X(r.x + r.w / 2), cy = Y(r.y + r.d / 2)
    doc.setTextColor(25)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(Math.min(9, r.w * k * 0.22))
    doc.text(r.name.toUpperCase(), cx, cy - 1.5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(Math.min(7, r.w * k * 0.18))
    doc.setTextColor(70)
    doc.text(`${r.w.toFixed(2)} × ${r.d.toFixed(2)} m`, cx, cy + 2, { align: 'center' })
    doc.text(`${(r.w * r.d).toFixed(1)} m² · ${Math.round(r.w * r.d * SQFT)} ft²`, cx, cy + 5, { align: 'center' })
  }

  // building dimension chains (top & left), at room boundaries
  if (p.rooms.length) {
    const xs = [...new Set(p.rooms.flatMap((r) => [r.x, r.x + r.w]).map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b)
    const ys = [...new Set(p.rooms.flatMap((r) => [r.y, r.y + r.d]).map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b)
    const top = Y(0) - 8
    const left = X(0) - 8
    doc.setDrawColor(170)
    doc.setLineWidth(0.1)
    const minY = Math.min(...p.rooms.map((r) => r.y))
    const minX = Math.min(...p.rooms.map((r) => r.x))
    for (const x of xs) doc.line(X(x), top - 1, X(x), Y(minY) - 1)
    for (const y of ys) doc.line(left - 1, Y(y), X(minX) - 1, Y(y))
    for (let i = 1; i < xs.length; i++) dim(doc, X(xs[i - 1]), top, X(xs[i]), top, (xs[i] - xs[i - 1]).toFixed(2), false)
    for (let i = 1; i < ys.length; i++) dim(doc, left, Y(ys[i - 1]), left, Y(ys[i]), (ys[i] - ys[i - 1]).toFixed(2), true)
    // setbacks
    const maxX = Math.max(...xs), maxY = Math.max(...ys)
    doc.setFontSize(6)
    doc.setTextColor(95, 125, 69)
    if (minY > 0.3) doc.text(`setback ${minY.toFixed(2)} m`, X(plot.width / 2), Y(minY / 2) + 1, { align: 'center' })
    if (plot.depth - maxY > 0.3) doc.text(`setback ${(plot.depth - maxY).toFixed(2)} m`, X(plot.width / 2), Y((maxY + plot.depth) / 2) + 1, { align: 'center' })
    if (minX > 0.3) doc.text(`${minX.toFixed(2)}`, X(minX / 2), Y(plot.depth / 2), { align: 'center' })
    if (plot.width - maxX > 0.3) doc.text(`${(plot.width - maxX).toFixed(2)}`, X((maxX + plot.width) / 2), Y(plot.depth / 2), { align: 'center' })
  }

  // scale bar
  const sbY = DRAW.y + DRAW.h - 4
  doc.setFontSize(6)
  doc.setTextColor(60)
  for (let i = 0; i < 5; i++) {
    if (i % 2) doc.setFillColor(255, 255, 255)
    else doc.setFillColor(40, 40, 40)
    doc.setDrawColor(40)
    doc.rect(DRAW.x + 4 + i * k, sbY, k, 1.6, 'FD')
  }
  doc.text('0', DRAW.x + 4, sbY - 1, { align: 'center' })
  doc.text('5 m', DRAW.x + 4 + 5 * k, sbY - 1, { align: 'center' })
  doc.text(`1:${S}`, DRAW.x + 4 + 5 * k + 6, sbY + 1.4)

  // title block
  let y = titleHeader(doc, full, `${full.levels[level].name} — Floor plan`, sheetNo, total, `1:${S} @ A3`)
  northArrow(doc, TB.x + TB.w - 12, M + 26, plot.northDeg)
  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(30)
  doc.text('ROOM SCHEDULE', TB.x + 2, y)
  doc.setFont('helvetica', 'normal')
  y += 4.5
  doc.setFontSize(6.8)
  doc.setTextColor(110)
  doc.text('Room', TB.x + 2, y)
  doc.text('Size (m)', TB.x + 40, y)
  doc.text('m²', TB.x + 68, y, { align: 'right' })
  doc.text('ft²', TB.x + 86, y, { align: 'right' })
  doc.setDrawColor(200)
  doc.line(TB.x + 2, y + 1.2, TB.x + TB.w - 4, y + 1.2)
  y += 4.5
  doc.setTextColor(30)
  let tot = 0
  for (const r of p.rooms) {
    const a = r.w * r.d
    tot += a
    doc.setFillColor(...tint(ROOM_TYPE_MAP[r.type].color, 0.3))
    doc.rect(TB.x + 2, y - 2.4, 2.4, 2.4, 'F')
    doc.text(r.name.slice(0, 22), TB.x + 6, y)
    doc.text(`${r.w.toFixed(2)} × ${r.d.toFixed(2)}`, TB.x + 40, y)
    doc.text(a.toFixed(1), TB.x + 68, y, { align: 'right' })
    doc.text(String(Math.round(a * SQFT)), TB.x + 86, y, { align: 'right' })
    y += 4.2
    if (y > A3.h - 70) break
  }
  doc.line(TB.x + 2, y - 2.6, TB.x + TB.w - 4, y - 2.6)
  doc.setFont('helvetica', 'bold')
  doc.text('Floor total', TB.x + 6, y + 0.6)
  doc.text(tot.toFixed(1), TB.x + 68, y + 0.6, { align: 'right' })
  doc.text(String(Math.round(tot * SQFT)), TB.x + 86, y + 0.6, { align: 'right' })
  doc.setFont('helvetica', 'normal')

  // legend
  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('LEGEND', TB.x + 2, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.8)
  y += 5
  doc.setFillColor(40, 43, 50)
  doc.rect(TB.x + 2, y - 2, 8, 2.3, 'F')
  doc.text('230 mm external wall', TB.x + 13, y)
  y += 4.5
  doc.rect(TB.x + 2, y - 1.6, 8, 1.15, 'F')
  doc.text('115 mm partition', TB.x + 13, y)
  y += 4.5
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(40)
  doc.rect(TB.x + 2, y - 2, 8, 2.3, 'FD')
  doc.setDrawColor(58, 143, 214)
  doc.line(TB.x + 2, y - 0.85, TB.x + 10, y - 0.85)
  doc.text('Window (sill 900, lintel 2100)', TB.x + 13, y)
  y += 4.5
  doc.setDrawColor(109, 76, 51)
  doc.line(TB.x + 2, y, TB.x + 2, y - 4)
  doc.text('Door with swing', TB.x + 13, y)
  footer(doc)
}

function summaryPage(doc: JsPDF, p: Project, date: string, render: string | null, sheetNo: number, total: number) {
  frame(doc)
  const e = estimate(p)
  const a = analyse(p, date)
  if (render) {
    const img = doc.getImageProperties(render)
    const w = DRAW.w, h = Math.min(DRAW.h * 0.62, (w * img.height) / img.width)
    doc.addImage(render, 'PNG', DRAW.x, DRAW.y, w, h)
    doc.setFontSize(7)
    doc.setTextColor(110)
    doc.text(`3D view — sun position on ${date}`, DRAW.x, DRAW.y + h + 4)
  }
  // sun & vastu table
  let y = render ? DRAW.y + DRAW.h * 0.62 + 12 : DRAW.y + 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(30)
  doc.text(`SUNLIGHT & ORIENTATION — ${date} · sunrise ${fmtTime(a.days.sunrise)} · sunset ${fmtTime(a.days.sunset)}`, DRAW.x, y)
  doc.setFont('helvetica', 'normal')
  y += 5
  doc.setFontSize(6.8)
  doc.setTextColor(110)
  const cols = [0, 52, 78, 98, 118, 140]
  ;['Room', 'Floor', 'Morning sun', 'Afternoon', 'Windows', 'Vastu zone'].forEach((h, i) => doc.text(h, DRAW.x + cols[i], y))
  y += 4
  doc.setTextColor(30)
  for (const r of a.rooms) {
    if (y > DRAW.y + DRAW.h - 4) break
    const row = [r.room.name, p.levels[lvl(r.room)]?.name ?? '', `${r.morning.toFixed(1)} h`, `${r.afternoon.toFixed(1)} h`, r.windows.map((w) => w.dir).join(', ') || '—', `${r.vastuZone === 'Center' ? 'Centre' : DIR_LONG[r.vastuZone]}${r.vastuOk === true ? ' (ideal)' : r.vastuOk === false ? ' (avoid)' : ''}`]
    row.forEach((c, i) => doc.text(String(c), DRAW.x + cols[i], y))
    y += 3.8
  }

  let ty = titleHeader(doc, p, 'Project summary & quantities', sheetNo, total, 'NTS')
  ty += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(30)
  doc.text('AREA STATEMENT', TB.x + 2, ty)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  ty += 5
  const line = (k: string, v: string) => {
    doc.setTextColor(90)
    doc.text(k, TB.x + 2, ty)
    doc.setTextColor(25)
    doc.text(v, TB.x + TB.w - 4, ty, { align: 'right' })
    ty += 4.3
  }
  line('Plot area', `${e.plotArea.toFixed(1)} m² · ${Math.round(e.plotArea * SQFT)} ft²`)
  line('Ground coverage', `${Math.round(e.coverage * 100)} %`)
  for (const l of e.perLevel) line(l.name, `${l.builtUp.toFixed(1)} m² · ${Math.round(l.builtUp * SQFT)} ft²`)
  line('Total built-up', `${e.builtUp.toFixed(1)} m² · ${Math.round(e.builtUp * SQFT)} ft²`)
  line('FAR (built-up ÷ plot)', (e.builtUp / e.plotArea).toFixed(2))
  ty += 3
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('INDICATIVE QUANTITIES', TB.x + 2, ty)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  ty += 5
  line('Footings / columns', `${e.columns}`)
  line('Footing concrete', `${e.footingConcrete.toFixed(2)} m³`)
  line('Plinth beam concrete', `${e.beamConcrete.toFixed(2)} m³`)
  line('Slab concrete (all floors)', `${e.slabConcrete.toFixed(2)} m³`)
  line('Brickwork', `${e.brickVol.toFixed(1)} m³ ~ ${e.bricks.toLocaleString()} bricks`)
  line('Interior paint', `${e.paintArea.toFixed(0)} m²`)
  line('Exterior paint', `${e.exteriorPaint.toFixed(0)} m²`)
  line('Windows / doors', `${e.windows} / ${e.doors}`)
  line('Staircases', `${e.stairs}`)
  footer(doc)
}

export async function buildPlanPDF(p: Project, date: string, render: string | null) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  doc.setProperties({ title: `${p.name} — plans`, creator: 'Aangan Studio' })
  const total = p.levels.length + 1
  p.levels.forEach((_, i) => {
    if (i > 0) doc.addPage('a3', 'landscape')
    drawLevel(doc, p, i, i + 1, total)
  })
  doc.addPage('a3', 'landscape')
  summaryPage(doc, p, date, render, total, total)
  return doc
}

export async function exportPlanPDF(p: Project, date: string, render: string | null) {
  const t0 = performance.now()
  const doc = await buildPlanPDF(p, date, render)
  const total = p.levels.length + 1
  const slug = p.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  doc.save(`${slug}-plans.pdf`)
  const ms = performance.now() - t0
  console.info(`[aangan] PDF (${total} sheets) generated in ${ms.toFixed(0)} ms`)
  return ms
}

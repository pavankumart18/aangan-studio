import { createContext, memo, useContext, type ReactNode } from 'react'
import type { StyleDef } from '../styles'
import { STYLES } from '../styles'
import { CATALOG_MAP } from '../catalog'

type V3 = [number, number, number]

function B({ s, p, c, r = 0.7, m = 0, o }: { s: V3; p: V3; c: string; r?: number; m?: number; o?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={r} metalness={m} transparent={o != null} opacity={o ?? 1} />
    </mesh>
  )
}

function Cyl({ rt, rb, h, p, c, r = 0.6, seg = 20, e }: { rt: number; rb: number; h: number; p: V3; c: string; r?: number; seg?: number; e?: string }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <cylinderGeometry args={[rt, rb, h, seg]} />
      <meshStandardMaterial color={c} roughness={r} emissive={e ?? '#000'} emissiveIntensity={e ? 0.8 : 0} />
    </mesh>
  )
}

const shade = (hex: string, amt: number) => {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`
}

export const StyleCtx = createContext<StyleDef>(STYLES.modern)
const METAL = '#9ea4a8'

function Legs({ w, d, h, inset = 0.05, c, t = 0.05 }: { w: number; d: number; h: number; inset?: number; c?: string; t?: number }) {
  const st = useContext(StyleCtx)
  const xs = [-w / 2 + inset, w / 2 - inset]
  const zs = [-d / 2 + inset, d / 2 - inset]
  return (
    <>
      {xs.flatMap((x) =>
        zs.map((z) =>
          st.legs === 'metal' ? (
            <B key={`${x}${z}`} s={[t * 0.5, h, t * 0.5]} p={[x, h / 2, z]} c={st.metal} m={0.7} r={0.3} />
          ) : st.legs === 'turned' ? (
            <group key={`${x}${z}`}>
              <Cyl rt={t * 0.45} rb={t * 0.3} h={h * 0.8} p={[x, h * 0.4, z]} c={c ?? st.wood} r={0.4} seg={12} />
              <mesh position={[x, h * 0.85, z]} castShadow>
                <sphereGeometry args={[t * 0.6, 10, 10]} />
                <meshStandardMaterial color={c ?? st.wood} roughness={0.4} />
              </mesh>
            </group>
          ) : (
            <B key={`${x}${z}`} s={[t * 1.4, h, t * 1.4]} p={[x, h / 2, z]} c={c ?? st.wood} r={0.6} />
          ),
        ),
      )}
    </>
  )
}

function Stair({ w, d, h, c, u }: { w: number; d: number; h: number; c: string; u: boolean }) {
  const st = useContext(StyleCtx)
  const rise = 0.165
  const n = Math.max(4, Math.round(h / rise))
  const r = h / n
  const rail = st.legs === 'metal' ? st.metal : st.wood
  const steps: ReactNode[] = []
  if (!u) {
    const tread = d / n
    for (let i = 0; i < n; i++) {
      const top = (i + 1) * r
      steps.push(<B key={i} s={[w, top, tread]} p={[0, top / 2, d / 2 - tread * (i + 0.5)]} c={i % 2 ? c : shadeHex(c, -0.03)} r={0.85} />)
    }
    const handrail: [number, number, number][] = [[w / 2 - 0.03, 0.95, d / 2], [w / 2 - 0.03, h + 0.95, -d / 2]]
    return (
      <>
        {steps}
        {Array.from({ length: n + 1 }, (_, i) => (i % 2 === 0 ? <B key={`p${i}`} s={[0.03, 0.95, 0.03]} p={[w / 2 - 0.03, i * r + 0.475, d / 2 - (d / n) * i]} c={rail} m={0.5} /> : null))}
        <RailBar a={handrail[0]} b={handrail[1]} c={rail} />
      </>
    )
  }
  // dog-legged: flight 1 up the left half towards the back, landing, flight 2 down the right half towards the front
  const half = Math.ceil(n / 2)
  const landing = w / 2
  const run = d - landing
  const t1 = run / half
  const fw = w / 2 - 0.05
  for (let i = 0; i < half; i++) {
    const top = (i + 1) * r
    steps.push(<B key={`a${i}`} s={[fw, top, t1]} p={[-w / 4 - 0.025, top / 2, d / 2 - t1 * (i + 0.5)]} c={i % 2 ? c : shadeHex(c, -0.03)} r={0.85} />)
  }
  const lh = half * r
  steps.push(<B key="land" s={[w, lh, landing]} p={[0, lh / 2, -d / 2 + landing / 2]} c={c} r={0.85} />)
  const rest = n - half
  const t2 = run / rest
  for (let i = 0; i < rest; i++) {
    const top = lh + (i + 1) * r
    steps.push(<B key={`b${i}`} s={[fw, top, t2]} p={[w / 4 + 0.025, top / 2, -d / 2 + landing + t2 * (i + 0.5)]} c={i % 2 ? c : shadeHex(c, -0.03)} r={0.85} />)
  }
  return (
    <>
      {steps}
      <B s={[0.05, h + 0.9, 0.05]} p={[0, (h + 0.9) / 2, d / 2 - 0.03]} c={rail} m={0.5} />
      <RailBar a={[-0.01, 0.95, d / 2]} b={[-0.01, lh + 0.95, -d / 2 + landing]} c={rail} />
      <RailBar a={[0.01, lh + 0.95, -d / 2 + landing]} b={[0.01, h + 0.95, d / 2]} c={rail} />
    </>
  )
}

function RailBar({ a, b, c }: { a: [number, number, number]; b: [number, number, number]; c: string }) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]
  const len = Math.hypot(dx, dy, dz)
  const pitch = Math.atan2(dy, Math.hypot(dx, dz))
  const yaw = Math.atan2(dx, dz)
  return (
    <mesh position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} rotation={[-pitch, yaw, 0, 'YXZ']} castShadow>
      <boxGeometry args={[0.05, 0.05, len]} />
      <meshStandardMaterial color={c} roughness={0.4} metalness={0.4} />
    </mesh>
  )
}

const shadeHex = (hex: string, amt: number) => shade(hex, amt)

function Sofa({ w, d, c }: { w: number; d: number; c: string }) {
  const st = useContext(StyleCtx)
  const arm = 0.18
  const seats = Math.max(1, Math.round((w - 2 * arm) / 0.65))
  const sw = (w - 2 * arm) / seats
  return (
    <>
      {st.legs !== 'block' && <Legs w={w} d={d} h={0.1} inset={0.08} t={0.06} />}
      {st.legs === 'turned' &&
        [-1, 1].map((k) => (
          <mesh key={`roll${k}`} position={[k * (w / 2 - arm / 2), 0.64, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, d, 20]} />
            <meshStandardMaterial color={c} roughness={0.95} />
          </mesh>
        ))}
      {st.legs === 'block' && (
        <>
          {[-1, 1].map((k) => <B key={`fr${k}`} s={[0.08, 0.66, d + 0.02]} p={[k * (w / 2 + 0.03), 0.33, 0]} c={st.wood} r={0.5} />)}
          <B s={[w + 0.14, 0.08, d + 0.02]} p={[0, 0.06, 0]} c={st.wood} r={0.5} />
          {[-1, 1].map((k) => <Cyl key={`br${k}`} rt={0.025} rb={0.025} h={0.04} p={[k * (w / 2 + 0.03), 0.68, d / 2 - 0.05]} c={st.metal} />)}
        </>
      )}
      <B s={[w, 0.3, d]} p={[0, 0.2 + (st.legs === 'metal' ? 0.03 : 0), 0]} c={shade(c, -0.08)} r={0.9} />
      <B s={[w, 0.48, 0.2]} p={[0, 0.6, -d / 2 + 0.1]} c={c} r={0.95} />
      {[-1, 1].map((k) => (
        <B key={k} s={[arm, 0.58, d]} p={[k * (w / 2 - arm / 2), 0.34, 0]} c={c} r={0.95} />
      ))}
      {Array.from({ length: seats }, (_, i) => (
        <B key={i} s={[sw - 0.03, 0.14, d - 0.28]} p={[-w / 2 + arm + sw * (i + 0.5), 0.42, 0.08]} c={shade(c, 0.05)} r={1} />
      ))}
      {Array.from({ length: seats }, (_, i) => (
        <B key={`b${i}`} s={[sw - 0.08, 0.36, 0.12]} p={[-w / 2 + arm + sw * (i + 0.5), 0.64, -d / 2 + 0.24]} c={shade(c, 0.08)} r={1} />
      ))}
    </>
  )
}

function Chair({ c, p = [0, 0, 0], ry = 0 }: { c: string; p?: V3; ry?: number }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      <Legs w={0.42} d={0.42} h={0.44} t={0.035} c={c} />
      <B s={[0.44, 0.05, 0.44]} p={[0, 0.46, 0]} c={c} />
      <B s={[0.44, 0.45, 0.04]} p={[0, 0.7, -0.2]} c={c} />
    </group>
  )
}

function Bed({ w, d, c }: { w: number; d: number; c: string }) {
  const st = useContext(StyleCtx)
  const WOOD = st.wood
  return (
    <>
      <B s={[w, st.legs === 'metal' ? 0.22 : 0.3, d]} p={[0, st.legs === 'metal' ? 0.13 : 0.17, 0]} c={st.legs === 'metal' ? '#3b3e44' : WOOD} />
      <B s={[w - 0.06, 0.22, d - 0.1]} p={[0, 0.42, 0.03]} c="#f4f1ec" r={1} />
      <B s={[w + 0.02, 0.06, d * 0.62]} p={[0, 0.55, d * 0.19]} c={c} r={1} />
      {st.legs === 'metal' && <B s={[w + 0.3, 1.1, 0.06]} p={[0, 0.55, -d / 2 + 0.03]} c={shade(c, -0.15)} r={1} />}
      {st.legs === 'turned' && (
        <>
          <B s={[w, 1.35, 0.1]} p={[0, 0.68, -d / 2 + 0.05]} c={shade(c, 0.05)} r={1} />
          <B s={[w + 0.08, 0.08, 0.14]} p={[0, 1.38, -d / 2 + 0.05]} c={WOOD} r={0.4} />
          {[-1, 1].map((k) => <Cyl key={k} rt={0.05} rb={0.05} h={1.4} p={[k * (w / 2 + 0.02), 0.7, -d / 2 + 0.05]} c={WOOD} r={0.4} />)}
        </>
      )}
      {st.legs === 'block' && (
        <>
          <B s={[w, 1.0, 0.08]} p={[0, 0.55, -d / 2 + 0.04]} c={shade(WOOD, -0.05)} />
          {[-1, 1].flatMap((kx) => [-1, 1].map((kz) => <Cyl key={`${kx}${kz}`} rt={0.045} rb={0.06} h={2.0} p={[kx * (w / 2 - 0.02), 1.0, kz * (d / 2 - 0.02)]} c={WOOD} r={0.5} seg={8} />))}
          {[-1, 1].map((k) => <B key={`cx${k}`} s={[w, 0.06, 0.06]} p={[0, 1.98, k * (d / 2 - 0.02)]} c={WOOD} />)}
          {[-1, 1].map((k) => <B key={`cz${k}`} s={[0.06, 0.06, d]} p={[k * (w / 2 - 0.02), 1.98, 0]} c={WOOD} />)}
        </>
      )}
      {(w > 1.2 ? [-w / 4, w / 4] : [0]).map((x) => (
        <B key={x} s={[w > 1.2 ? w / 2 - 0.12 : w - 0.25, 0.12, 0.38]} p={[x, 0.58, -d / 2 + 0.33]} c="#ffffff" r={1} />
      ))}
    </>
  )
}

function Counter({ w, d, c, island = false }: { w: number; d: number; c: string; island?: boolean }) {
  return (
    <>
      <B s={[w, 0.84, d - (island ? 0.2 : 0)]} p={[0, 0.42, island ? -0.1 : 0]} c={c} />
      <B s={[w + 0.02, 0.04, d + 0.02]} p={[0, 0.88, 0]} c="#2f3135" r={0.25} m={0.1} />
      {!island && (
        <>
          <B s={[0.55, 0.02, 0.38]} p={[-w / 4, 0.895, 0]} c="#8c9399" r={0.2} m={0.8} />
          <B s={[0.6, 0.02, 0.45]} p={[w / 4, 0.9, 0]} c="#111" r={0.3} />
          {[-0.14, 0.14].flatMap((x) => [-0.1, 0.1].map((z) => <Cyl key={`${x}${z}`} rt={0.06} rb={0.06} h={0.02} p={[w / 4 + x, 0.915, z]} c="#444" />))}
          <B s={[w, 0.6, 0.35]} p={[0, 1.85, -d / 2 + 0.175]} c={shade(c, -0.05)} />
        </>
      )}
      {Array.from({ length: Math.floor(w / 0.6) }, (_, i) => (
        <B key={i} s={[0.01, 0.7, 0.01]} p={[-w / 2 + (i + 1) * (w / Math.floor(w / 0.6 + 1)), 0.45, d / 2 + 0.002]} c="#888" />
      ))}
    </>
  )
}

function Model({ kind, color: c, f2f = 3.15 }: { kind: string; color: string; f2f?: number }) {
  const def = CATALOG_MAP[kind]
  if (!def) return null
  const { w, d, h } = def
  let body: ReactNode
  switch (kind) {
    case 'stair-straight':
    case 'stair-u':
      body = <Stair w={w} d={d} h={f2f} c={c} u={kind === 'stair-u'} />
      break
    case 'sofa3':
    case 'sofa2':
    case 'armchair':
      body = <Sofa w={w} d={d} c={c} />
      break
    case 'lsofa':
      body = (
        <>
          <group position={[0, 0, -d / 2 + 0.45]}>
            <Sofa w={w} d={0.9} c={c} />
          </group>
          <B s={[0.9, 0.3, d - 0.9]} p={[w / 2 - 0.45, 0.2, 0.45]} c={shade(c, -0.08)} r={0.9} />
          <B s={[0.82, 0.14, d - 0.95]} p={[w / 2 - 0.45, 0.42, 0.45]} c={shade(c, 0.05)} r={1} />
        </>
      )
      break
    case 'coffee':
      body = (
        <>
          <Legs w={w} d={d} h={0.38} />
          <B s={[w, 0.04, d]} p={[0, 0.4, 0]} c={c} r={0.4} />
          <B s={[w - 0.1, 0.02, d - 0.1]} p={[0, 0.15, 0]} c={shade(c, -0.1)} />
        </>
      )
      break
    case 'tv':
      body = (
        <>
          <B s={[w, 0.5, d]} p={[0, 0.25, 0]} c={c} r={0.5} />
          <B s={[w - 0.04, 0.01, 0.01]} p={[0, 0.25, d / 2 + 0.003]} c="#777" />
          <B s={[1.45, 0.84, 0.05]} p={[0, 1.0, -0.08]} c="#111" r={0.2} />
          <mesh position={[0, 1.0, -0.054]}>
            <planeGeometry args={[1.38, 0.78]} />
            <meshStandardMaterial color="#0c1a2a" emissive="#1e3a5f" emissiveIntensity={0.35} roughness={0.1} />
          </mesh>
        </>
      )
      break
    case 'rug':
      body = (
        <>
          <B s={[w, 0.012, d]} p={[0, 0.006, 0]} c={c} r={1} />
          <B s={[w - 0.25, 0.014, d - 0.25]} p={[0, 0.007, 0]} c={shade(c, -0.12)} r={1} />
          <B s={[w - 0.45, 0.016, d - 0.45]} p={[0, 0.008, 0]} c={shade(c, 0.06)} r={1} />
        </>
      )
      break
    case 'bookshelf': {
      const books = ['#b23a48', '#3d5a80', '#e0a458', '#5c946e', '#6d597a', '#f2cc8f']
      body = (
        <>
          <B s={[w, h, 0.02]} p={[0, h / 2, -d / 2 + 0.01]} c={shade(c, -0.1)} />
          {[-1, 1].map((k) => <B key={k} s={[0.03, h, d]} p={[k * (w / 2 - 0.015), h / 2, 0]} c={c} />)}
          {[0, 1, 2, 3, 4, 5].map((i) => <B key={i} s={[w, 0.03, d]} p={[0, 0.02 + i * (h / 5.2), 0]} c={c} />)}
          {[0, 1, 2, 3, 4].flatMap((i) =>
            Array.from({ length: 7 }, (_, j) => {
              const bh = 0.2 + ((i * 7 + j) % 3) * 0.04
              return (
                <B key={`${i}-${j}`} s={[0.08, bh, d - 0.08]} p={[-w / 2 + 0.1 + j * 0.115, 0.035 + i * (h / 5.2) + bh / 2, 0]} c={books[(i + j * 2) % books.length]} r={0.9} />
              )
            }),
          )}
        </>
      )
      break
    }
    case 'bedq':
    case 'beds':
      body = <Bed w={w} d={d} c={c} />
      break
    case 'wardrobe':
      body = (
        <>
          <B s={[w, h, d]} p={[0, h / 2, 0]} c={c} r={0.6} />
          {[-w / 6, w / 6].map((x) => <B key={x} s={[0.01, h - 0.1, 0.01]} p={[x, h / 2, d / 2 + 0.003]} c={shade(c, -0.2)} />)}
          {[-w / 6 - 0.04, -w / 6 + 0.04, w / 6 - 0.04, w / 6 + 0.04].map((x) => <B key={x} s={[0.015, 0.25, 0.03]} p={[x, 1.1, d / 2 + 0.015]} c={METAL} m={0.8} r={0.3} />)}
        </>
      )
      break
    case 'nightstand':
    case 'dresser':
      body = (
        <>
          <B s={[w, h, d]} p={[0, h / 2, 0]} c={c} />
          {[0.33, 0.66].map((f) => <B key={f} s={[w - 0.06, 0.01, 0.01]} p={[0, h * f, d / 2 + 0.003]} c={shade(c, -0.25)} />)}
          {kind === 'nightstand' && (
            <>
              <Cyl rt={0.06} rb={0.08} h={0.25} p={[0, h + 0.125, 0]} c="#d8cfc4" />
              <Cyl rt={0.08} rb={0.12} h={0.16} p={[0, h + 0.3, 0]} c="#fff4d6" e="#ffcf80" />
            </>
          )}
          {kind === 'dresser' && <B s={[0.7, 0.9, 0.03]} p={[0, h + 0.5, -d / 2 + 0.03]} c="#cfe3ee" r={0.05} m={0.6} />}
        </>
      )
      break
    case 'dining6':
    case 'dining4': {
      const per = kind === 'dining6' ? 3 : 2
      const chairs: ReactNode[] = []
      for (let i = 0; i < per; i++) {
        const x = -w / 2 + (w / per) * (i + 0.5)
        chairs.push(<Chair key={`a${i}`} c={shade(c, -0.1)} p={[x, 0, -d / 2 - 0.18]} />)
        chairs.push(<Chair key={`b${i}`} c={shade(c, -0.1)} p={[x, 0, d / 2 + 0.18]} ry={Math.PI} />)
      }
      body = (
        <>
          <Legs w={w} d={d} h={0.72} inset={0.1} t={0.07} c={c} />
          <B s={[w, 0.05, d]} p={[0, 0.745, 0]} c={c} r={0.35} />
          <Cyl rt={0.08} rb={0.06} h={0.12} p={[0, 0.83, 0]} c="#f1e3c8" />
          {chairs}
        </>
      )
      break
    }
    case 'chair':
      body = <Chair c={c} />
      break
    case 'counter':
      body = <Counter w={w} d={d} c={c} />
      break
    case 'island':
      body = <Counter w={w} d={d} c={c} island />
      break
    case 'fridge':
      body = (
        <>
          <B s={[w, h, d]} p={[0, h / 2, 0]} c={c} r={0.3} m={0.4} />
          <B s={[w - 0.02, 0.01, 0.01]} p={[0, 1.2, d / 2 + 0.003]} c="#666" />
          <B s={[0.03, 0.4, 0.04]} p={[w / 2 - 0.08, 1.45, d / 2 + 0.02]} c={METAL} m={0.9} r={0.2} />
          <B s={[0.03, 0.5, 0.04]} p={[w / 2 - 0.08, 0.8, d / 2 + 0.02]} c={METAL} m={0.9} r={0.2} />
        </>
      )
      break
    case 'toilet':
      body = (
        <>
          <B s={[w, 0.4, 0.18]} p={[0, 0.6, -d / 2 + 0.09]} c={c} r={0.15} />
          <Cyl rt={0.19} rb={0.15} h={0.4} p={[0, 0.2, 0.08]} c={c} r={0.15} />
          <Cyl rt={0.2} rb={0.2} h={0.03} p={[0, 0.415, 0.08]} c="#eee" r={0.2} />
        </>
      )
      break
    case 'vanity':
      body = (
        <>
          <B s={[w, 0.8, d]} p={[0, 0.4, 0]} c={c} />
          <B s={[w + 0.02, 0.04, d + 0.02]} p={[0, 0.82, 0]} c="#f5f5f5" r={0.2} />
          <Cyl rt={0.17} rb={0.13} h={0.1} p={[0, 0.88, 0.02]} c="#ffffff" r={0.1} />
          <B s={[0.6, 0.75, 0.02]} p={[0, 1.55, -d / 2 + 0.01]} c="#d6ecf5" r={0.02} m={0.7} />
        </>
      )
      break
    case 'shower':
      body = (
        <>
          <B s={[w, 0.06, d]} p={[0, 0.03, 0]} c="#f4f4f4" r={0.2} />
          <B s={[w, h, 0.01]} p={[0, h / 2, d / 2]} c={c} o={0.25} r={0.05} />
          <B s={[0.01, h, d]} p={[w / 2, h / 2, 0]} c={c} o={0.25} r={0.05} />
          <Cyl rt={0.1} rb={0.1} h={0.02} p={[-w / 4, 1.95, -d / 4]} c={METAL} />
        </>
      )
      break
    case 'tub':
      body = (
        <>
          <B s={[w, h, d]} p={[0, h / 2, 0]} c={c} r={0.15} />
          <B s={[w - 0.12, 0.02, d - 0.12]} p={[0, h + 0.001, 0]} c="#bfe3f2" r={0.05} />
        </>
      )
      break
    case 'desk':
      body = (
        <>
          <B s={[w, 0.04, d]} p={[0, h - 0.02, 0]} c={c} r={0.5} />
          {[-1, 1].map((k) => <B key={k} s={[0.04, h - 0.04, d - 0.04]} p={[k * (w / 2 - 0.02), (h - 0.04) / 2, 0]} c={shade(c, -0.15)} />)}
          <B s={[0.5, 0.32, 0.03]} p={[0, h + 0.22, -d / 2 + 0.12]} c="#1a1a1a" r={0.3} />
          <B s={[0.08, 0.06, 0.08]} p={[0, h + 0.03, -d / 2 + 0.12]} c="#333" />
        </>
      )
      break
    case 'officechair':
      body = (
        <>
          <Cyl rt={0.28} rb={0.28} h={0.04} p={[0, 0.06, 0]} c="#222" seg={5} />
          <Cyl rt={0.03} rb={0.03} h={0.38} p={[0, 0.26, 0]} c={METAL} />
          <B s={[0.5, 0.08, 0.48]} p={[0, 0.48, 0]} c={c} r={0.9} />
          <B s={[0.46, 0.55, 0.06]} p={[0, 0.82, -0.22]} c={c} r={0.9} />
        </>
      )
      break
    case 'plant':
      body = (
        <>
          <Cyl rt={0.2} rb={0.15} h={0.38} p={[0, 0.19, 0]} c="#b5651d" r={0.8} />
          {[
            [0, 0.75, 0, 0.3],
            [0.12, 0.95, 0.05, 0.22],
            [-0.1, 1.05, -0.06, 0.2],
            [0.02, 1.2, 0.08, 0.16],
          ].map(([x, y, z, s], i) => (
            <mesh key={i} position={[x, y, z]} castShadow>
              <icosahedronGeometry args={[s, 0]} />
              <meshStandardMaterial color={i % 2 ? shade(c, -0.1) : c} roughness={0.8} flatShading />
            </mesh>
          ))}
          <Cyl rt={0.02} rb={0.025} h={0.5} p={[0, 0.6, 0]} c="#5d4037" />
        </>
      )
      break
    case 'lamp':
      body = (
        <>
          <Cyl rt={0.16} rb={0.16} h={0.03} p={[0, 0.015, 0]} c="#333" />
          <Cyl rt={0.015} rb={0.015} h={1.35} p={[0, 0.7, 0]} c="#333" />
          <Cyl rt={0.13} rb={0.2} h={0.28} p={[0, 1.45, 0]} c={c} e="#ffcf7a" />
        </>
      )
      break
    case 'mandir':
      body = (
        <>
          <B s={[w, 0.8, d]} p={[0, 0.4, 0]} c={shade(c, -0.15)} />
          <B s={[w, 0.8, 0.05]} p={[0, 1.2, -d / 2 + 0.025]} c={c} m={0.3} r={0.4} />
          {[-1, 1].map((k) => <B key={k} s={[0.08, 0.8, d - 0.1]} p={[k * (w / 2 - 0.04), 1.2, -0.05]} c={c} m={0.3} r={0.4} />)}
          <B s={[w + 0.06, 0.1, d]} p={[0, 1.65, -0.0]} c={c} m={0.3} r={0.4} />
          <Cyl rt={0.03} rb={0.04} h={0.04} p={[0, 0.84, 0.1]} c="#ffb74d" e="#ff9800" />
        </>
      )
      break
    default:
      body = <B s={[w, h, d]} p={[0, h / 2, 0]} c={c} />
  }
  return <>{body}</>
}

export default memo(Model)

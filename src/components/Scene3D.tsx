import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Line, OrbitControls, Sky } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useStore } from '../store'
import { buildBeams, buildColumns, buildWalls, bearingToVec, EXT_T, INT_T, LINTEL, PLINTH, SILL, type WallSegment } from '../walls'
import { sunPosition, sunVector } from '../sun'
import { floorTexture, grassTexture, roofTexture } from '../textures'
import FurnitureModel, { StyleCtx } from './FurnitureModel'
import { CATALOG_MAP } from '../catalog'
import { elevation, floorToFloor, lvl, onLevel } from '../levels'
import { STYLES, type StyleDef } from '../styles'
import type { Furniture, Project, Room } from '../types'
import { currentGL, registerGL } from '../render'

const ACCENT = '#e07a3f'
const EYE = 1.6

function useSun() {
  const plot = useStore((s) => s.project.plot)
  const { date, minutes } = useStore((s) => s.sun)
  return useMemo(() => {
    const pos = sunPosition(plot, date, minutes)
    return { pos, vec: sunVector(plot, pos) }
  }, [plot, date, minutes])
}

function Lights({ size }: { size: number }) {
  const { pos, vec } = useSun()
  const light = useRef<THREE.DirectionalLight>(null)
  const day = Math.max(0, Math.sin(pos.altitude))
  const golden = Math.min(1, day * 3)
  const color = new THREE.Color().lerpColors(new THREE.Color('#ffb070'), new THREE.Color('#fff7ea'), golden)
  const R = 60
  useEffect(() => {
    light.current?.shadow.camera.updateProjectionMatrix()
  }, [size])
  return (
    <>
      <hemisphereLight args={['#dbe9ff', '#8a7a62', 0.15 + day * 0.55]} />
      <ambientLight intensity={0.1 + (day > 0 ? 0.1 : 0.04)} />
      <directionalLight
        ref={light}
        position={[vec[0] * R, Math.max(vec[1], 0.01) * R, vec[2] * R]}
        intensity={pos.altitude > 0 ? 0.6 + day * 2.6 : 0}
        color={color}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-size}
        shadow-camera-right={size}
        shadow-camera-top={size}
        shadow-camera-bottom={-size}
        shadow-camera-near={1}
        shadow-camera-far={140}
      />
      {pos.altitude > -0.05 ? (
        <Sky sunPosition={[vec[0] * 100, vec[1] * 100, vec[2] * 100]} turbidity={6} rayleigh={1.6} mieCoefficient={0.006} mieDirectionalG={0.85} distance={4500} />
      ) : (
        <color attach="background" args={['#0d1424']} />
      )}
    </>
  )
}

function SunPath({ radius }: { radius: number }) {
  const plot = useStore((s) => s.project.plot)
  const date = useStore((s) => s.sun.date)
  const { vec, pos } = useSun()
  const pts = useMemo(() => {
    const out: [number, number, number][] = []
    for (let m = 0; m <= 1440; m += 10) {
      const s = sunPosition(plot, date, m)
      if (s.altitude > 0) {
        const v = sunVector(plot, s)
        out.push([v[0] * radius, v[1] * radius, v[2] * radius])
      }
    }
    return out
  }, [plot, date, radius])
  return (
    <>
      {pts.length > 1 && <Line points={pts} color="#ffb300" lineWidth={2} dashed dashSize={0.6} gapSize={0.4} />}
      {pos.altitude > 0 && (
        <mesh position={[vec[0] * radius, vec[1] * radius, vec[2] * radius]}>
          <sphereGeometry args={[0.6, 24, 24]} />
          <meshBasicMaterial color="#ffd54f" />
        </mesh>
      )}
    </>
  )
}

function Compass({ radius }: { radius: number }) {
  const northDeg = useStore((s) => s.project.plot.northDeg)
  return (
    <>
      {(['N', 'E', 'S', 'W'] as const).map((l, i) => {
        const [x, z] = bearingToVec(northDeg + i * 90)
        return (
          <Html key={l} position={[x * radius, 0.05, z * radius]} center zIndexRange={[10, 0]}>
            <div className={`compass-label ${l === 'N' ? 'north' : ''}`}>{l}</div>
          </Html>
        )
      })}
    </>
  )
}

// ---------- geometry helpers ----------
type Ctx = { W: number; D: number }
const toShapePt = (c: Ctx, x: number, y: number) => new THREE.Vector2(x - c.W / 2, -(y - c.D / 2))

function stairPolygon(f: Furniture): [number, number][] {
  const def = CATALOG_MAP[f.kind]
  const a = (f.rot * Math.PI) / 180
  return [
    [-def.w / 2 - 0.05, -def.d / 2 - 0.05],
    [def.w / 2 + 0.05, -def.d / 2 - 0.05],
    [def.w / 2 + 0.05, def.d / 2 + 0.05],
    [-def.w / 2 - 0.05, def.d / 2 + 0.05],
  ].map(([lx, ly]) => [f.x + lx * Math.cos(a) - ly * Math.sin(a), f.y + lx * Math.sin(a) + ly * Math.cos(a)])
}

function roomShape(c: Ctx, r: Room, holes: [number, number][][]) {
  const s = new THREE.Shape([toShapePt(c, r.x, r.y), toShapePt(c, r.x + r.w, r.y), toShapePt(c, r.x + r.w, r.y + r.d), toShapePt(c, r.x, r.y + r.d)])
  for (const h of holes) {
    const clamped = h.map(([x, y]) => toShapePt(c, Math.min(r.x + r.w - 0.01, Math.max(r.x + 0.01, x)), Math.min(r.y + r.d - 0.01, Math.max(r.y + 0.01, y))))
    s.holes.push(new THREE.Path(clamped))
  }
  return s
}

function Floor({ room, c, base, holes, slab, selected }: { room: Room; c: Ctx; base: number; holes: [number, number][][]; slab: number | null; selected: boolean }) {
  const { select, set } = useStore.getState()
  const mine = holes.filter((h) => {
    const cx = h.reduce((s, p) => s + p[0], 0) / h.length
    const cy = h.reduce((s, p) => s + p[1], 0) / h.length
    return cx > room.x && cx < room.x + room.w && cy > room.y && cy < room.y + room.d
  })
  const key = JSON.stringify(mine)
  const { geo, slabGeo } = useMemo(() => {
    const shape = roomShape(c, room, mine)
    return { geo: new THREE.ShapeGeometry(shape), slabGeo: slab ? new THREE.ExtrudeGeometry(shape, { depth: slab, bevelEnabled: false }) : null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.x, room.y, room.w, room.d, key, slab, c.W, c.D])
  const tex = useMemo(() => {
    const t = floorTexture(room.floor).clone()
    const tile = room.floor === 'wood' ? 1.2 : 0.6
    t.repeat.set(1 / tile, 1 / tile)
    t.needsUpdate = true
    return t
  }, [room.floor])
  useEffect(() => () => {
    geo.dispose()
    slabGeo?.dispose()
  }, [geo, slabGeo])
  useEffect(() => () => tex.dispose(), [tex])
  const W = c.W, D = c.D
  return (
    <group>
      {slabGeo && (
        <mesh geometry={slabGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, base - (slab ?? 0), 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#c9c4ba" roughness={1} />
        </mesh>
      )}
      <mesh
        geometry={geo}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, base + 0.012, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation()
          set({ activeLevel: lvl(room) })
          select({ type: 'room', id: room.id })
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          set({ camView: { roomId: room.id, x: e.point.x + W / 2, y: e.point.z + D / 2, level: lvl(room) } })
        }}
      >
        <meshStandardMaterial map={tex} roughness={room.floor === 'marble' ? 0.25 : room.floor === 'tile' ? 0.4 : 0.75} side={THREE.DoubleSide} />
      </mesh>
      {selected && (
        <Line
          points={[
            [room.x - W / 2, base + 0.03, room.y - D / 2],
            [room.x + room.w - W / 2, base + 0.03, room.y - D / 2],
            [room.x + room.w - W / 2, base + 0.03, room.y + room.d - D / 2],
            [room.x - W / 2, base + 0.03, room.y + room.d - D / 2],
            [room.x - W / 2, base + 0.03, room.y - D / 2],
          ]}
          color={ACCENT}
          lineWidth={3}
        />
      )}
    </group>
  )
}

function Wall({ seg, p, c, H, base, cut, st, parapet }: { seg: WallSegment; p: Project; c: Ctx; H: number; base: number; cut: boolean; st: StyleDef; parapet: boolean }) {
  const t = seg.exterior ? EXT_T : INT_T
  const ext = seg.type === 'wall' ? t / 2 : 0
  const L = seg.end - seg.start + ext * 2
  const mid = (seg.start + seg.end) / 2
  const [cx, cz] = seg.orient === 'h' ? [mid - c.W / 2, seg.fixed - c.D / 2] : [seg.fixed - c.W / 2, mid - c.D / 2]
  const room = p.rooms.find((r) => r.id === seg.roomIds[0])
  const color = seg.exterior ? st.exterior : (room?.wallColor ?? '#f5f1ea')
  const full = parapet ? 1.05 : H
  const top = cut ? Math.min(full, 1.2) : full
  const select = useStore((s) => s.select)
  const piece = (y0: number, y1: number, key: string, col = color) =>
    y1 > y0 ? (
      <mesh key={key} position={[cx, base + (y0 + y1) / 2, cz]} castShadow receiveShadow>
        <boxGeometry args={seg.orient === 'h' ? [L, y1 - y0, t] : [t, y1 - y0, L]} />
        <meshStandardMaterial color={col} roughness={0.9} />
      </mesh>
    ) : null
  const onClick = seg.openingId
    ? (e: { stopPropagation: () => void }) => {
        e.stopPropagation()
        select({ type: 'opening', id: seg.openingId! })
      }
    : undefined

  if (seg.type === 'wall')
    return (
      <>
        {piece(0, top, 'w')}
        {parapet && !cut && piece(top, top + 0.06, 'cap', st.trim)}
      </>
    )

  const gTop = Math.min(top, LINTEL)
  const nv = seg.normalBearing != null ? bearingToVec(seg.normalBearing) : null
  // door leaf swings into the room (matches the 2D plan symbol)
  const nb = seg.normalBearing != null ? (seg.normalBearing + 180) % 360 : seg.orient === 'h' ? 180 : 90
  const [lx, ly] = bearingToVec(nb)
  const Lm = seg.end - seg.start
  return (
    <group onClick={onClick}>
      {seg.type === 'window' && piece(0, Math.min(SILL, top), 's')}
      {piece(LINTEL, top, 'h')}
      {seg.type === 'window' && top > SILL && (
        <>
          <mesh position={[cx, base + (SILL + gTop) / 2, cz]}>
            <boxGeometry args={seg.orient === 'h' ? [L, gTop - SILL, 0.02] : [0.02, gTop - SILL, L]} />
            <meshPhysicalMaterial color="#a9d8f2" transparent opacity={0.25} roughness={0.05} metalness={0.1} />
          </mesh>
          {[SILL, gTop].map((y) => (
            <mesh key={y} position={[cx, base + y, cz]}>
              <boxGeometry args={seg.orient === 'h' ? [L, 0.05, t * 0.6] : [t * 0.6, 0.05, L]} />
              <meshStandardMaterial color={st.trim} />
            </mesh>
          ))}
          {[-L / 2 + 0.025, 0, L / 2 - 0.025].map((o) => (
            <mesh key={o} position={seg.orient === 'h' ? [cx + o, base + (SILL + gTop) / 2, cz] : [cx, base + (SILL + gTop) / 2, cz + o]}>
              <boxGeometry args={seg.orient === 'h' ? [0.045, gTop - SILL, t * 0.6] : [t * 0.6, gTop - SILL, 0.045]} />
              <meshStandardMaterial color={st.trim} />
            </mesh>
          ))}
        </>
      )}
      {seg.type === 'door' && top >= LINTEL && (
        <>
          <mesh position={[cx, base + LINTEL - 0.03, cz]}>
            <boxGeometry args={seg.orient === 'h' ? [L, 0.06, t + 0.02] : [t + 0.02, 0.06, L]} />
            <meshStandardMaterial color={st.door} />
          </mesh>
          {/* open leaf */}
          <mesh
            position={
              seg.orient === 'h'
                ? [seg.start + 0.03 - c.W / 2, base + 1.02, seg.fixed + (ly * Lm) / 2 - c.D / 2]
                : [seg.fixed + (lx * Lm) / 2 - c.W / 2, base + 1.02, seg.start + 0.03 - c.D / 2]
            }
            castShadow
          >
            <boxGeometry args={seg.orient === 'h' ? [0.04, 2.04, Lm - 0.04] : [Lm - 0.04, 2.04, 0.04]} />
            <meshStandardMaterial color={st.door} roughness={0.55} />
          </mesh>
        </>
      )}
      {seg.exterior && nv && !cut && !parapet && (
        <mesh position={[cx + nv[0] * (t / 2 + 0.3), base + LINTEL + 0.08, cz + nv[1] * (t / 2 + 0.3)]} rotation={st.roof === 'pitched' ? (seg.orient === 'h' ? [nv[1] * 0.25, 0, 0] : [0, 0, -nv[0] * 0.25]) : [0, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={seg.orient === 'h' ? [L + 0.3, 0.07, 0.6] : [0.6, 0.07, L + 0.3]} />
          <meshStandardMaterial color={st.chajja} roughness={0.9} />
        </mesh>
      )}
    </group>
  )
}

function Foundation({ p, c, skeleton }: { p: Project; c: Ctx; skeleton: boolean }) {
  const g = useMemo(() => onLevel(p, 0), [p])
  const beams = useMemo(() => buildBeams(g), [g])
  const cols = useMemo(() => buildColumns(g), [g])
  return (
    <group>
      {cols.map((col, i) => (
        <group key={i} position={[col.x - c.W / 2, 0, col.y - c.D / 2]}>
          <mesh position={[0, 0.05, 0]} receiveShadow castShadow>
            <boxGeometry args={[1.2, 0.1, 1.2]} />
            <meshStandardMaterial color="#a7a59f" roughness={1} />
          </mesh>
          <mesh position={[0, PLINTH / 2 + 0.05, 0]} castShadow>
            <boxGeometry args={[0.3, PLINTH, 0.3]} />
            <meshStandardMaterial color="#8f8c86" roughness={1} />
          </mesh>
          {skeleton && (
            <mesh position={[0, PLINTH + p.wallHeight / 2, 0]} castShadow>
              <boxGeometry args={[0.23, p.wallHeight, 0.23]} />
              <meshStandardMaterial color="#9c9993" roughness={1} />
            </mesh>
          )}
        </group>
      ))}
      {beams.map((b) => {
        const t = b.exterior ? EXT_T : INT_T
        const L = b.end - b.start + t
        const mid = (b.start + b.end) / 2
        const [cx, cz] = b.orient === 'h' ? [mid - c.W / 2, b.fixed - c.D / 2] : [b.fixed - c.W / 2, mid - c.D / 2]
        return (
          <mesh key={b.key} position={[cx, PLINTH - 0.15, cz]} castShadow receiveShadow>
            <boxGeometry args={b.orient === 'h' ? [L, 0.3, t + 0.02] : [t + 0.02, 0.3, L]} />
            <meshStandardMaterial color="#8a8780" roughness={1} />
          </mesh>
        )
      })}
    </group>
  )
}

function Roof({ p, level, c, st }: { p: Project; level: number; c: Ctx; st: StyleDef }) {
  const lp = useMemo(() => onLevel(p, level), [p, level])
  const top = elevation(p, level) + p.wallHeight
  const ext = useMemo(() => buildWalls(lp).filter((s) => s.exterior && !lp.rooms.find((r) => r.id === s.roomIds[0] && r.type === 'balcony')), [lp])
  const covered = lp.rooms.filter((r) => r.type !== 'balcony')
  const pitched = useMemo(() => {
    if (st.roof !== 'pitched' || !covered.length) return null
    const x0 = Math.min(...covered.map((r) => r.x)), x1 = Math.max(...covered.map((r) => r.x + r.w))
    const y0 = Math.min(...covered.map((r) => r.y)), y1 = Math.max(...covered.map((r) => r.y + r.d))
    const o = 0.55
    const alongX = x1 - x0 >= y1 - y0
    const span = (alongX ? y1 - y0 : x1 - x0) + 2 * o
    const len = (alongX ? x1 - x0 : y1 - y0) + 2 * o
    const rise = (span / 2) * Math.tan((24 * Math.PI) / 180)
    const tri = new THREE.Shape([new THREE.Vector2(-span / 2, 0), new THREE.Vector2(span / 2, 0), new THREE.Vector2(0, rise)])
    const geo = new THREE.ExtrudeGeometry(tri, { depth: len, bevelEnabled: false })
    const cx = (x0 + x1) / 2 - c.W / 2, cz = (y0 + y1) / 2 - c.D / 2
    return { geo, alongX, len, cx, cz }
  }, [st.roof, covered, c.W, c.D])
  useEffect(() => () => pitched?.geo.dispose(), [pitched])
  const tiles = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: 0.85 })
    return [new THREE.MeshStandardMaterial({ color: st.exterior, roughness: 0.95 }), m]
  }, [st.exterior])

  return (
    <group>
      {covered.map((r) => (
        <mesh key={r.id} position={[r.x + r.w / 2 - c.W / 2, top + p.slabThickness / 2, r.y + r.d / 2 - c.D / 2]} castShadow receiveShadow>
          <boxGeometry args={[r.w + 0.23 + (st.roof === 'cornice' ? 0.5 : 0), p.slabThickness, r.d + 0.23 + (st.roof === 'cornice' ? 0.5 : 0)]} />
          <meshStandardMaterial color={st.roofColor} roughness={1} />
        </mesh>
      ))}
      {st.roof === 'cornice' &&
        covered.map((r) => (
          <mesh key={`c${r.id}`} position={[r.x + r.w / 2 - c.W / 2, top - 0.12, r.y + r.d / 2 - c.D / 2]} castShadow>
            <boxGeometry args={[r.w + 0.45, 0.16, r.d + 0.45]} />
            <meshStandardMaterial color={st.trim} roughness={0.8} />
          </mesh>
        ))}
      {(st.roof === 'flat-parapet' || st.roof === 'cornice') &&
        ext.map((s) => {
          const L = s.end - s.start + EXT_T
          const mid = (s.start + s.end) / 2
          const [cx, cz] = s.orient === 'h' ? [mid - c.W / 2, s.fixed - c.D / 2] : [s.fixed - c.W / 2, mid - c.D / 2]
          const h = st.roof === 'cornice' ? 0.7 : 0.9
          const yb = top + p.slabThickness
          return (
            <group key={s.key + 'pp'}>
              <mesh position={[cx, yb + h / 2, cz]} castShadow receiveShadow>
                <boxGeometry args={s.orient === 'h' ? [L, h, 0.15] : [0.15, h, L]} />
                <meshStandardMaterial color={st.exterior} roughness={0.9} />
              </mesh>
              <mesh position={[cx, yb + h + 0.03, cz]}>
                <boxGeometry args={s.orient === 'h' ? [L + 0.04, 0.06, 0.22] : [0.22, 0.06, L + 0.04]} />
                <meshStandardMaterial color={st.roof === 'cornice' ? st.trim : '#3a3d42'} roughness={0.6} />
              </mesh>
            </group>
          )
        })}
      {pitched && (
        <mesh
          geometry={pitched.geo}
          material={tiles}
          position={pitched.alongX ? [pitched.cx - pitched.len / 2, top + p.slabThickness, pitched.cz] : [pitched.cx, top + p.slabThickness, pitched.cz - pitched.len / 2]}
          rotation={pitched.alongX ? [0, Math.PI / 2, 0] : [0, 0, 0]}
          castShadow
          receiveShadow
        />
      )}
    </group>
  )
}

function Ceiling({ p, level, c }: { p: Project; level: number; c: Ctx }) {
  const rooms = p.rooms.filter((r) => lvl(r) === level && r.type !== 'balcony')
  const y = elevation(p, level) + p.wallHeight - 0.005
  return (
    <>
      {rooms.map((r) => (
        <group key={r.id}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[r.x + r.w / 2 - c.W / 2, y, r.y + r.d / 2 - c.D / 2]} receiveShadow>
            <planeGeometry args={[r.w, r.d]} />
            <meshStandardMaterial color="#f7f5f0" roughness={1} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[r.x + r.w / 2 - c.W / 2, y - 0.01, r.y + r.d / 2 - c.D / 2]}>
            <circleGeometry args={[0.22, 24]} />
            <meshStandardMaterial color="#fff6e0" emissive="#ffe8b0" emissiveIntensity={1.2} />
          </mesh>
        </group>
      ))}
    </>
  )
}

function InteriorLights({ p, level, c }: { p: Project; level: number; c: Ctx }) {
  const { pos } = useSun()
  const night = pos.altitude < 0.15
  const rooms = p.rooms.filter((r) => lvl(r) === level && r.type !== 'balcony').slice(0, 8)
  const y = elevation(p, level) + p.wallHeight - 0.35
  return (
    <>
      {rooms.map((r) => (
        <pointLight key={r.id} position={[r.x + r.w / 2 - c.W / 2, y, r.y + r.d / 2 - c.D / 2]} intensity={night ? 7 : 2.2} distance={Math.max(r.w, r.d) * 1.6} decay={2} color="#ffe6c2" />
      ))}
    </>
  )
}

function Level({ p, level, c, st, showShell, cut, holes, topVisible }: { p: Project; level: number; c: Ctx; st: StyleDef; showShell: boolean; cut: boolean; holes: [number, number][][]; topVisible: boolean }) {
  const lp = useMemo(() => onLevel(p, level), [p, level])
  const walls = useMemo(() => buildWalls(lp), [lp])
  const sel = useStore((s) => s.selection)
  const layers = useStore((s) => s.layers)
  const { select, set } = useStore.getState()
  const base = elevation(p, level)
  const f2f = floorToFloor(p)
  const balconies = new Set(lp.rooms.filter((r) => r.type === 'balcony').map((r) => r.id))
  return (
    <group>
      {lp.rooms.map((r) => (
        <group key={r.id}>
          {level === 0 && showShell && (
            <mesh position={[r.x + r.w / 2 - c.W / 2, PLINTH / 2, r.y + r.d / 2 - c.D / 2]} receiveShadow castShadow>
              <boxGeometry args={[r.w + 0.02, PLINTH, r.d + 0.02]} />
              <meshStandardMaterial color={st.plinth} roughness={1} />
            </mesh>
          )}
          {(showShell || level === 0) && (
            <Floor room={r} c={c} base={base} holes={holes} slab={level > 0 ? p.slabThickness : null} selected={sel?.type === 'room' && sel.id === r.id} />
          )}
        </group>
      ))}
      {showShell &&
        walls.map((s) => (
          <Wall key={s.key + s.type} seg={s} p={lp} c={c} H={p.wallHeight} base={base} cut={cut && topVisible} st={st} parapet={s.exterior && balconies.has(s.roomIds[0])} />
        ))}
      {layers.furniture &&
        lp.furniture.map((f) => {
          const def = CATALOG_MAP[f.kind]
          const selected = sel?.type === 'furniture' && sel.id === f.id
          const outside = f.kind.startsWith('stair') && !lp.rooms.some((r) => f.x > r.x && f.x < r.x + r.w && f.y > r.y && f.y < r.y + r.d)
          const yb = outside && level === 0 ? 0 : base + 0.02
          return (
            <group
              key={f.id}
              position={[f.x - c.W / 2, yb, f.y - c.D / 2]}
              rotation={[0, (-f.rot * Math.PI) / 180, 0]}
              onClick={(e) => {
                e.stopPropagation()
                set({ activeLevel: level })
                select({ type: 'furniture', id: f.id })
              }}
            >
              <FurnitureModel kind={f.kind} color={f.color} f2f={outside && level === 0 ? f2f + PLINTH : f2f} />
              {selected && def && (
                <Line
                  points={[
                    [-def.w / 2 - 0.05, 0.02, -def.d / 2 - 0.05],
                    [def.w / 2 + 0.05, 0.02, -def.d / 2 - 0.05],
                    [def.w / 2 + 0.05, 0.02, def.d / 2 + 0.05],
                    [-def.w / 2 - 0.05, 0.02, def.d / 2 + 0.05],
                    [-def.w / 2 - 0.05, 0.02, -def.d / 2 - 0.05],
                  ]}
                  color={ACCENT}
                  lineWidth={3}
                />
              )}
            </group>
          )
        })}
    </group>
  )
}

function House() {
  const p = useStore((s) => s.project)
  const layers = useStore((s) => s.layers)
  const activeLevel = useStore((s) => s.activeLevel)
  const camView = useStore((s) => s.camView)
  const st = STYLES[p.style ?? 'modern']
  const c = useMemo(() => ({ W: p.plot.width, D: p.plot.depth }), [p.plot.width, p.plot.depth])
  const last = p.levels.length - 1
  const maxLevel = camView ? last : Math.min(activeLevel, last)
  const showShell = layers.walls || !!camView
  const cut = layers.cutaway && !camView
  const W = c.W, D = c.D
  // stair openings: stairs on level L cut the floor slab of level L+1
  const holesFor = (level: number) =>
    level === 0 ? [] : p.furniture.filter((f) => f.kind.startsWith('stair') && lvl(f) === level - 1).map(stairPolygon)

  return (
    <StyleCtx.Provider value={st}>
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
          <planeGeometry args={[W, D]} />
          <meshStandardMaterial color="#b9b29e" roughness={1} />
        </mesh>
        <Line
          points={[
            [-W / 2, 0.02, -D / 2],
            [W / 2, 0.02, -D / 2],
            [W / 2, 0.02, D / 2],
            [-W / 2, 0.02, D / 2],
            [-W / 2, 0.02, -D / 2],
          ]}
          color="#ffffff"
          lineWidth={2}
          dashed
          dashSize={0.5}
          gapSize={0.3}
        />
        {layers.foundation && !camView && <Foundation p={p} c={c} skeleton={!showShell} />}
        {p.levels.map((_, i) =>
          i <= maxLevel ? <Level key={i} p={p} level={i} c={c} st={st} showShell={showShell} cut={cut} holes={holesFor(i)} topVisible={i === maxLevel} /> : null,
        )}
        {showShell && (camView || (layers.roof && !cut)) && maxLevel === last && <Roof p={p} level={last} c={c} st={st} />}
        {camView && (
          <>
            <Ceiling p={p} level={camView.level} c={c} />
            <InteriorLights p={p} level={camView.level} c={c} />
          </>
        )}
      </group>
    </StyleCtx.Provider>
  )
}

function CameraRig() {
  const camView = useStore((s) => s.camView)
  const p = useStore((s) => s.project)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null
  const anim = useRef<{ fp: THREE.Vector3; ft: THREE.Vector3; tp: THREE.Vector3; tt: THREE.Vector3; t: number } | null>(null)
  const W = p.plot.width, D = p.plot.depth

  useEffect(() => {
    if (!controls) return
    let tp: THREE.Vector3, tt: THREE.Vector3
    if (camView) {
      const y = elevation(p, camView.level) + EYE
      tp = new THREE.Vector3(camView.x - W / 2, y, camView.y - D / 2)
      const look = camView.look ?? { x: camView.x, y: camView.y - 1 }
      const dir = new THREE.Vector3(look.x - camView.x, 0, look.y - camView.y)
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1)
      dir.normalize()
      tt = tp.clone().addScaledVector(dir, 0.05)
      controls.enableZoom = false
      controls.enablePan = false
      controls.rotateSpeed = -0.35
      controls.minDistance = 0.01
      controls.maxPolarAngle = Math.PI - 0.15
      camera.fov = 72
    } else {
      tp = new THREE.Vector3(W * 0.9, D * 1.0 + 6, D * 1.1)
      tt = new THREE.Vector3(0, 1 + elevation(p, useStore.getState().activeLevel) * 0.5, 0)
      controls.enableZoom = true
      controls.enablePan = true
      controls.rotateSpeed = 1
      controls.minDistance = 2
      controls.maxPolarAngle = Math.PI / 2 - 0.05
      camera.fov = 45
    }
    camera.updateProjectionMatrix()
    anim.current = { fp: camera.position.clone(), ft: controls.target.clone(), tp, tt, t: 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camView, controls])

  useFrame((_, dt) => {
    const a = anim.current
    if (!a || !controls) return
    a.t = Math.min(1, a.t + dt / 0.9)
    const k = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2
    camera.position.lerpVectors(a.fp, a.tp, k)
    controls.target.lerpVectors(a.ft, a.tt, k)
    controls.update()
    if (a.t >= 1) anim.current = null
  })
  return null
}

function Registrar() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    registerGL(gl)
    return () => {
      if (currentGL() === gl) registerGL(null)
    }
  }, [gl])
  return null
}

export default function Scene3D() {
  const plot = useStore((s) => s.project.plot)
  const sunPathOn = useStore((s) => s.layers.sunPath)
  const camView = useStore((s) => s.camView)
  const select = useStore((s) => s.select)
  const size = Math.max(plot.width, plot.depth) / 2 + 6
  const radius = Math.max(plot.width, plot.depth) * 0.85 + 4
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      camera={{ position: [plot.width * 0.9, plot.depth * 1.0 + 6, plot.depth * 1.1], fov: 45, near: 0.05, far: 2000 }}
      onPointerMissed={() => select(null)}
    >
      <Registrar />
      <Lights size={size} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial map={grassTexture()} roughness={1} />
      </mesh>
      <House />
      {sunPathOn && !camView && <SunPath radius={radius} />}
      {!camView && <Compass radius={Math.max(plot.width, plot.depth) / 2 + 2.5} />}
      <OrbitControls makeDefault target={[0, 1, 0]} maxPolarAngle={Math.PI / 2 - 0.05} minDistance={2} maxDistance={120} enableDamping />
      <CameraRig />
    </Canvas>
  )
}

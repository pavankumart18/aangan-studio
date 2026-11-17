import { useEffect, lazy, Suspense } from 'react'
import { useStore, uid } from './store'
import TopBar from './components/TopBar'
import LeftPanel from './components/LeftPanel'
import RightPanel from './components/RightPanel'
import PlanView from './components/PlanView'
import SunBar from './components/SunBar'
import { onLevel } from './levels'
import { roomViewpoint } from './camera'
import { ROOM_TYPE_MAP } from './catalog'
import { applyStyle } from './styles'

const Scene3D = lazy(() => import('./components/Scene3D'))

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return
      const s = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && k === 'y') return void (e.preventDefault(), s.redo())
      if (mod && k === 'd' && s.selection?.type === 'furniture') {
        e.preventDefault()
        const f = s.project.furniture.find((f) => f.id === s.selection!.id)
        if (!f) return
        const id = uid()
        s.apply((q) => void q.furniture.push({ ...f, id, x: f.x + 0.3, y: f.y + 0.3 }))
        s.select({ type: 'furniture', id })
        return
      }
      if (mod) return
      if (k === 'delete' || k === 'backspace') return void (e.preventDefault(), s.deleteSelection())
      if (k === 'escape') {
        if (s.camView) return void s.set({ camView: null })
        return void (s.select(null), s.setTool('select'))
      }
      if (k === 'pageup' || (k === ']' && !e.shiftKey)) return void s.set({ activeLevel: Math.min(s.project.levels.length - 1, s.activeLevel + 1), selection: null })
      if (k === 'pagedown' || k === '[') return void s.set({ activeLevel: Math.max(0, s.activeLevel - 1), selection: null })
      if (k === 'v') s.setTool('select')
      if (k === 'b') s.setTool('room')
      if (k === 'w') s.setTool('window')
      if (k === 'd') s.setTool('door')
      if (k === '1') s.set({ viewMode: '2d' })
      if (k === '2') s.set({ viewMode: 'split' })
      if (k === '3') s.set({ viewMode: '3d' })
      if (k === ' ') {
        e.preventDefault()
        s.setSun({ playing: !s.sun.playing })
      }
      if (k === 'r' && s.selection?.type === 'furniture') {
        const id = s.selection.id
        s.apply((q) => {
          const f = q.furniture.find((f) => f.id === id)
          if (f) f.rot = (((f.rot + (e.shiftKey ? -90 : 90)) % 360) + 360) % 360
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function LevelSwitch() {
  const levels = useStore((s) => s.project.levels)
  const active = useStore((s) => s.activeLevel)
  const set = useStore((s) => s.set)
  if (levels.length < 2) return null
  return (
    <div className="level-switch" title="Switch floor ( [ / ] )">
      {[...levels].map((l, i) => ({ l, i })).reverse().map(({ l, i }) => (
        <button key={i} className={i === active ? 'on' : ''} onClick={() => set({ activeLevel: i, selection: null })} title={l.name}>
          {i === 0 ? 'G' : i}
        </button>
      ))}
    </div>
  )
}

function ViewpointBar() {
  const p = useStore((s) => s.project)
  const camView = useStore((s) => s.camView)
  const active = useStore((s) => s.activeLevel)
  const set = useStore((s) => s.set)
  const level = camView?.level ?? active
  const rooms = onLevel(p, level).rooms
  const cur = rooms.findIndex((r) => r.id === camView?.roomId)
  const go = (i: number) => {
    const r = rooms[(i + rooms.length) % rooms.length]
    if (r) set({ camView: roomViewpoint(p, r) })
  }
  return (
    <div className={`viewpoints ${camView ? 'inside' : ''}`}>
      {camView ? (
        <>
          <button className="vp-exit" onClick={() => set({ camView: null })}>⤺ Overview</button>
          <button onClick={() => go(cur - 1)}>‹</button>
          <span className="vp-name">
            <i style={{ background: cur >= 0 ? ROOM_TYPE_MAP[rooms[cur].type].color : '#ccc' }} />
            {cur >= 0 ? rooms[cur].name : 'Free view'} · {p.levels[level]?.name}
          </span>
          <button onClick={() => go(cur + 1)}>›</button>
          <span className="vp-hint">drag to look around · double-click a floor to walk there</span>
        </>
      ) : (
        <>
          <span className="vp-label">👁 Viewpoints</span>
          {rooms.map((r) => (
            <button key={r.id} onClick={() => set({ camView: roomViewpoint(p, r) })}>
              <i style={{ background: ROOM_TYPE_MAP[r.type].color }} />
              {r.name}
            </button>
          ))}
        </>
      )}
    </div>
  )
}

export default function App() {
  const viewMode = useStore((s) => s.viewMode)
  useShortcuts()
  useEffect(() => {
    console.info(`[aangan] app mounted in ${performance.now().toFixed(0)} ms since navigation start`)
    // Deep links for demos: ?mode=3d&level=1&room=Family%20Lounge&roof=1&time=17:30&date=2026-06-21
    const q = new URLSearchParams(location.search)
    const s = useStore.getState()
    const mode = q.get('mode')
    if (mode === '2d' || mode === '3d' || mode === 'split') s.set({ viewMode: mode })
    if (q.has('level')) s.set({ activeLevel: Math.max(0, Math.min(s.project.levels.length - 1, Number(q.get('level')))) })
    if (q.get('roof') === '1' && !s.layers.roof) s.toggleLayer('roof')
    if (q.get('roof') === '0' && s.layers.roof) s.toggleLayer('roof')
    const time = q.get('time')?.match(/^(\d{1,2}):(\d{2})$/)
    if (time) s.setSun({ minutes: Number(time[1]) * 60 + Number(time[2]) })
    if (q.get('date')?.match(/^\d{4}-\d{2}-\d{2}$/)) s.setSun({ date: q.get('date')! })
    const style = q.get('style')
    if (style === 'modern' || style === 'classic' || style === 'traditional') s.apply((p) => applyStyle(p, style), false)
    const room = q.get('room')
    if (room) {
      const r = s.project.rooms.find((r) => r.name.toLowerCase() === room.toLowerCase())
      if (r) s.set({ camView: roomViewpoint(s.project, r) })
    }
  }, [])
  return (
    <div className="app">
      <TopBar />
      <div className="body">
        <LeftPanel />
        <main className={`stage ${viewMode}`}>
          <LevelSwitch />
          <div className="views">
            {viewMode !== '3d' && (
              <div className="view plan">
                <PlanView />
              </div>
            )}
            {viewMode !== '2d' && (
              <div className="view three">
                <Suspense fallback={<div className="loading">Loading 3D engine…</div>}>
                  <Scene3D />
                </Suspense>
                <ViewpointBar />
              </div>
            )}
          </div>
          <SunBar />
        </main>
        <RightPanel />
      </div>
    </div>
  )
}

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CamView, Layers, Project, RoomType, Selection, Tool, ViewMode } from './types'
import { normalize } from './levels'
import { sampleProject, blankProject } from './sample'

export const uid = () => Math.random().toString(36).slice(2, 9)
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

export type RightTab = 'inspect' | 'sun' | 'estimate'
export type LeftTab = 'build' | 'furnish'

interface SunState {
  date: string // YYYY-MM-DD
  minutes: number // local minutes since midnight
  playing: boolean
}

interface State {
  project: Project
  past: Project[]
  future: Project[]
  selection: Selection
  tool: Tool
  drawType: RoomType
  viewMode: ViewMode
  layers: Layers
  sun: SunState
  rightTab: RightTab
  leftTab: LeftTab
  vastu: boolean
  activeLevel: number
  camView: CamView

  /** Mutate the project. commit=false skips the undo checkpoint (use during drags after checkpoint()). */
  apply: (fn: (p: Project) => void, commit?: boolean) => void
  checkpoint: () => void
  undo: () => void
  redo: () => void
  loadProject: (p: Project) => void
  select: (s: Selection) => void
  setTool: (t: Tool) => void
  set: (patch: Partial<Omit<State, 'apply' | 'checkpoint' | 'undo' | 'redo' | 'loadProject' | 'select' | 'setTool' | 'set'>>) => void
  setSun: (patch: Partial<SunState>) => void
  toggleLayer: (k: keyof Layers) => void
  deleteSelection: () => void
}

const HISTORY = 80
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      project: sampleProject(),
      past: [],
      future: [],
      selection: null,
      tool: 'select',
      drawType: 'bedroom',
      viewMode: 'split',
      layers: { foundation: false, walls: true, cutaway: false, furniture: true, roof: false, sunPath: true },
      sun: { date: today(), minutes: 10 * 60, playing: false },
      rightTab: 'inspect',
      leftTab: 'build',
      vastu: true,
      activeLevel: 0,
      camView: null,

      apply: (fn, commit = true) => {
        const prev = get().project
        const next = clone(prev)
        fn(next)
        set((s) => ({
          project: next,
          past: commit ? [...s.past, prev].slice(-HISTORY) : s.past,
          future: commit ? [] : s.future,
        }))
      },
      checkpoint: () => set((s) => ({ past: [...s.past, s.project].slice(-HISTORY), future: [] })),
      undo: () => {
        const { past, project, future } = get()
        if (!past.length) return
        set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], selection: null })
      },
      redo: () => {
        const { past, project, future } = get()
        if (!future.length) return
        set({ project: future[0], future: future.slice(1), past: [...past, project], selection: null })
      },
      loadProject: (p) =>
        set((s) => ({ project: normalize(p), past: [...s.past, s.project].slice(-HISTORY), future: [], selection: null, activeLevel: 0, camView: null })),
      select: (selection) => set({ selection, rightTab: selection ? 'inspect' : get().rightTab }),
      setTool: (tool) => set({ tool }),
      set: (patch) => set(patch as Partial<State>),
      setSun: (patch) => set((s) => ({ sun: { ...s.sun, ...patch } })),
      toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
      deleteSelection: () => {
        const sel = get().selection
        if (!sel) return
        get().apply((p) => {
          if (sel.type === 'room') p.rooms = p.rooms.filter((r) => r.id !== sel.id)
          if (sel.type === 'opening') p.openings = p.openings.filter((o) => o.id !== sel.id)
          if (sel.type === 'furniture') p.furniture = p.furniture.filter((f) => f.id !== sel.id)
        })
        set({ selection: null })
      },
    }),
    {
      name: 'aangan-studio-v1',
      version: 2,
      partialize: (s) => ({ project: s.project, layers: s.layers, viewMode: s.viewMode, sun: { ...s.sun, playing: false }, vastu: s.vastu, activeLevel: s.activeLevel }),
      migrate: (persisted) => {
        const st = persisted as Partial<State>
        // v1 saves predate floors & styles: upgrade to the 2-storey sample
        return { ...st, project: st.project?.levels ? normalize(st.project) : sampleProject() } as State
      },
      merge: (persisted, current) => {
        const st = persisted as Partial<State>
        return { ...current, ...st, project: st.project ? normalize(st.project) : current.project }
      },
    },
  ),
)

export { sampleProject, blankProject }

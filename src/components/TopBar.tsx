import { useRef, useState } from 'react'
import { exportPlanPDF } from '../pdf'
import { useStore, sampleProject, blankProject } from '../store'
import { screenshot3D } from '../render'
import type { Project, ViewMode } from '../types'

const download = (href: string, name: string) => {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
}

export default function TopBar() {
  const name = useStore((s) => s.project.name)
  const viewMode = useStore((s) => s.viewMode)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const { apply, undo, redo, set, loadProject } = useStore.getState()
  const fileIn = useRef<HTMLInputElement>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const exportPdf = async () => {
    setPdfBusy(true)
    try {
      const st = useStore.getState()
      if (st.viewMode === '2d') st.set({ viewMode: 'split' })
      await new Promise((r) => setTimeout(r, st.viewMode === '2d' ? 900 : 100))
      await exportPlanPDF(useStore.getState().project, useStore.getState().sun.date, screenshot3D())
    } catch (err) {
      console.error('[aangan] PDF export failed', err)
    } finally {
      setPdfBusy(false)
    }
  }
  const slug = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()

  return (
    <header className="topbar">
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 32 32">
          <rect x="3" y="3" width="26" height="26" rx="7" fill="#e07a3f" />
          <path d="M9 22 V14 L16 9 L23 14 V22 Z" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
          <circle cx="23.5" cy="8.5" r="3" fill="#ffd54f" />
        </svg>
        <span>Aangan<em>Studio</em></span>
      </div>
      <input className="proj-name" value={name} onChange={(e) => apply((q) => void (q.name = e.target.value), false)} />
      <div className="seg">
        {(['2d', 'split', '3d'] as ViewMode[]).map((m) => (
          <button key={m} className={viewMode === m ? 'on' : ''} onClick={() => set({ viewMode: m })}>
            {m === '2d' ? 'Plan' : m === '3d' ? '3D' : 'Split'}
          </button>
        ))}
      </div>
      <div className="spacer" />
      <button className="ghost" disabled={!canUndo} onClick={undo} title="Undo (⌘Z)">↶</button>
      <button className="ghost" disabled={!canRedo} onClick={redo} title="Redo (⇧⌘Z)">↷</button>
      <div className="menu">
        <button className="ghost">Project ▾</button>
        <div className="menu-pop">
          <button onClick={() => loadProject(sampleProject())}>Load sample 2BHK</button>
          <button onClick={() => loadProject(blankProject())}>New blank plot</button>
          <hr />
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(useStore.getState().project, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              download(url, `${slug}.aangan.json`)
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            }}
          >
            Save project file
          </button>
          <button onClick={() => fileIn.current?.click()}>Open project file…</button>
        </div>
      </div>
      <button onClick={exportPdf} disabled={pdfBusy} title="A3 drawings with dimensions for every floor + summary sheet">
        {pdfBusy ? 'Building PDF…' : '⬇ PDF plans'}
      </button>
      <button
        className="primary"
        onClick={() => {
          if (viewMode === '2d') set({ viewMode: 'split' })
          setTimeout(() => {
            const url = screenshot3D()
            if (url) download(url, `${slug}-render.png`)
          }, 300)
        }}
      >
        Export render
      </button>
      <input
        ref={fileIn}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          try {
            const data = JSON.parse(await f.text()) as Project
            if (!data.plot || !Array.isArray(data.rooms)) throw new Error('Not an Aangan project')
            loadProject({ ...blankProject(), ...data })
          } catch (err) {
            console.error('[aangan] failed to open project', err)
          }
          e.target.value = ''
        }}
      />
    </header>
  )
}

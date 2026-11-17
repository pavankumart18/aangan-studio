import * as THREE from 'three'
import type { FloorMat } from './types'
import { FLOOR_COLORS } from './catalog'

const cache = new Map<FloorMat, THREE.CanvasTexture>()

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}

/** Procedural floor textures; one texture tile = 1 m × 1 m. */
export function floorTexture(mat: FloorMat): THREE.CanvasTexture {
  const hit = cache.get(mat)
  if (hit) return hit
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const base = FLOOR_COLORS[mat]
  g.fillStyle = base
  g.fillRect(0, 0, S, S)
  const r = rng(mat.length * 977 + 13)
  if (mat === 'wood') {
    const planks = 5
    const ph = S / planks
    for (let i = 0; i < planks; i++) {
      const off = r() * S
      for (let k = -1; k < 2; k++) {
        const tone = (r() - 0.5) * 30
        g.fillStyle = `rgba(${tone > 0 ? 255 : 0},${tone > 0 ? 220 : 0},${tone > 0 ? 180 : 0},${Math.abs(tone) / 255})`
        g.fillRect(off + k * S, i * ph, S, ph)
      }
      g.strokeStyle = 'rgba(60,35,15,0.10)'
      for (let l = 0; l < 6; l++) {
        g.beginPath()
        const y = i * ph + r() * ph
        g.moveTo(0, y)
        g.bezierCurveTo(S * 0.3, y + (r() - 0.5) * 6, S * 0.7, y + (r() - 0.5) * 6, S, y)
        g.stroke()
      }
      g.fillStyle = 'rgba(50,30,10,0.45)'
      g.fillRect(0, i * ph, S, 1.5)
      g.fillRect(off % S, i * ph, 1.5, ph)
    }
  } else if (mat === 'tile' || mat === 'granite' || mat === 'concrete') {
    const n = mat === 'tile' ? 2 : mat === 'granite' ? 1 : 1
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${mat === 'granite' ? 0.18 : 0.04})`
      g.fillRect(r() * S, r() * S, 1.5, 1.5)
    }
    if (mat !== 'concrete') {
      g.strokeStyle = mat === 'granite' ? 'rgba(0,0,0,0.5)' : 'rgba(120,130,135,0.55)'
      g.lineWidth = 2
      for (let i = 0; i <= n; i++) {
        g.beginPath(); g.moveTo((i * S) / n, 0); g.lineTo((i * S) / n, S); g.stroke()
        g.beginPath(); g.moveTo(0, (i * S) / n); g.lineTo(S, (i * S) / n); g.stroke()
      }
    }
  } else if (mat === 'marble') {
    g.strokeStyle = 'rgba(140,130,120,0.18)'
    for (let v = 0; v < 7; v++) {
      g.lineWidth = 0.6 + r() * 1.6
      g.beginPath()
      let x = r() * S, y = 0
      g.moveTo(x, y)
      while (y < S) {
        x += (r() - 0.5) * 30
        y += 10 + r() * 20
        g.lineTo(x, y)
      }
      g.stroke()
    }
    g.strokeStyle = 'rgba(160,150,140,0.35)'
    g.lineWidth = 1
    g.strokeRect(0, 0, S, S)
  } else if (mat === 'carpet') {
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},0.06)`
      g.fillRect(r() * S, r() * S, 1, 1)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  cache.set(mat, t)
  return t
}

const grassCache: { t?: THREE.CanvasTexture } = {}
export function grassTexture() {
  if (grassCache.t) return grassCache.t
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#7d9c5e'
  g.fillRect(0, 0, S, S)
  const r = rng(42)
  for (let i = 0; i < 5000; i++) {
    const v = r()
    g.fillStyle = v > 0.5 ? 'rgba(160,190,110,0.25)' : 'rgba(60,90,40,0.25)'
    g.fillRect(r() * S, r() * S, 2, 2)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.repeat.set(40, 40)
  grassCache.t = t
  return t
}

const roofCache: { t?: THREE.CanvasTexture } = {}
/** Terracotta Mangalore-style roof tiles. */
export function roofTexture() {
  if (roofCache.t) return roofCache.t
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#a8492e'
  g.fillRect(0, 0, S, S)
  const r = rng(7)
  for (let row = 0; row < 8; row++) {
    const y = row * (S / 8)
    const grad = g.createLinearGradient(0, y, 0, y + S / 8)
    grad.addColorStop(0, 'rgba(255,200,160,0.18)')
    grad.addColorStop(1, 'rgba(60,15,5,0.35)')
    g.fillStyle = grad
    g.fillRect(0, y, S, S / 8)
    for (let col = 0; col < 8; col++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '255,220,190' : '40,10,0'},${0.05 + r() * 0.08})`
      g.fillRect(col * (S / 8) + (row % 2) * (S / 16), y, S / 8 - 2, S / 8 - 2)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.repeat.set(0.5, 0.5)
  roofCache.t = t
  return t
}

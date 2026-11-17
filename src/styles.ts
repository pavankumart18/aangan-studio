import type { FloorMat, Project, RoomType, StyleId } from './types'

export interface StyleDef {
  id: StyleId
  label: string
  blurb: string
  exterior: string
  plinth: string
  trim: string // window frames
  door: string
  wood: string // furniture wood
  metal: string
  legs: 'metal' | 'turned' | 'block'
  roof: 'flat-parapet' | 'cornice' | 'pitched'
  roofColor: string
  chajja: string
  upholstery: string[]
  accent: string
  walls: Partial<Record<RoomType, string>> & { default: string }
  floors: Partial<Record<RoomType, FloorMat>> & { default: FloorMat }
}

export const STYLES: Record<StyleId, StyleDef> = {
  modern: {
    id: 'modern',
    label: 'Modern',
    blurb: 'Clean lines, flat roof with parapet, black frames, light oak & grey fabrics.',
    exterior: '#f1f1ee',
    plinth: '#55585d',
    trim: '#23262b',
    door: '#3a3d42',
    wood: '#c49a6c',
    metal: '#2b2d31',
    legs: 'metal',
    roof: 'flat-parapet',
    roofColor: '#c9c9c6',
    chajja: '#e6e6e3',
    upholstery: ['#8a8f98', '#5f6b76', '#c7c2b8', '#3f4a55'],
    accent: '#e07a3f',
    walls: { default: '#f4f4f2', bedroom: '#e6e9ec', study: '#dfe5e2' },
    floors: { default: 'tile', bedroom: 'wood', study: 'wood', bathroom: 'tile', garage: 'concrete', living: 'marble' },
  },
  classic: {
    id: 'classic',
    label: 'Classic',
    blurb: 'Symmetry, cornices, white mouldings, walnut furniture with turned legs, velvet.',
    exterior: '#efe4cf',
    plinth: '#cdbfa5',
    trim: '#f7f5ef',
    door: '#5a3a22',
    wood: '#5a3a22',
    metal: '#b8954a',
    legs: 'turned',
    roof: 'cornice',
    roofColor: '#d8ccb6',
    chajja: '#f3ecdf',
    upholstery: ['#2f4058', '#7b2d3b', '#c9b48a', '#47614f'],
    accent: '#b8954a',
    walls: { default: '#efe6d6', bedroom: '#e8dcd0', dining: '#e9d9c3', study: '#d9d4c2' },
    floors: { default: 'marble', bedroom: 'wood', study: 'wood', bathroom: 'marble', kitchen: 'granite', garage: 'concrete' },
  },
  traditional: {
    id: 'traditional',
    label: 'Traditional',
    blurb: 'Indian heritage: sloped terracotta roof, teak & brass, ochre lime walls, red oxide & stone.',
    exterior: '#e8cf9f',
    plinth: '#8f7b5d',
    trim: '#6b4226',
    door: '#6b4226',
    wood: '#7a4a24',
    metal: '#b98b2f',
    legs: 'block',
    roof: 'pitched',
    roofColor: '#a8492e',
    chajja: '#a8492e',
    upholstery: ['#9c3d2e', '#c27c2c', '#2e5a4f', '#7a2e4a'],
    accent: '#b98b2f',
    walls: { default: '#f0e0c0', bedroom: '#efd9b8', pooja: '#f7e3a6', kitchen: '#f3e6cc' },
    floors: { default: 'granite', bedroom: 'wood', living: 'wood', pooja: 'marble', bathroom: 'tile', garage: 'concrete' },
  },
}

const UPHOLSTERED = new Set(['sofa3', 'sofa2', 'lsofa', 'armchair', 'bedq', 'beds', 'officechair'])
const WOODEN = new Set(['coffee', 'bookshelf', 'wardrobe', 'nightstand', 'dresser', 'dining6', 'dining4', 'chair', 'desk', 'tv', 'mandir'])

/** Re-skin the whole project in a style: walls, floors, furniture fabrics & woods. */
export function applyStyle(p: Project, id: StyleId) {
  const s = STYLES[id]
  p.style = id
  for (const r of p.rooms) {
    r.wallColor = s.walls[r.type] ?? s.walls.default
    r.floor = s.floors[r.type] ?? s.floors.default
  }
  let i = 0
  for (const f of p.furniture) {
    if (UPHOLSTERED.has(f.kind)) f.color = s.upholstery[i++ % s.upholstery.length]
    else if (WOODEN.has(f.kind)) f.color = f.kind === 'tv' ? (id === 'modern' ? '#2b2d31' : s.wood) : f.kind === 'mandir' ? (id === 'traditional' ? '#c9962e' : '#d7a95b') : s.wood
  }
}

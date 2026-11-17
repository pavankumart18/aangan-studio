// All plan coordinates are in metres. Plan x → right, plan y → down (towards the bottom of the screen).
// In 3D: X = x - plot.width/2, Z = y - plot.depth/2, Y is up.

export type RoomType =
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'dining'
  | 'bathroom'
  | 'study'
  | 'pooja'
  | 'balcony'
  | 'garage'
  | 'utility'

export type FloorMat = 'wood' | 'marble' | 'tile' | 'granite' | 'carpet' | 'concrete'

export interface Room {
  id: string
  name: string
  type: RoomType
  x: number
  y: number
  w: number
  d: number
  floor: FloorMat
  wallColor: string
  level?: number
}

export type OpeningKind = 'window' | 'door'

/** 'h' runs along x at fixed y (from x to x+length); 'v' runs along y at fixed x. */
export interface Opening {
  id: string
  kind: OpeningKind
  orient: 'h' | 'v'
  x: number
  y: number
  length: number
  level?: number
}

export interface Furniture {
  id: string
  kind: string
  x: number // centre
  y: number // centre
  rot: number // degrees, clockwise on plan
  color: string
  level?: number
}

export type StyleId = 'modern' | 'classic' | 'traditional'

export interface Level {
  name: string
}

export interface Plot {
  width: number
  depth: number
  /** Clockwise angle (deg) from "plan up" to true north. 0 = top of the plan is north. */
  northDeg: number
  city: string
  lat: number
  lng: number
  tz: number // hours offset from UTC
}

export interface Project {
  name: string
  plot: Plot
  rooms: Room[]
  openings: Opening[]
  furniture: Furniture[]
  wallHeight: number
  slabThickness: number
  levels: Level[]
  style: StyleId
}

export type Tool = 'select' | 'room' | 'window' | 'door'
export type ViewMode = '2d' | '3d' | 'split'
export type Selection = { type: 'room' | 'opening' | 'furniture'; id: string } | null

export interface Layers {
  foundation: boolean
  walls: boolean
  cutaway: boolean
  furniture: boolean
  roof: boolean
  sunPath: boolean
}

/** null = orbit overview; otherwise an eye-level viewpoint. */
export type CamView = null | { roomId?: string; x: number; y: number; level: number; look?: { x: number; y: number } }

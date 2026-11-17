import type { FloorMat, RoomType } from './types'

export interface FurnitureDef {
  kind: string
  label: string
  category: 'Structure' | 'Living' | 'Bedroom' | 'Dining & Kitchen' | 'Bath' | 'Work & Decor'
  w: number // along local x
  d: number // along local y (front faces +y)
  h: number
  color: string
  /** Furniture that benefits from (or suffers from) sunlight; used by the insight engine. */
  sunSensitive?: 'glare' | 'heat' | 'loves-light'
}

export const CATALOG: FurnitureDef[] = [
  { kind: 'stair-straight', label: 'Straight stair', category: 'Structure', w: 1.0, d: 3.6, h: 3.15, color: '#bdb6aa' },
  { kind: 'stair-u', label: 'Dog-leg (U) stair', category: 'Structure', w: 2.3, d: 2.8, h: 3.15, color: '#bdb6aa' },
  { kind: 'sofa3', label: '3-seat sofa', category: 'Living', w: 2.1, d: 0.9, h: 0.85, color: '#6b7f99', sunSensitive: 'heat' },
  { kind: 'sofa2', label: 'Loveseat', category: 'Living', w: 1.5, d: 0.88, h: 0.85, color: '#9a7b6a', sunSensitive: 'heat' },
  { kind: 'lsofa', label: 'L-shaped sofa', category: 'Living', w: 2.6, d: 1.7, h: 0.85, color: '#7d8a72', sunSensitive: 'heat' },
  { kind: 'armchair', label: 'Armchair', category: 'Living', w: 0.85, d: 0.85, h: 0.9, color: '#c9925b' },
  { kind: 'coffee', label: 'Coffee table', category: 'Living', w: 1.1, d: 0.6, h: 0.42, color: '#8b5e3c' },
  { kind: 'tv', label: 'TV unit + TV', category: 'Living', w: 1.8, d: 0.45, h: 1.25, color: '#3b3b3f', sunSensitive: 'glare' },
  { kind: 'rug', label: 'Rug', category: 'Living', w: 2.0, d: 1.4, h: 0.01, color: '#c7b299' },
  { kind: 'bookshelf', label: 'Bookshelf', category: 'Living', w: 1.0, d: 0.35, h: 1.9, color: '#a0744f' },
  { kind: 'bedq', label: 'Queen bed', category: 'Bedroom', w: 1.6, d: 2.1, h: 1.0, color: '#d9d4cc', sunSensitive: 'heat' },
  { kind: 'beds', label: 'Single bed', category: 'Bedroom', w: 1.0, d: 2.0, h: 0.95, color: '#cfd8dc', sunSensitive: 'heat' },
  { kind: 'wardrobe', label: 'Wardrobe', category: 'Bedroom', w: 1.8, d: 0.6, h: 2.1, color: '#8d6e63' },
  { kind: 'nightstand', label: 'Nightstand', category: 'Bedroom', w: 0.5, d: 0.4, h: 0.55, color: '#8b5e3c' },
  { kind: 'dresser', label: 'Dresser', category: 'Bedroom', w: 1.2, d: 0.45, h: 0.8, color: '#a1887f' },
  { kind: 'dining6', label: 'Dining table (6)', category: 'Dining & Kitchen', w: 1.8, d: 1.0, h: 0.76, color: '#7a5233' },
  { kind: 'dining4', label: 'Dining table (4)', category: 'Dining & Kitchen', w: 1.2, d: 0.8, h: 0.76, color: '#9c6b43' },
  { kind: 'chair', label: 'Chair', category: 'Dining & Kitchen', w: 0.45, d: 0.5, h: 0.9, color: '#5d4037' },
  { kind: 'counter', label: 'Kitchen counter', category: 'Dining & Kitchen', w: 2.4, d: 0.6, h: 0.9, color: '#eceff1' },
  { kind: 'fridge', label: 'Refrigerator', category: 'Dining & Kitchen', w: 0.75, d: 0.7, h: 1.8, color: '#cfd8dc' },
  { kind: 'island', label: 'Kitchen island', category: 'Dining & Kitchen', w: 1.6, d: 0.9, h: 0.9, color: '#455a64' },
  { kind: 'toilet', label: 'WC', category: 'Bath', w: 0.4, d: 0.7, h: 0.8, color: '#fafafa' },
  { kind: 'vanity', label: 'Vanity + sink', category: 'Bath', w: 0.8, d: 0.5, h: 0.85, color: '#b0bec5' },
  { kind: 'shower', label: 'Shower', category: 'Bath', w: 0.9, d: 0.9, h: 2.0, color: '#b3e5fc' },
  { kind: 'tub', label: 'Bathtub', category: 'Bath', w: 1.7, d: 0.75, h: 0.55, color: '#fafafa' },
  { kind: 'desk', label: 'Work desk', category: 'Work & Decor', w: 1.2, d: 0.6, h: 0.75, color: '#bcaaa4', sunSensitive: 'glare' },
  { kind: 'officechair', label: 'Office chair', category: 'Work & Decor', w: 0.6, d: 0.6, h: 1.05, color: '#263238' },
  { kind: 'plant', label: 'Indoor plant', category: 'Work & Decor', w: 0.5, d: 0.5, h: 1.3, color: '#4caf50', sunSensitive: 'loves-light' },
  { kind: 'lamp', label: 'Floor lamp', category: 'Work & Decor', w: 0.4, d: 0.4, h: 1.6, color: '#f5d48b' },
  { kind: 'mandir', label: 'Pooja unit', category: 'Work & Decor', w: 0.9, d: 0.5, h: 1.6, color: '#d7a95b' },
]

export const CATALOG_MAP: Record<string, FurnitureDef> = Object.fromEntries(CATALOG.map((c) => [c.kind, c]))

export const ROOM_TYPES: { type: RoomType; label: string; color: string; floor: FloorMat }[] = [
  { type: 'living', label: 'Living', color: '#f2c98a', floor: 'wood' },
  { type: 'bedroom', label: 'Bedroom', color: '#a8c5e8', floor: 'wood' },
  { type: 'kitchen', label: 'Kitchen', color: '#f4a6a0', floor: 'tile' },
  { type: 'dining', label: 'Dining', color: '#f7d9a8', floor: 'marble' },
  { type: 'bathroom', label: 'Bathroom', color: '#9fdcd5', floor: 'tile' },
  { type: 'study', label: 'Study', color: '#c7b8ea', floor: 'wood' },
  { type: 'pooja', label: 'Pooja', color: '#ffd27a', floor: 'marble' },
  { type: 'balcony', label: 'Balcony', color: '#b9e3a5', floor: 'tile' },
  { type: 'garage', label: 'Parking', color: '#c9c9c9', floor: 'concrete' },
  { type: 'utility', label: 'Utility', color: '#d6ccc2', floor: 'tile' },
]

export const ROOM_TYPE_MAP = Object.fromEntries(ROOM_TYPES.map((r) => [r.type, r])) as Record<
  RoomType,
  (typeof ROOM_TYPES)[number]
>

export const FLOOR_COLORS: Record<FloorMat, string> = {
  wood: '#a9774c',
  marble: '#ece8e1',
  tile: '#d3d9db',
  granite: '#5b5b5f',
  carpet: '#8f8273',
  concrete: '#9e9e9e',
}

export const WALL_PALETTE = ['#f5f1ea', '#ffffff', '#e8dcc8', '#d9e4dd', '#dfe6ee', '#f1d9cf', '#e6e0f0', '#c9b8a6', '#9fb3a8', '#3e4a5a']

export interface CityPreset {
  name: string
  lat: number
  lng: number
  tz: number
}

export const CITIES: CityPreset[] = [
  { name: 'Hyderabad', lat: 17.385, lng: 78.4867, tz: 5.5 },
  { name: 'Bengaluru', lat: 12.9716, lng: 77.5946, tz: 5.5 },
  { name: 'Mumbai', lat: 19.076, lng: 72.8777, tz: 5.5 },
  { name: 'Delhi', lat: 28.6139, lng: 77.209, tz: 5.5 },
  { name: 'Chennai', lat: 13.0827, lng: 80.2707, tz: 5.5 },
  { name: 'Pune', lat: 18.5204, lng: 73.8567, tz: 5.5 },
  { name: 'Kolkata', lat: 22.5726, lng: 88.3639, tz: 5.5 },
  { name: 'Dubai', lat: 25.2048, lng: 55.2708, tz: 4 },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198, tz: 8 },
  { name: 'London', lat: 51.5072, lng: -0.1276, tz: 0 },
  { name: 'New York', lat: 40.7128, lng: -74.006, tz: -5 },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093, tz: 11 },
]

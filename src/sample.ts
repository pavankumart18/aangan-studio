import type { Project } from './types'

let n = 0
const id = (p: string) => `${p}${++n}`

/** A Vastu-friendly 2BHK on a 40×60 ft (≈12×18 m) site, north at the top. */
export function sampleProject(): Project {
  n = 0
  return {
    name: 'Sample 2BHK · 40×60 site',
    plot: { width: 12, depth: 18, northDeg: 0, city: 'Hyderabad', lat: 17.385, lng: 78.4867, tz: 5.5 },
    wallHeight: 3,
    slabThickness: 0.15,
    levels: [{ name: 'Ground floor' }, { name: 'First floor' }],
    style: 'modern',
    rooms: [
      { id: id('r'), name: 'Living', type: 'living', x: 6, y: 3, w: 4.5, d: 5, floor: 'wood', wallColor: '#f5f1ea' },
      { id: id('r'), name: 'Bedroom 2', type: 'bedroom', x: 1.5, y: 3, w: 4.5, d: 4, floor: 'wood', wallColor: '#dfe6ee' },
      { id: id('r'), name: 'Bath', type: 'bathroom', x: 1.5, y: 7, w: 2.25, d: 2, floor: 'tile', wallColor: '#d9e4dd' },
      { id: id('r'), name: 'Passage', type: 'utility', x: 3.75, y: 7, w: 2.25, d: 2, floor: 'marble', wallColor: '#f5f1ea' },
      { id: id('r'), name: 'Master Bedroom', type: 'bedroom', x: 1.5, y: 9, w: 4.5, d: 6, floor: 'wood', wallColor: '#e8dcc8' },
      { id: id('r'), name: 'Dining', type: 'dining', x: 6, y: 8, w: 4.5, d: 3.5, floor: 'marble', wallColor: '#f1d9cf' },
      { id: id('r'), name: 'Kitchen', type: 'kitchen', x: 6, y: 11.5, w: 4.5, d: 3.5, floor: 'tile', wallColor: '#ffffff' },
      // first floor
      { id: id('r'), name: 'Bedroom 3', type: 'bedroom', x: 1.5, y: 3, w: 4.5, d: 5, floor: 'wood', wallColor: '#e6e9ec', level: 1 },
      { id: id('r'), name: 'Bath 3', type: 'bathroom', x: 1.5, y: 8, w: 2.25, d: 2, floor: 'tile', wallColor: '#d9e4dd', level: 1 },
      { id: id('r'), name: 'Lobby', type: 'utility', x: 3.75, y: 8, w: 2.25, d: 2, floor: 'marble', wallColor: '#f5f1ea', level: 1 },
      { id: id('r'), name: 'Bedroom 4', type: 'bedroom', x: 1.5, y: 10, w: 4.5, d: 5, floor: 'wood', wallColor: '#e8dcc8', level: 1 },
      { id: id('r'), name: 'Family Lounge', type: 'living', x: 6, y: 3, w: 4.5, d: 6, floor: 'wood', wallColor: '#f5f1ea', level: 1 },
      { id: id('r'), name: 'Terrace', type: 'balcony', x: 6, y: 9, w: 4.5, d: 6, floor: 'tile', wallColor: '#f5f1ea', level: 1 },
    ],
    openings: [
      // windows
      { id: id('o'), kind: 'window', orient: 'h', x: 8.5, y: 3, length: 1.5 },
      { id: id('o'), kind: 'window', orient: 'v', x: 10.5, y: 4.5, length: 1.5 },
      { id: id('o'), kind: 'window', orient: 'h', x: 2.5, y: 3, length: 1.5 },
      { id: id('o'), kind: 'window', orient: 'v', x: 1.5, y: 3.5, length: 1 },
      { id: id('o'), kind: 'window', orient: 'v', x: 1.5, y: 7.5, length: 0.75 },
      { id: id('o'), kind: 'window', orient: 'v', x: 1.5, y: 10.5, length: 1.5 },
      { id: id('o'), kind: 'window', orient: 'h', x: 2.5, y: 15, length: 1.5 },
      { id: id('o'), kind: 'window', orient: 'v', x: 10.5, y: 9, length: 1.5 },
      { id: id('o'), kind: 'window', orient: 'v', x: 10.5, y: 12.5, length: 1.25 },
      { id: id('o'), kind: 'window', orient: 'h', x: 7.5, y: 15, length: 1 },
      // doors
      { id: id('o'), kind: 'door', orient: 'h', x: 6.75, y: 3, length: 1 },
      { id: id('o'), kind: 'door', orient: 'h', x: 7.5, y: 8, length: 1.5 },
      { id: id('o'), kind: 'door', orient: 'h', x: 8, y: 11.5, length: 1 },
      { id: id('o'), kind: 'door', orient: 'v', x: 6, y: 8, length: 1 },
      { id: id('o'), kind: 'door', orient: 'h', x: 4.5, y: 7, length: 1 },
      { id: id('o'), kind: 'door', orient: 'h', x: 4.5, y: 9, length: 1 },
      { id: id('o'), kind: 'door', orient: 'v', x: 3.75, y: 7.5, length: 0.75 },
      // first floor
      ...(
        [
          ['window', 'h', 2.5, 3, 1.5], ['window', 'v', 1.5, 4.5, 1.5], ['window', 'v', 1.5, 8.5, 0.75], ['window', 'v', 1.5, 11.5, 1.5],
          ['window', 'h', 2.5, 15, 1.5], ['window', 'h', 7.5, 3, 2], ['window', 'v', 10.5, 4, 1.5],
          ['door', 'h', 7.5, 9, 1.5], ['door', 'v', 6, 8, 1], ['door', 'h', 4.5, 8, 1], ['door', 'h', 4.5, 10, 1],
          ['door', 'v', 3.75, 8.5, 0.75], ['door', 'v', 10.5, 7.5, 1],
        ] as const
      ).map(([kind, orient, x, y, length]) => ({ id: id('o'), kind, orient, x, y, length, level: 1 })),
    ],
    furniture: [
      // living
      { id: id('f'), kind: 'tv', x: 6.32, y: 5.4, rot: 270, color: '#3b3b3f' },
      { id: id('f'), kind: 'sofa3', x: 9.95, y: 5.4, rot: 90, color: '#6b7f99' },
      { id: id('f'), kind: 'rug', x: 8.1, y: 5.4, rot: 90, color: '#c7b299' },
      { id: id('f'), kind: 'coffee', x: 8.3, y: 5.4, rot: 90, color: '#8b5e3c' },
      { id: id('f'), kind: 'armchair', x: 8.2, y: 7.3, rot: 180, color: '#c9925b' },
      { id: id('f'), kind: 'mandir', x: 10.19, y: 3.65, rot: 90, color: '#d7a95b' },
      { id: id('f'), kind: 'plant', x: 6.45, y: 7.55, rot: 0, color: '#4caf50' },
      // dining
      { id: id('f'), kind: 'dining6', x: 8.4, y: 9.8, rot: 0, color: '#7a5233' },
      // kitchen
      { id: id('f'), kind: 'counter', x: 8.25, y: 14.64, rot: 180, color: '#eceff1' },
      { id: id('f'), kind: 'counter', x: 10.14, y: 13.0, rot: 90, color: '#eceff1' },
      { id: id('f'), kind: 'fridge', x: 6.45, y: 12.4, rot: 270, color: '#cfd8dc' },
      // master
      { id: id('f'), kind: 'bedq', x: 4.89, y: 12, rot: 90, color: '#b5838d' },
      { id: id('f'), kind: 'nightstand', x: 5.7, y: 10.7, rot: 90, color: '#8b5e3c' },
      { id: id('f'), kind: 'nightstand', x: 5.7, y: 13.3, rot: 90, color: '#8b5e3c' },
      { id: id('f'), kind: 'wardrobe', x: 1.86, y: 13.9, rot: 270, color: '#8d6e63' },
      // bedroom 2
      { id: id('f'), kind: 'beds', x: 2.56, y: 5.6, rot: 270, color: '#7aa6c2' },
      { id: id('f'), kind: 'desk', x: 3.4, y: 3.36, rot: 0, color: '#bcaaa4' },
      { id: id('f'), kind: 'officechair', x: 3.4, y: 3.95, rot: 0, color: '#263238' },
      { id: id('f'), kind: 'wardrobe', x: 5.64, y: 5.0, rot: 90, color: '#a1887f' },
      // bath
      { id: id('f'), kind: 'toilet', x: 1.91, y: 8.6, rot: 270, color: '#fafafa' },
      { id: id('f'), kind: 'vanity', x: 2.6, y: 7.31, rot: 0, color: '#b0bec5' },
      // external staircase in the side setback, rising north to the first-floor lounge
      { id: id('f'), kind: 'stair-straight', x: 11.25, y: 10.3, rot: 0, color: '#bdb6aa' },
      // first floor
      ...(
        [
          ['bedq', 4.89, 5.5, 90, '#7d8a72'], ['nightstand', 5.7, 4.2, 90, '#8b5e3c'], ['nightstand', 5.7, 6.8, 90, '#8b5e3c'], ['wardrobe', 2.6, 7.64, 180, '#a1887f'],
          ['toilet', 1.91, 9.6, 270, '#fafafa'], ['vanity', 2.6, 8.31, 0, '#b0bec5'],
          ['bedq', 4.89, 12.5, 90, '#9a7b6a'], ['wardrobe', 1.86, 14, 270, '#8d6e63'], ['dresser', 3.0, 10.3, 0, '#a1887f'],
          ['lsofa', 9.59, 5.8, 90, '#5f6b76'], ['tv', 6.32, 5.8, 270, '#2b2d31'], ['rug', 8.0, 5.8, 90, '#c7b299'], ['coffee', 8.1, 5.8, 90, '#8b5e3c'],
          ['bookshelf', 7.0, 3.24, 0, '#a0744f'], ['plant', 10.1, 3.4, 0, '#4caf50'],
          ['dining4', 8.5, 12, 0, '#8d6e63'], ['plant', 6.5, 14.5, 0, '#4caf50'], ['plant', 10.0, 14.5, 0, '#4caf50'], ['plant', 10.0, 9.6, 0, '#66bb6a'],
        ] as const
      ).map(([kind, x, y, rot, color]) => ({ id: id('f'), kind, x, y, rot, color, level: 1 })),
    ],
  }
}

export function blankProject(): Project {
  return {
    name: 'Untitled project',
    plot: { width: 9.14, depth: 12.19, northDeg: 0, city: 'Hyderabad', lat: 17.385, lng: 78.4867, tz: 5.5 },
    wallHeight: 3,
    slabThickness: 0.15,
    levels: [{ name: 'Ground floor' }],
    style: 'modern',
    rooms: [],
    openings: [],
    furniture: [],
  }
}

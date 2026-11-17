# Aangan Studio

Plot-to-interiors home design in the browser: set out a plot, draw rooms, add doors and windows, stack floors, then furnish and walk through the house in 3D under real sunlight.

## Features

- **Plot & orientation:** common Indian site sizes (30×40 to 50×80 ft) or custom, north rotation, city/lat-lng presets. Areas in m², ft² and gaj.
- **2D plan editor:** draw rooms with snapping; shared walls merge (230 mm external, 115 mm partition); click walls to add windows and doors; move and resize rooms with their contents.
- **Multiple floors & staircases:** add or copy floors; straight and dog-leg stairs cut an opening in the slab above.
- **3D view:** foundation (footings, plinth beams), walls, sunshades, door leaves, cutaway and roof layers.
- **Room viewpoints:** step inside any room at eye level, look around, double-click to walk.
- **Design styles:** Modern, Classic and Traditional (Indian heritage) re-skin finishes, furniture details and roof form.
- **Sunlight:** real sun path for location and date, live shadows, sun hours per room and window, furniture glare/heat tips.
- **Vastu guidance:** zone of each room and the main entrance (optional).
- **Smart layout:** rule-based auto-furnishing that respects door swings, clearances, windows, sun and Vastu, with a rationale for each placement.
- **Ask Claude:** optional AI furniture layouts from a brief; every piece is checked for collisions before it is placed.
- **PDF plans:** A3 drawings per floor with dimension chains, setbacks, room schedule, legend, north arrow and scale bar, plus a summary sheet.
- **Estimates:** built-up area, coverage, FAR, footing/beam/slab concrete, brick count, paint area.

## Run locally

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
```

### Optional: Claude layouts

The AI endpoint runs inside the Vite dev/preview server so the key never reaches the browser:

```bash
ANTHROPIC_API_KEY=your-key npm run dev
```

Without a key, everything else works and "Ask Claude" shows a clear message.

## Deep links

`?mode=3d&level=1&room=Family%20Lounge&style=traditional&roof=1&time=16:30&date=2026-06-21`

## Stack

React 18, TypeScript, Vite, three.js via @react-three/fiber and drei, zustand, suncalc, jsPDF, Anthropic SDK.

## Disclaimer

Concept-design tool. Quantities and drawings are indicative; structural design and approvals need a licensed professional.

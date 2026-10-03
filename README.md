# web-celestia

A web front end for Celestia. The Qt shell is rebuilt in Vue 3, the scene is
rendered with WebGL 2, and the time system and solar ephemeris run in a
WebAssembly module compiled from Celestia's own C++ sources.

Source project: `/Users/hxun/Documents/Celestia` (Celestia 1.7.0,
GPL-2.0-or-later, Copyright © 2001-2023 Celestia Development Team).

## How to run

```
npm install
npm run wasm      # only after changing wasm/celestia_astro.cpp
npm run dev
```

`npm run wasm` needs an activated emsdk (`source ~/emsdk/emsdk_env.sh`). The
generated `src/wasm/celestia_astro.js` and `.wasm` are checked in so that a plain
`npm run dev` works without the toolchain.

## What is ported from the original sources

These files are translations of specific Celestia source files, and the comments
in them name the file each block came from.

| Web | Celestia | Notes |
|---|---|---|
| `wasm/celestia_astro.cpp` | `src/celastro/date.cpp` | leap second table, TAI/TT/TDB/UTC conversions |
| `wasm/celestia_astro.cpp` | `src/celastro/astro.cpp` | coordinate rotations, magnitude and irradiance maths, Kepler solver |
| `wasm/celestia_astro.cpp` | `src/celephem/vsop87.cpp` | truncated VSOP87 series for the Earth |
| `src/core/body.ts` | `src/celephem/orbit.cpp` | `EllipticalOrbit::positionAtE`, `velocityAtE` |
| `src/core/body.ts` | `src/celephem/rotation.cpp` | uniform rotation model |
| `src/render/shaders.ts` | `shaders/star_vert.glsl`, `star_frag.glsl` | star point sprites |
| `src/render/shaders.ts` | `shaders/selpointer_vert.glsl`, `selpointer_frag.glsl` | selection frame |
| `src/core/simulation.ts` | `src/celengine/renderflags.h` | `RenderFlags` and `RenderLabels` bit values, copied verbatim |
| `src/core/locations.ts` | `src/celengine/location.h` | location type flags |
| `src/core/markers.ts` | `src/celengine/marker.h` | marker symbols |
| `src/components/menus.ts` | `src/celestia/qt/qtappwin.cpp`, `qtcelestiaactions.cpp` | menu tree, item order, separators, check states |
| `src/components/QtMenu.vue`, `src/styles/qt.css` | the Qt shell | Fusion widget look, mnemonics, menu behaviour |
| `src/components/BrowserDock.vue` | `qtsolarsystembrowser.cpp`, `qtcelestialbrowser.cpp`, `qtdeepskybrowser.cpp` | columns, filters, sort behaviour, 1000 / 20000 result caps |
| `src/components/EventFinder.vue` | `qteventfinder.cpp` | search fields, result columns, context actions |
| `src/components/dialogs/*` | `preferences.ui`, `qtsettimedialog.cpp`, `gotoobjectdialog.ui`, `qtbookmark.cpp`, `tourguide.ui` | field order, ranges, defaults, conditional visibility |
| `src/core/commands.ts` | `CelestiaCore::charEntered`, `controls.txt` | key and mouse bindings |
| `public/icons/*` | `src/celestia/qt/data/*.png` | the original tool bar icons |
| `src/core/objectInfo.ts` | `src/celestia/qt/qtinfopanel.cpp` | information panel page templates and field order |

## What is not ported

The simulation and rendering core is a new implementation, not a translation.
Celestia's own engine is roughly 90,000 lines of C++ across `celengine`,
`celrender`, `celephem`, `celmodel` and `celutil`, and depends on Eigen, fmt,
Boost, FreeType, libpng, libjpeg, libepoxy and gperf.

| Celestia | Web | Status |
|---|---|---|
| `celengine/render.cpp` (6344 lines) | `src/render/renderer.ts` | reimplemented |
| `celrender/*`, `celrender/gl/*` | `src/render/*` | reimplemented |
| `celengine/universe.cpp`, `body.cpp`, `star.cpp`, `solarsystem.cpp` | `src/core/universe.ts`, `body.ts`, `star.ts` | reimplemented |
| `celengine/observer.cpp` | `src/core/observer.ts` | reimplemented |
| `celengine/starrenderer.cpp` star sizing | `src/render/renderer.ts` | reimplemented, tuned by eye |
| `celestia/hud.cpp` | `src/components/MainWindow.vue` | field set and wording follow the original, layout does not |
| `celscript/*` (CEL and Lua) | — | absent |
| `.ssc`, `.stc`, `.dsc`, `celestia.cfg` loaders | — | absent; solar system and bodies are defined in `src/core/solarsystem.ts` |
| data package textures | `src/render/textures.ts` | procedural, because the data package is not in the source tree |

Consequences worth knowing:

- Orbital elements in `src/core/solarsystem.ts` are the J2000 Jupiter-to-Pluto
  Keplerian set with no secular rates, so positions drift slightly away from 2000.
- Star distances come from a main sequence photometric relation on B-V rather
  than from parallax, because the catalogue used here carries none. Giants and
  supergiants are therefore placed too close.
- Planet surfaces are generated from value noise, so they are plausible rather
  than correct.

## Data

`tools/convert-catalog.mjs` converts the d3-celestial catalogues into
`public/data`. Those catalogues derive from the Hipparcos and Yale bright star
lists, the IAU constellation line and boundary tables and the Messier catalogue:
41,411 stars, 3,492 named, 89 constellations, 2,240 deep sky objects.

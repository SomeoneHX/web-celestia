# web-celestia

Celestia in a browser. It is not a reimplementation: the scene is drawn by
**Celestia's own C++ engine**, compiled to WebAssembly, and the interface is a
port of **Celestia's Qt front end** to Vue 3. Where a piece of the original has a
counterpart here, the comments name the file it came from.

- Upstream: <https://github.com/CelestiaProject/Celestia> (1.7.0, GPL-2.0-or-later)
- Data: <https://github.com/CelestiaProject/CelestiaContent>

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Vue shell — src/                                                     │
  │   a port of src/celestia/qt: menus, tool bars, docks, dialogs, HUD    │
  │   panels, the selection menu, the information panel, preferences      │
  └───────────────┬──────────────────────────────────────────────────────┘
                  │ embind, one call per engine operation
  ┌───────────────▼──────────────────────────────────────────────────────┐
  │ celestia_core.wasm — native/                                         │
  │   CelestiaCore, the renderer, the ephemeris, the catalogues and the   │
  │   script interpreters, compiled from Celestia's sources               │
  └───────────────┬──────────────────────────────────────────────────────┘
                  │ mounted into the Emscripten file system
  ┌───────────────▼──────────────────────────────────────────────────────┐
  │ celestia-data/, public/ — the catalogues, textures, shaders, fonts,   │
  │ translations and scripts the engine reads at run time                 │
  └──────────────────────────────────────────────────────────────────────┘
```

## Requirements

| | |
|---|---|
| Node.js | 20 or later |
| Emscripten | 6.x, activated with `source ~/emsdk/emsdk_env.sh` |
| A Celestia checkout | the sources are compiled, not vendored; set `CELESTIA_SRC` if it is not `~/Documents/Celestia` |
| Python 3 with fontTools | only to rebuild the CJK fonts |
| An ICU source tree | only to rebuild the ICU data |

## Getting it running

```sh
npm install

# The catalogues: Celestia's source tree does not carry them.
bash tools/fetch-celestia-data.sh --all

# The two WebAssembly modules. Neither is committed.
bash native/build.sh          # celestia_core.wasm, the engine itself
bash native/build-lua.sh      # Lua, for CELX scripts
bash native/build.sh          # link again once Lua is there
npm run wasm                  # celestia_astro.wasm, the astronomy helpers

npm run dev                   # http://localhost:5173
```

`?lang=zh_CN` overrides the language; otherwise it comes from the browser, as
Celestia takes it from the system locale.

`native/build.sh link` relinks from the objects already built, which is what to
use while iterating on `native/bindings.cpp`.

## The module

Everything under `native/` is the bridge between Celestia's C++ and the shell.

| | |
|---|---|
| `native/bindings.cpp` | the whole exported surface. It creates the GL context, starts `CelestiaCore`, converts results and forwards input; it computes nothing that the engine already computes |
| `native/build.sh` | compiles Celestia's sources and links the module. `link` reuses the objects |
| `native/build-lua.sh` | builds Lua 5.4.7, which Celestia takes from the system and which has no Emscripten port |
| `native/compile-one.sh` | compiles one translation unit, used by the build and by hand |
| `native/gettext_shim.cpp` | a gettext that reads the catalogues, in place of musl's stub |
| `native/shims/` | replacements for the few pieces that have no browser equivalent: libepoxy, `config.h`, and the resource system (`resourcesystem.cpp` uses a worker pool and decodes on threads) |

Things about the build that are not obvious:

- **The link runs at `-O0`** while the sources compile at `-O2`. Linking the whole
  module optimised miscompiles something in the catalogue loaders: reading a star
  catalogue then faults with an out of bounds access. The object code is still
  optimised.
- **`ENABLE_NLS` matters.** Without it `_()` expands to the message at compile
  time and nothing translates, which is why the engine's own strings were English
  while the shell's were not.
- **ICU has no data of its own here.** Emscripten's ICU port links ICU's
  `stubdata`, an empty placeholder, so every lookup fails. `public/icu/icudt68l.dat`
  is a subset of ICU 68's own data, handed to ICU in memory because ICU loads a
  data file by mapping it and gives up when `mmap` fails. See
  `tools/build-icu-data.sh`, whose comment records the trap: the file **must** be
  named `icudt68l.dat`, because `icupkg` derives the names inside the package from
  the output file's name.
- **CELX needs Lua built for wasm**, and the sources are committed under
  `native/thirdparty/lua` because there is no port to fetch.

## The shell

`src/` is the Qt front end, file by file.

| Web | Celestia |
|---|---|
| `components/MainWindow.vue` | `qtappwin.cpp` — the window, the frame loop, the input handling |
| `components/MenuBar.vue`, `menuModel.ts`, `menus.ts` | `qtappwin.cpp`, `qtcelestiaactions.cpp` — the menu tree, item order, check states, accelerators |
| `components/ToolBars.vue` | `qttimetoolbar.cpp`, the guides bar and `BookmarkToolBar` |
| `components/BrowserDock.vue` | `qtsolarsystembrowser.cpp`, `qtcelestialbrowser.cpp`, `qtdeepskybrowser.cpp` |
| `components/EventFinder.vue` | `qteventfinder.cpp` |
| `components/InfoPanel.vue`, `core/objectInfo.ts` | `qtinfopanel.cpp` — the page templates and field order |
| `components/SelectionPopup.vue` | `qtselectionpopup.cpp` — every entry, including the reference marks and the child objects |
| `components/dialogs/*` | `preferences.ui`, `qtsettimedialog.cpp`, `gotoobjectdialog.ui`, `qtbookmark.cpp`, `tourguide.ui` |
| `store/app.ts`, `store/settings.ts` | `qtappwin.cpp`'s settings, which Qt keeps in `QSettings` |
| `core/celestia.ts` | `renderflags.h`, `body.h`, `marker.h`, `location.h` — the enums, with the engine's own values |
| `styles/ui.css` | the Fusion widget look the Qt build uses |

The rule that keeps this from drifting: **the engine owns the state**. The shell
never keeps a second copy of it to draw from. It reads the engine back after
starting (`renderFlags()`, `starStyle()`, `orbitMask()`) rather than pushing its own
defaults over them, and it writes to the engine when the user changes something.
Pushing the shell's copies over the engine is what once made the Sun lose its glow
and the galaxies disappear.

## Localisation

Celestia localises through gettext, and one catalogue per language carries both the
engine's strings and the interface's — `Planets` and `Select Sun` are entries in the
same file — so the shell asks the same catalogue the engine does.

`tools/build-translations.sh` runs `msgfmt` over Celestia's `po/` into
`public/locale/<lang>/LC_MESSAGES/celestia.mo`; 28 languages are shipped. Strings
the catalogue leaves untranslated — entries marked fuzzy, which `msgfmt` drops —
stay English, which is what Celestia itself shows.

CJK languages need a font that can draw them, which DejaVuSans cannot.
`tools/build-cjk-fonts.py` instances Noto Sans SC at a fixed weight and subsets it
to the characters each catalogue uses, plus the date and time text ICU produces,
which is in no catalogue. The front end mounts the subset for the language in use
and points `celestia.cfg`'s `Font`, `TitleFont` and `LabelFont` at it.

## Scripting

Both of Celestia's script languages are the originals.

- **CEL** (`.cel`) is `celscript/legacy`, compiled in. Celestia's own `start.cel`
  runs at startup, and `demo.cel` is what File ▸ Run Demo runs, as
  `CelestiaAppWindow::slotRunDemo` does.
- **CELX** (`.celx`) is `celscript/lua` against the Lua built by
  `native/build-lua.sh`. Celestia takes Lua from the system; there is no Emscripten
  port, so the sources are committed under `native/thirdparty/lua`.

The Scripts menu lists what `ScanScriptsDirectory` finds, which is Celestia's own
scan — it accepts `.celx` only when CELX is compiled in, as here.

## Data

Celestia's source tree carries no catalogues; they are in the separate
CelestiaContent repository. `tools/fetch-celestia-data.sh --all` puts them in
`celestia-data/`, and `tools/make-asset-manifest.mjs` writes the manifest the
browser uses to mount them **without downloading them**: the engine resolves a
texture by asking whether the file exists before it ever reads it, so the front end
creates an empty placeholder for each and fetches the bytes the first time the
engine opens one. Nothing is downloaded for a body that is never drawn.

At run time `celestia.cfg` decides where everything is, and the front end puts it
there:

| In the file system | What |
|---|---|
| `/celestia.cfg` | the config, with the font and the paths rewritten for the language in use |
| `/celestia-data/` | the catalogues, textures and models, lazily |
| `/shaders/`, `/fonts/`, `/scripts/` | the GLSL stages, the fonts and the scripts |
| `/locale/<lang>/LC_MESSAGES/celestia.mo` | the catalogue |
| `/icu/icudt68l.dat` | read into memory and handed to ICU |

## Settings

`src/store/settings.ts` keeps the same set CelestiaAppWindow does in `QSettings`:
the render flags, label mode, orbit mask, star style, texture resolution, star
colour table, atmosphere and cloud settings, tone mapping, the location filter,
the faintest magnitude, HUD detail, date format, time zone bias, light delay, the
tool bar and dock layout, the frame rate ceiling and the bookmarks.

Everything goes **through the engine**, read back out of it, and is applied after
it starts and before the shell reads it, so the window opens showing what was
restored. Two things are deliberately not stored: the window's size and position,
which a tab has no say in, and full screen, because a browser will only enter it
from a user gesture.

## Differences from the original

The port is faithful where it can be, and these are the places where it is not:

- **Full screen** enters real full screen through the browser's API, which needs a
  user gesture. Celestia restores it at startup; this cannot.
- **The `D` key** does not run the demo. It does in Celestia 1.6.x; the master
  sources this is built from dropped it and kept only File ▸ Run Demo, whose `D` is
  a mnemonic.
- **NAIF kernels and AVIF images** are not built in, as the About dialog says.
- **The About dialog** is Celestia's own translatable text, with the Qt library and
  runtime version blank — a browser has neither — and the compiler line naming
  Emscripten. It opens with a notice, in English and Chinese, that this build is
  unofficial and that problems with it belong to whoever supplied it, not to the
  Celestia project. That notice is not translated: it is our own text, and it is
  the one thing there that has to be understood.
- **Strings the catalogue does not carry** stay English, including the ones this
  port introduces, such as the line naming it a port.

## Development

```sh
npm run typecheck     # vue-tsc, no emit
npm run build         # typecheck then a production build
```

The loops used while working on this:

- A browser session driven from the command line
  (`agent-browser --session <name> open|eval|screenshot|console`) against the dev
  server, checking the engine's state through `window.__celestia.core.engine`.
- `bash native/build.sh link` for changes to the binding, then a page reload.
- `bash native/compile-one.sh <file>` for one translation unit while iterating on a
  compile error.

## Licensing

This is an unofficial build, not released by and not affiliated with the Celestia
Development Team.

GPL-2.0-or-later, as Celestia is: the module is compiled from Celestia's sources,
the shell is a port of its Qt front end, and the assets come from its tree and its
data repository. The full text is in [LICENSE](LICENSE), and the notices for
everything bundled or linked — Celestia and its data, Lua, Noto Sans SC, DejaVu
Sans, the ICU data, Eigen, fmt and Emscripten — are in
[THIRD-PARTY.md](THIRD-PARTY.md).

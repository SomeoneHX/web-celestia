// Writes the asset manifest the browser uses to mount Celestia's textures and
// models without downloading them.
//
//   node tools/make-asset-manifest.mjs [celestia-data]
//
// The engine resolves a texture by rewriting "earth.*" to each extension in
// turn and asking whether the file exists (celengine/texmanager.cpp,
// TexturePaths::checkPath), and models the same way under "models/"
// (GeometryPaths::checkPath). Both answer with std::filesystem::status, so the
// file has to be present in the Emscripten file system before a catalogue is
// parsed -- but its bytes are only read later, when the texture is decoded for
// a frame that actually draws the body.
//
// That split is what this manifest exists for: the frontend creates one empty
// placeholder per entry so the existence checks pass, then fetches the real
// bytes the first time the engine opens the file. Nothing is downloaded for
// bodies that are never drawn.
//
// Only the directories the engine looks in are listed. In CelestiaContent the
// main planet maps live in textures/hires and lores/ and medres/ carry only the
// maps that hires does not have, so restricting the manifest to textures/ would
// drop exactly the surfaces the renderer asks for.

import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] ?? join(here, '..', 'celestia-data');

// TexturePaths::directories, and GeometryPaths' single "models" directory.
const DIRECTORIES = [
  'textures/lores',
  'textures/medres',
  'textures/hires',
  'models',
];

// Rearranged by the engine, not read.
const IGNORED = new Set(['CMakeLists.txt']);

function collect(directory) {
  const found = new Map();

  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return; // An absent directory is not an error: medres may not be fetched.
    }

    for (const entry of entries) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      // The licence notes sit beside the assets and are never referenced.
      if (entry.name.endsWith('.license') || IGNORED.has(entry.name)) continue;

      const path = relative(root, absolute).split(sep).join(posix.sep);
      found.set(path, statSync(absolute).size);
    }
  };

  walk(join(root, directory));
  return found;
}

const files = new Map();
for (const directory of DIRECTORIES) {
  for (const [path, size] of collect(directory))
    files.set(path, size);
}

if (files.size === 0) {
  console.error(`no assets under ${root}: run tools/fetch-celestia-data.sh --all first`);
  process.exit(1);
}

const sorted = Object.fromEntries([...files.entries()].sort(([a], [b]) => a.localeCompare(b)));
const bytes = [...files.values()].reduce((sum, size) => sum + size, 0);
const output = join(root, 'assets.json');

writeFileSync(output, `${JSON.stringify({ files: sorted }, null, 1)}\n`);

console.log(
  `assets.json: ${files.size} files, ${(bytes / 1048576).toFixed(1)} MB on demand ` +
  `(${output})`,
);

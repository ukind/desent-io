import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Asset-only budget tripwire (FRD:61): the GLB corpus under public/models must
 * stay under 3 MB. The ~3MB figure is the model corpus (FRD:154 names
 * "Draco-compressed models <~3MB"); JS/CSS bytes are not measured here.
 */
const BUDGET_BYTES = 3 * 1024 * 1024;
// Anchored to the repo root (scripts/..), never the invocation CWD — a
// wrong-CWD run must measure the real corpus, not report zero.
const MODELS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models');

function walk(dir) {
  let total = 0;
  let files = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) {
      const sub = walk(path);
      total += sub.total;
      files += sub.files;
    } else {
      total += statSync(path).size;
      files += 1;
    }
  }
  return { total, files };
}

let result = { total: 0, files: 0 };
try {
  result = walk(MODELS_DIR);
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
  // Missing corpus is a visible pre-asset state, not a silent pass — the line
  // below says so. Fail-closed here would break every pre-asset CI run.
  console.log('public/models: no models directory yet — 0 MB of 3 MB budget');
  process.exit(0);
}

const mb = (result.total / (1024 * 1024)).toFixed(2);
console.log(`public/models: ${result.files} file(s), ${mb} MB of 3 MB budget`);
if (result.total > BUDGET_BYTES) {
  console.error(`Model budget exceeded: ${mb} MB > 3 MB. Compress with gltfpack -cc (D9).`);
  process.exit(1);
}

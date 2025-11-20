import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FILE = path.join(__dirname, 'seed.json');
let cache = null;

function load() {
  if (!cache) {
    if (fs.existsSync(FILE)) {
      cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } else {
      // Create default seed if file doesn't exist
      cache = {
        sites: [],
        equipment: [],
        materials: [],
        bom: [],
        process: { steps: [], cppCqaMatrix: [] },
        mbrs: [],
        batches: [],
        validation: { ppq: { targetRuns: 0, completedRuns: 0 }, runs: [] },
        deviations: [],
        capas: [],
        changeControls: [],
        packaging: null,
        serializationRules: [],
        aiFindings: []
      };
      save();
    }
  }
  return cache;
}

function save() {
  if (!cache) return;
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
}

export default {
  load,
  save,
  get: (key) => load()[key],
  set: (key, val) => { load()[key] = val; save(); },
  push: (key, val) => { const a = load()[key] || []; a.push(val); load()[key] = a; save(); },
  updateWhere: (key, pred, patch) => {
    const a = load()[key] || [];
    a.forEach((x,i) => { if (pred(x)) a[i] = { ...x, ...patch }; });
    load()[key] = a; save();
  }
};
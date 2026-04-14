const fs = require('fs');
const glob = require('child_process').execSync('find public/holodeck/global_assets/music -name "mus_*.json"').toString().trim().split('\n');
let updated = 0;
for (const f of glob) {
  if (!f) continue;
  const asset = JSON.parse(fs.readFileSync(f, 'utf8'));
  const layers = asset.payload?.layers || [];
  let changed = false;
  for (const layer of layers) {
    if (!layer.oscType) {
      const n = (layer.name || '').toLowerCase();
      if (n.includes('drum') || n.includes('beat') || n.includes('perc')) layer.oscType = 'triangle';
      else if (n.includes('bass')) layer.oscType = 'sawtooth';
      else if (n.includes('pad')) layer.oscType = 'sine';
      else if (n.includes('lead')) layer.oscType = 'square';
      else layer.oscType = 'sine';
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(f, JSON.stringify(asset, null, 2) + '\n');
    updated++;
  }
}
console.log('Updated', updated, 'music assets with oscType');

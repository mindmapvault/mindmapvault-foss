const fs = require('fs');
const path = require('path');

function readOSS() {
  const p = path.resolve(__dirname, '..', 'OSS_VERSION');
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8').trim();
}

function backup(file) {
  const bak = `${file}.bak-ossbuild`;
  if (!fs.existsSync(bak) && fs.existsSync(file)) {
    fs.copyFileSync(file, bak);
  }
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function prepare() {
  const oss = readOSS();
  if (!oss) {
    console.log('No OSS_VERSION found; skipping OSS prep');
    return;
  }
  console.log('Preparing OSS build metadata for version', oss);

  // Do NOT modify frontend_app/package.json for OSS stamping — keep main frontend version intact.

  // desktop/src-tauri/tauri.conf.json
  const tauriFile = path.resolve(__dirname, '..', 'desktop', 'src-tauri', 'tauri.conf.json');
  if (fs.existsSync(tauriFile)) {
    backup(tauriFile);
    const tauri = JSON.parse(fs.readFileSync(tauriFile, 'utf8'));
    // Update top-level productName and version fields (do not add unexpected keys)
    tauri.productName = `${tauri.productName || 'MindMapVault'}-oss`;
    tauri.version = oss;
    writeJson(tauriFile, tauri);
  }

  // desktop/src-tauri/Cargo.toml
  const cargoFile = path.resolve(__dirname, '..', 'desktop', 'src-tauri', 'Cargo.toml');
  if (fs.existsSync(cargoFile)) {
    backup(cargoFile);
    let cargo = fs.readFileSync(cargoFile, 'utf8');
    cargo = cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${oss}"`);
    fs.writeFileSync(cargoFile, cargo, 'utf8');
  }
}

prepare();

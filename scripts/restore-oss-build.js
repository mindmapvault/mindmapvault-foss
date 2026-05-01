const fs = require('fs');
const path = require('path');

function restore(file) {
  const bak = `${file}.bak-ossbuild`;
  if (fs.existsSync(bak)) {
    fs.copyFileSync(bak, file);
    fs.unlinkSync(bak);
    console.log('Restored', file);
  }
}

function restoreAll() {
  const base = path.resolve(__dirname, '..');
  restore(path.resolve(base, 'frontend_app', 'package.json'));
  restore(path.resolve(base, 'desktop', 'src-tauri', 'tauri.conf.json'));
  restore(path.resolve(base, 'desktop', 'src-tauri', 'Cargo.toml'));
}

restoreAll();

const fs = require('fs');

function getLatestReleasedVersionFromChangelog(changelogText) {
  const headerRegex = /^##\s+\[([^\]]+)\](?:\s*-\s*(.+))?\s*$/gm;
  let match;

  while ((match = headerRegex.exec(changelogText)) !== null) {
    const version = (match[1] || '').trim();
    const suffix = (match[2] || '').trim().toLowerCase();

    if (!version || version.toLowerCase() === 'unreleased') {
      continue;
    }
    if (suffix.includes('planned')) {
      continue;
    }

    return version;
  }

  return null;
}

function toOssVersion(version) {
  return version.endsWith('-oss') ? version : `${version}-oss`;
}

try {
  const pkg = JSON.parse(fs.readFileSync('frontend_app/package.json', 'utf8')).version;
  const tauri = JSON.parse(fs.readFileSync('desktop/src-tauri/tauri.conf.json', 'utf8')).version;
  const cargo = (fs.readFileSync('desktop/src-tauri/Cargo.toml', 'utf8').match(/^version\s*=\s*"([^\"]+)"/m) || [])[1];
  const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
  if (!pkg || !tauri || !cargo) {
    console.error('Failed to read one or more versions');
    process.exit(1);
  }

  const latestReleased = getLatestReleasedVersionFromChangelog(changelog);
  if (!latestReleased) {
    console.error('Could not determine latest released version from CHANGELOG.md');
    process.exit(1);
  }
  const expectedOssVersion = toOssVersion(latestReleased);

  // If an OSS_VERSION file exists, read it and ensure OSS numbering is intentionally different
  let ossVersion = null;
  try {
    if (fs.existsSync('OSS_VERSION')) {
      ossVersion = fs.readFileSync('OSS_VERSION', 'utf8').trim();
    }
  } catch (e) {
    // ignore
  }

  if (!(pkg === tauri && tauri === cargo)) {
    console.warn(`Warning: main project versions differ: frontend_app=${pkg}, tauri=${tauri}, cargo=${cargo}`);
    console.warn('This repository uses OSS-specific stamping; mismatched main versions are allowed for OSS development.');
  }

  if (ossVersion) {
    if (ossVersion !== expectedOssVersion) {
      console.error(`OSS_VERSION must follow CHANGELOG latest release version. Expected ${expectedOssVersion}, got ${ossVersion}.`);
      process.exit(1);
    }

    if (ossVersion === pkg) {
      console.error(`OSS version must be different from main version. Both are ${pkg}. Update OSS_VERSION to a different numbering.`);
      process.exit(1);
    }

    if (tauri !== ossVersion) {
      console.error(`Tauri version must match OSS_VERSION. tauri.conf.json=${tauri}, OSS_VERSION=${ossVersion}.`);
      process.exit(1);
    }

    console.log(`Main version: ${pkg} (cargo: ${cargo})`);
    console.log(`Latest CHANGELOG release: ${latestReleased}`);
    console.log(`OSS version OK: ${ossVersion}`);
    console.log(`Tauri version OK: ${tauri}`);
  } else {
    console.log(`Main version: ${pkg}`);
    console.warn(`Warning: OSS_VERSION not found. Expected for OSS workflow (${expectedOssVersion}).`);
  }
} catch (err) {
  console.error('Version check failed:', err && err.message ? err.message : err);
  process.exit(1);
}

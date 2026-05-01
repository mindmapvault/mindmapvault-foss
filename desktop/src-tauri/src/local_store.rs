//! Local file-based storage for standalone (offline) mode.
//!
//! Directory layout under `$APPDATA/com.mindmapvault.app/`:
//!
//! ```text
//! local/
//!   profile.json          ← encrypted key bundle (same fields as server User)
//!   vaults/
//!     index.json          ← array of VaultMeta (title, KEM envelope, etc.)
//!     {uuid}.md           ← encrypted mind-map blob (same format as MinIO)
//!     {uuid}.bin          ← legacy encrypted blob path (read during migration)
//! ```
//!
//! All plaintext encryption/decryption is done in the frontend JS crypto layer.
//! These commands only shuttle opaque bytes and JSON between the filesystem and
//! the renderer.

use std::fs;
use std::path::PathBuf;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const LOCAL_SCHEMA_VERSION: u32 = 1;

// ── Error type ───────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum LocalStoreError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Not found: {0}")]
    NotFound(String),
}

impl serde::Serialize for LocalStoreError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

// ── Data types ───────────────────────────────────────────────────────────────

/// Local user profile — mirrors the server's User record but stored locally.
/// Contains the encrypted key bundle needed to unlock vaults.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalProfile {
    pub username: String,
    pub argon2_salt: String,
    pub argon2_params: Argon2Params,
    pub classical_public_key: String,
    pub pq_public_key: String,
    pub classical_priv_encrypted: String,
    pub pq_priv_encrypted: String,
    pub key_version: u32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Argon2Params {
    pub m_cost: u32,
    pub t_cost: u32,
    pub p_cost: u32,
}

/// Metadata for one local vault — stored in `vaults/index.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalVaultMeta {
    pub id: String,
    pub title_encrypted: String,
    pub eph_classical_public: String,
    pub eph_pq_ciphertext: String,
    pub wrapped_dek: String,
    pub vault_color: Option<String>,
    pub vault_note_encrypted: Option<String>,
    #[serde(default = "default_vault_sharing_mode")]
    pub vault_sharing_mode: String,
    #[serde(default = "default_vault_encryption_mode")]
    pub vault_encryption_mode: String,
    pub max_versions: u32,
    pub created_at: String,
    pub updated_at: String,
}

fn default_vault_sharing_mode() -> String {
    "private".to_string()
}

fn default_vault_encryption_mode() -> String {
    "standard".to_string()
}

/// The on-disk index file.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct VaultIndex {
    vaults: Vec<LocalVaultMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LocalStoreMeta {
    schema_version: u32,
    last_migrated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct LocalStoreConfig {
    /// The root storage folder. Per-user data lives in `{root}/{username}/`.
    storage_dir_override: Option<String>,
    /// Currently active username (used to select the per-user sub-directory).
    active_username: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalStorageDirInfo {
    pub path: String,
    pub is_override: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalVaultStorageInfo {
    pub id: String,
    pub title_encrypted: String,
    pub version_count: u32,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalStorageSummary {
    pub vaults: Vec<LocalVaultStorageInfo>,
    pub total_bytes: u64,
    pub free_tier_bytes: u64,
}

// ── Path helpers ──────────────────────────────────────────────────────────────

fn local_dir(app: &AppHandle) -> Result<PathBuf, LocalStoreError> {
    let cfg = read_config(app)?;
    let username = cfg.active_username.as_deref().unwrap_or("default");
    let dir = root_dir(app)?.join(username);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn config_path(app: &AppHandle) -> Result<PathBuf, LocalStoreError> {
    let base = app
        .path()
        .app_config_dir()
        .map_err(|e| LocalStoreError::Io(std::io::Error::other(e.to_string())))?;
    fs::create_dir_all(&base)?;
    Ok(base.join("local_store_config.json"))
}

fn read_config(app: &AppHandle) -> Result<LocalStoreConfig, LocalStoreError> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(LocalStoreConfig::default());
    }
    let data = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&data)?)
}

fn write_config(app: &AppHandle, cfg: &LocalStoreConfig) -> Result<(), LocalStoreError> {
    let path = config_path(app)?;
    write_json_atomic(&path, cfg)
}

fn default_root_dir(app: &AppHandle) -> Result<PathBuf, LocalStoreError> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| LocalStoreError::Io(std::io::Error::other(e.to_string())))?;
    Ok(base.join("local"))
}

/// Returns the root storage directory (the parent of all per-user folders).
fn root_dir(app: &AppHandle) -> Result<PathBuf, LocalStoreError> {
    let cfg = read_config(app)?;
    if let Some(path) = cfg.storage_dir_override {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    default_root_dir(app)
}

/// Returns the AppData directory that holds all per-user profile files.
fn profiles_dir(app: &AppHandle) -> Result<PathBuf, LocalStoreError> {
    let base = app
        .path()
        .app_config_dir()
        .map_err(|e| LocalStoreError::Io(std::io::Error::other(e.to_string())))?;
    let dir = base.join("profiles");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn profile_path_for(app: &AppHandle, username: &str) -> Result<PathBuf, LocalStoreError> {
    Ok(profiles_dir(app)?.join(format!("{}.json", username)))
}

fn vaults_dir(app: &AppHandle) -> Result<PathBuf, LocalStoreError> {
    let dir = local_dir(app)?.join("vaults");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Returns the profile path for the currently active user.
fn profile_path(app: &AppHandle) -> Result<PathBuf, LocalStoreError> {
    let cfg = read_config(app)?;
    let username = cfg.active_username.as_deref().unwrap_or("default");
    profile_path_for(app, username)
}

/// Runs all profile migrations in order — idempotent, safe to call repeatedly.
///
/// 1. Vault-dir `profile.json` → `AppData/profile.json`   (pre-config-dir era)
/// 2. `AppData/profile.json` → `AppData/profiles/{username}.json`  (multi-user era)
/// 3. `storage_dir_override` is trimmed of its username suffix so it points at
///    the root dir instead of the per-user sub-directory.
fn migrate_if_needed(app: &AppHandle) -> Result<(), LocalStoreError> {
    let config_base = app
        .path()
        .app_config_dir()
        .map_err(|e| LocalStoreError::Io(std::io::Error::other(e.to_string())))?;
    let legacy_profile = config_base.join("profile.json");

    // Step 1: vault-dir → AppData (very old migration, best-effort)
    if !legacy_profile.exists() {
        let cfg = read_config(app).unwrap_or_default();
        if let Some(ref override_path) = cfg.storage_dir_override {
            let old = PathBuf::from(override_path.trim()).join("profile.json");
            if old.exists() {
                let _ = fs::copy(&old, &legacy_profile);
                let _ = fs::remove_file(&old);
            }
        }
    }

    // Step 2: single profile.json → per-user profiles/{username}.json
    let cfg = read_config(app).unwrap_or_default();
    if cfg.active_username.is_none() && legacy_profile.exists() {
        let data = fs::read_to_string(&legacy_profile)?;
        let profile: LocalProfile = serde_json::from_str(&data)?;
        let username = profile.username.clone();

        let new_path = profile_path_for(app, &username)?;
        if !new_path.exists() {
            fs::copy(&legacy_profile, &new_path)?;
        }
        let _ = fs::remove_file(&legacy_profile);

        let mut new_cfg = cfg.clone();
        new_cfg.active_username = Some(username.clone());

        // Step 3: if override ends with /{username}, trim it to get the root dir
        if let Some(ref override_path) = cfg.storage_dir_override {
            let trimmed = override_path.trim();
            let p = PathBuf::from(trimmed);
            if p.file_name().and_then(|n| n.to_str()) == Some(username.as_str()) {
                if let Some(parent) = p.parent() {
                    let parent_str = parent.to_string_lossy().to_string();
                    if !parent_str.is_empty() {
                        new_cfg.storage_dir_override = Some(parent_str);
                    }
                }
            }
        }
        write_config(app, &new_cfg)?;
    }

    Ok(())
}

fn meta_path(app: &AppHandle) -> Result<PathBuf, LocalStoreError> {
    Ok(local_dir(app)?.join("meta.json"))
}

fn index_path(app: &AppHandle) -> Result<PathBuf, LocalStoreError> {
    Ok(vaults_dir(app)?.join("index.json"))
}

fn blob_path(app: &AppHandle, id: &str) -> Result<PathBuf, LocalStoreError> {
    Ok(vaults_dir(app)?.join(format!("{id}.md")))
}

fn legacy_blob_path(app: &AppHandle, id: &str) -> Result<PathBuf, LocalStoreError> {
    Ok(vaults_dir(app)?.join(format!("{id}.bin")))
}

fn existing_blob_path(app: &AppHandle, id: &str) -> Result<PathBuf, LocalStoreError> {
    let preferred = blob_path(app, id)?;
    if preferred.exists() {
        return Ok(preferred);
    }

    let legacy = legacy_blob_path(app, id)?;
    if legacy.exists() {
        return Ok(legacy);
    }

    Ok(preferred)
}

fn write_bytes_atomic(path: &PathBuf, data: &[u8]) -> Result<(), LocalStoreError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let tmp_path = path.with_extension(format!("tmp-{}", Uuid::new_v4()));
    fs::write(&tmp_path, data)?;

    if path.exists() {
        fs::remove_file(path)?;
    }

    fs::rename(&tmp_path, path)?;
    Ok(())
}

fn write_json_atomic<T: Serialize>(path: &PathBuf, value: &T) -> Result<(), LocalStoreError> {
    let data = serde_json::to_vec_pretty(value)?;
    write_bytes_atomic(path, &data)
}

fn dir_size_recursive(path: &PathBuf) -> Result<u64, LocalStoreError> {
    if !path.exists() {
        return Ok(0);
    }

    if path.is_file() {
        return Ok(fs::metadata(path)?.len());
    }

    let mut total = 0u64;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let entry_path = entry.path();
        if entry_path.is_file() {
            total = total.saturating_add(entry.metadata()?.len());
        } else if entry_path.is_dir() {
            total = total.saturating_add(dir_size_recursive(&entry_path)?);
        }
    }

    Ok(total)
}

fn ensure_storage_initialized(app: &AppHandle) -> Result<(), LocalStoreError> {
    let _ = local_dir(app)?;
    let _ = vaults_dir(app)?;

    let now = Utc::now().to_rfc3339();
    let meta_path = meta_path(app)?;

    if !meta_path.exists() {
        write_json_atomic(
            &meta_path,
            &LocalStoreMeta {
                schema_version: LOCAL_SCHEMA_VERSION,
                last_migrated_at: now,
            },
        )?;
    } else {
        let data = fs::read_to_string(&meta_path)?;
        let mut meta: LocalStoreMeta = serde_json::from_str(&data)?;

        if meta.schema_version < LOCAL_SCHEMA_VERSION {
            meta.schema_version = LOCAL_SCHEMA_VERSION;
            meta.last_migrated_at = Utc::now().to_rfc3339();
            write_json_atomic(&meta_path, &meta)?;
        }
    }

    let idx_path = index_path(app)?;
    if !idx_path.exists() {
        write_json_atomic(&idx_path, &VaultIndex::default())?;
    }

    Ok(())
}

fn read_index(app: &AppHandle) -> Result<VaultIndex, LocalStoreError> {
    let path = index_path(app)?;
    if !path.exists() {
        return Ok(VaultIndex::default());
    }
    let data = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&data)?)
}

fn write_index(app: &AppHandle, index: &VaultIndex) -> Result<(), LocalStoreError> {
    let path = index_path(app)?;
    write_json_atomic(&path, index)?;
    Ok(())
}

// ── Profile commands ──────────────────────────────────────────────────────────

/// Returns the active user's local profile if it exists, or null.
#[tauri::command]
pub fn get_local_profile(app: AppHandle) -> Result<Option<LocalProfile>, LocalStoreError> {
    let _ = migrate_if_needed(&app); // silently run all migrations
    ensure_storage_initialized(&app)?;
    let path = profile_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(&path)?;
    Ok(Some(serde_json::from_str(&data)?))
}

/// Creates or overwrites a local profile and activates that user.
#[tauri::command]
pub fn save_local_profile(app: AppHandle, profile: LocalProfile) -> Result<(), LocalStoreError> {
    let path = profile_path_for(&app, &profile.username)?;
    write_json_atomic(&path, &profile)?;
    // Activate this user so vault operations use their sub-directory.
    let mut cfg = read_config(&app)?;
    cfg.active_username = Some(profile.username.clone());
    write_config(&app, &cfg)?;
    ensure_storage_initialized(&app)?;
    Ok(())
}

/// Deletes the active user's profile file and all their vaults.
#[tauri::command]
pub fn delete_local_profile(app: AppHandle) -> Result<(), LocalStoreError> {
    // Remove the profile json
    if let Ok(path) = profile_path(&app) {
        if path.exists() { let _ = fs::remove_file(&path); }
    }
    // Remove the vault directory
    let dir = local_dir(&app)?;
    if dir.exists() {
        fs::remove_dir_all(&dir)?;
    }
    // Clear active_username so the next launch shows the selector
    let mut cfg = read_config(&app)?;
    cfg.active_username = None;
    let _ = write_config(&app, &cfg);
    Ok(())
}

// ── Vault CRUD commands ──────────────────────────────────────────────────────

/// Lists all local vault metadata entries.
#[tauri::command]
pub fn list_local_vaults(app: AppHandle) -> Result<Vec<LocalVaultMeta>, LocalStoreError> {
    ensure_storage_initialized(&app)?;
    let index = read_index(&app)?;
    Ok(index.vaults)
}

/// Creates a new vault entry (metadata only — blob is saved separately).
/// Returns the generated vault id.
#[tauri::command]
pub fn save_local_vault(
    app: AppHandle,
    title_encrypted: String,
    eph_classical_public: String,
    eph_pq_ciphertext: String,
    wrapped_dek: String,
) -> Result<String, LocalStoreError> {
    ensure_storage_initialized(&app)?;
    let mut index = read_index(&app)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    index.vaults.push(LocalVaultMeta {
        id: id.clone(),
        title_encrypted,
        eph_classical_public,
        eph_pq_ciphertext,
        wrapped_dek,
        vault_color: None,
        vault_note_encrypted: None,
        vault_sharing_mode: default_vault_sharing_mode(),
        vault_encryption_mode: default_vault_encryption_mode(),
        max_versions: 50,
        created_at: now.clone(),
        updated_at: now,
    });

    write_index(&app, &index)?;
    Ok(id)
}

/// Returns full metadata for a single vault.
#[tauri::command]
pub fn get_local_vault_detail(
    app: AppHandle,
    id: String,
) -> Result<LocalVaultMeta, LocalStoreError> {
    ensure_storage_initialized(&app)?;
    let index = read_index(&app)?;
    index
        .vaults
        .into_iter()
        .find(|v| v.id == id)
        .ok_or_else(|| LocalStoreError::NotFound(format!("vault {id}")))
}

/// Saves the encrypted blob for a vault.
#[tauri::command]
pub fn save_local_vault_blob(
    app: AppHandle,
    id: String,
    blob: Vec<u8>,
) -> Result<(), LocalStoreError> {
    ensure_storage_initialized(&app)?;
    let path = blob_path(&app, &id)?;
    write_bytes_atomic(&path, &blob)?;
    let legacy_path = legacy_blob_path(&app, &id)?;
    if legacy_path.exists() {
        fs::remove_file(&legacy_path)?;
    }

    // Update the timestamp
    let mut index = read_index(&app)?;
    if let Some(v) = index.vaults.iter_mut().find(|v| v.id == id) {
        v.updated_at = Utc::now().to_rfc3339();
    }
    write_index(&app, &index)?;
    Ok(())
}

/// Reads the encrypted blob for a vault.
#[tauri::command]
pub fn get_local_vault_blob(app: AppHandle, id: String) -> Result<Vec<u8>, LocalStoreError> {
    ensure_storage_initialized(&app)?;
    let path = existing_blob_path(&app, &id)?;
    if !path.exists() {
        return Err(LocalStoreError::NotFound(format!("blob for vault {id}")));
    }
    Ok(fs::read(&path)?)
}

/// Deletes a vault (metadata + blob).
#[tauri::command]
pub fn delete_local_vault(app: AppHandle, id: String) -> Result<(), LocalStoreError> {
    ensure_storage_initialized(&app)?;
    let mut index = read_index(&app)?;
    index.vaults.retain(|v| v.id != id);
    write_index(&app, &index)?;

    let path = blob_path(&app, &id)?;
    if path.exists() {
        fs::remove_file(&path)?;
    }
    let legacy_path = legacy_blob_path(&app, &id)?;
    if legacy_path.exists() {
        fs::remove_file(&legacy_path)?;
    }
    Ok(())
}

/// Updates vault display metadata (color, note, max_versions, title).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_local_vault_meta(
    app: AppHandle,
    id: String,
    vault_color: Option<String>,
    vault_note_encrypted: Option<String>,
    vault_sharing_mode: Option<String>,
    vault_encryption_mode: Option<String>,
    max_versions: Option<u32>,
    title_encrypted: Option<String>,
    eph_classical_public: Option<String>,
    eph_pq_ciphertext: Option<String>,
    wrapped_dek: Option<String>,
) -> Result<(), LocalStoreError> {
    ensure_storage_initialized(&app)?;
    let mut index = read_index(&app)?;
    let vault = index
        .vaults
        .iter_mut()
        .find(|v| v.id == id)
        .ok_or_else(|| LocalStoreError::NotFound(format!("vault {id}")))?;

    if let Some(c) = vault_color {
        vault.vault_color = Some(c);
    }
    if let Some(n) = vault_note_encrypted {
        vault.vault_note_encrypted = Some(n);
    }
    if let Some(mode) = vault_sharing_mode {
        vault.vault_sharing_mode = mode;
    }
    if let Some(mode) = vault_encryption_mode {
        vault.vault_encryption_mode = mode;
    }
    if let Some(mv) = max_versions {
        vault.max_versions = mv.max(1);
    }
    if let Some(t) = title_encrypted {
        vault.title_encrypted = t;
        vault.updated_at = Utc::now().to_rfc3339();
    }
    // Always update KEM envelope when provided — the blob was re-encrypted with a new DEK.
    if let Some(pk) = eph_classical_public {
        vault.eph_classical_public = pk;
    }
    if let Some(ct) = eph_pq_ciphertext {
        vault.eph_pq_ciphertext = ct;
    }
    if let Some(dek) = wrapped_dek {
        vault.wrapped_dek = dek;
        vault.updated_at = Utc::now().to_rfc3339();
    }

    write_index(&app, &index)?;
    Ok(())
}

// ── File import / export ─────────────────────────────────────────────────────

/// Exports a vault (metadata + blob) to a single .cmvault file.
/// The file format is: 4-byte JSON length (LE) ‖ JSON metadata ‖ blob bytes.
#[tauri::command]
pub fn export_vault_file(
    app: AppHandle,
    id: String,
    dest_path: String,
) -> Result<(), LocalStoreError> {
    ensure_storage_initialized(&app)?;
    let index = read_index(&app)?;
    let vault = index
        .vaults
        .iter()
        .find(|v| v.id == id)
        .ok_or_else(|| LocalStoreError::NotFound(format!("vault {id}")))?;

    let meta_json = serde_json::to_vec(vault)?;
    let blob_data = {
        let path = existing_blob_path(&app, &id)?;
        if path.exists() {
            fs::read(&path)?
        } else {
            Vec::new()
        }
    };

    let meta_len = (meta_json.len() as u32).to_le_bytes();
    let mut file_data = Vec::with_capacity(4 + meta_json.len() + blob_data.len());
    file_data.extend_from_slice(&meta_len);
    file_data.extend_from_slice(&meta_json);
    file_data.extend_from_slice(&blob_data);

    write_bytes_atomic(&PathBuf::from(dest_path), &file_data)?;
    Ok(())
}

/// Imports a .cmvault file into the local store. Returns the new vault id.
#[tauri::command]
pub fn import_vault_file(app: AppHandle, src_path: String) -> Result<String, LocalStoreError> {
    ensure_storage_initialized(&app)?;
    let file_data = fs::read(&src_path)?;
    if file_data.len() < 4 {
        return Err(LocalStoreError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "file too small",
        )));
    }

    let meta_len = u32::from_le_bytes([file_data[0], file_data[1], file_data[2], file_data[3]]) as usize;
    if file_data.len() < 4 + meta_len {
        return Err(LocalStoreError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "truncated file",
        )));
    }

    let meta: LocalVaultMeta = serde_json::from_slice(&file_data[4..4 + meta_len])?;
    let blob_data = &file_data[4 + meta_len..];

    // Assign a new ID to avoid collisions.
    let new_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    let mut index = read_index(&app)?;
    index.vaults.push(LocalVaultMeta {
        id: new_id.clone(),
        title_encrypted: meta.title_encrypted,
        eph_classical_public: meta.eph_classical_public,
        eph_pq_ciphertext: meta.eph_pq_ciphertext,
        wrapped_dek: meta.wrapped_dek,
        vault_color: meta.vault_color,
        vault_note_encrypted: meta.vault_note_encrypted,
        vault_sharing_mode: meta.vault_sharing_mode,
        vault_encryption_mode: meta.vault_encryption_mode,
        max_versions: meta.max_versions,
        created_at: now.clone(),
        updated_at: now,
    });
    write_index(&app, &index)?;

    if !blob_data.is_empty() {
        let path = blob_path(&app, &new_id)?;
        write_bytes_atomic(&path, blob_data)?;
    }

    Ok(new_id)
}

// ── Local storage directory config ───────────────────────────────────────────

#[tauri::command]
pub fn get_local_storage_dir(app: AppHandle) -> Result<LocalStorageDirInfo, LocalStoreError> {
    let _ = migrate_if_needed(&app);
    let cfg = read_config(&app)?;
    let path = root_dir(&app)?;
    Ok(LocalStorageDirInfo {
        path: path.to_string_lossy().to_string(),
        is_override: cfg.storage_dir_override.as_deref().map(|v| !v.trim().is_empty()).unwrap_or(false),
    })
}

#[tauri::command]
pub fn set_local_storage_dir(app: AppHandle, path: String) -> Result<LocalStorageDirInfo, LocalStoreError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(LocalStoreError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Storage folder path cannot be empty",
        )));
    }

    let target = PathBuf::from(trimmed);
    fs::create_dir_all(&target)?;

    let mut cfg = read_config(&app)?;
    cfg.storage_dir_override = Some(trimmed.to_string());
    write_config(&app, &cfg)?;

    ensure_storage_initialized(&app)?;
    get_local_storage_dir(app)
}

#[tauri::command]
pub fn reset_local_storage_dir(app: AppHandle) -> Result<LocalStorageDirInfo, LocalStoreError> {
    let mut cfg = read_config(&app)?;
    cfg.storage_dir_override = None;
    write_config(&app, &cfg)?;

    ensure_storage_initialized(&app)?;
    get_local_storage_dir(app)
}

#[tauri::command]
pub fn pick_local_storage_dir() -> Result<Option<String>, LocalStoreError> {
    let picked = rfd::FileDialog::new().pick_folder();
    Ok(picked.map(|p| p.to_string_lossy().to_string()))
}

/// Lists all locally available profile usernames (scans AppData/profiles/).
#[tauri::command]
pub fn list_local_profiles(app: AppHandle) -> Result<Vec<String>, LocalStoreError> {
    let _ = migrate_if_needed(&app);
    let dir = profiles_dir(&app)?;
    let mut names = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                names.push(stem.to_string());
            }
        }
    }
    names.sort();
    Ok(names)
}

/// Switches the active user and returns their profile.
#[tauri::command]
pub fn set_active_user(app: AppHandle, username: String) -> Result<LocalProfile, LocalStoreError> {
    let path = profile_path_for(&app, &username)?;
    if !path.exists() {
        return Err(LocalStoreError::NotFound(format!("profile for {username}")));
    }
    let mut cfg = read_config(&app)?;
    cfg.active_username = Some(username);
    write_config(&app, &cfg)?;
    ensure_storage_initialized(&app)?;
    let data = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&data)?)
}

#[tauri::command]
pub fn is_wsl_environment() -> bool {
    if cfg!(target_os = "linux") {
        if let Ok(release) = fs::read_to_string("/proc/sys/kernel/osrelease") {
            return release.to_lowercase().contains("microsoft");
        }
    }
    false
}

#[tauri::command]
pub fn get_local_storage_summary(app: AppHandle) -> Result<LocalStorageSummary, LocalStoreError> {
    ensure_storage_initialized(&app)?;

    let local_root = local_dir(&app)?;
    let total_bytes = dir_size_recursive(&local_root)?;

    let index = read_index(&app)?;
    let mut vaults = Vec::with_capacity(index.vaults.len());

    for v in index.vaults {
        let path = existing_blob_path(&app, &v.id)?;
        let blob_size = if path.exists() {
            fs::metadata(&path)?.len()
        } else {
            0
        };

        vaults.push(LocalVaultStorageInfo {
            id: v.id,
            title_encrypted: v.title_encrypted,
            version_count: if blob_size > 0 { 1 } else { 0 },
            total_bytes: blob_size,
        });
    }

    Ok(LocalStorageSummary {
        vaults,
        total_bytes,
        free_tier_bytes: 50 * 1024 * 1024,
    })
}

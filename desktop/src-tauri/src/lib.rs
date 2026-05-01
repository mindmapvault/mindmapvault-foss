mod local_store;

use local_store::{
    delete_local_profile, delete_local_vault, export_vault_file, get_local_profile,
    get_local_storage_dir, get_local_storage_summary, get_local_vault_blob, get_local_vault_detail,
    import_vault_file, is_wsl_environment, list_local_profiles, list_local_vaults,
    pick_local_storage_dir, reset_local_storage_dir, save_local_profile,
    save_local_vault, save_local_vault_blob, set_active_user, set_local_storage_dir,
    update_local_vault_meta,
};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // Local profile management
            get_local_profile,
            save_local_profile,
            delete_local_profile,
            list_local_profiles,
            set_active_user,
            // Local vault CRUD
            list_local_vaults,
            save_local_vault,
            get_local_vault_detail,
            save_local_vault_blob,
            get_local_vault_blob,
            delete_local_vault,
            update_local_vault_meta,
            // Local storage folder config
            get_local_storage_dir,
            get_local_storage_summary,
            set_local_storage_dir,
            reset_local_storage_dir,
            pick_local_storage_dir,
            is_wsl_environment,
            // Import / Export
            export_vault_file,
            import_vault_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MindMapVault desktop");
}

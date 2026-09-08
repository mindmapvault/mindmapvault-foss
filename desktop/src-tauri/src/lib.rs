mod local_store;

use local_store::{
    delete_local_profile, delete_local_vault, export_vault_file, get_local_profile,
    get_local_storage_dir, get_local_storage_summary, get_local_vault_blob, get_local_vault_detail,
    import_vault_file, is_wsl_environment, list_local_profiles, list_local_vaults,
    reset_local_storage_dir, save_export_file, save_local_profile,
    save_local_vault, save_local_vault_blob, set_active_user, set_local_storage_dir,
    update_local_vault_meta, verify_local_vault_integrity,
};
use local_store::apply_local_password_rotation;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, Submenu, SubmenuBuilder},
    Emitter,
};
#[cfg(debug_assertions)]
use tauri::Manager;

// DevTools exposed the session's decrypted key material to anyone with access
// to a *built* copy of the app (session keys and decrypted content live in
// the JS heap and are reachable from the console) — closed for release
// builds as a security fix. `debug_assertions` is false for `tauri build` /
// `cargo build --release` and true for `tauri dev`, so this menu item — and
// the underlying devtools capability, since the `devtools` Cargo feature is
// no longer enabled in Cargo.toml — only exist in development builds.
#[cfg(debug_assertions)]
const OPEN_WEBVIEW_DEVTOOLS_MENU_ID: &str = "open-webview-devtools";

/// The `mac` keyboard layout is the macOS default (see
/// frontend_app/src/shortcuts/registry.ts); every other platform defaults to
/// `freemind`. The four menu items below have genuinely different bindings
/// between the two layouts, so the accelerator shown in the menu follows
/// whichever layout this build's platform defaults to. A user who overrides
/// their layout in Settings keeps the *keyboard* binding that choice implies
/// — only the menu's displayed accelerator can drift from it, and clicking
/// the item always dispatches the right action regardless.
fn platform_accelerator(mac: &'static str, freemind: &'static str) -> &'static str {
    if cfg!(target_os = "macos") { mac } else { freemind }
}

fn build_app_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Submenu<R>> {
    SubmenuBuilder::new(app, "MindMapVault")
        .about(None)
        .separator()
        .item(&MenuItemBuilder::with_id("app.settings", "Settings…").accelerator("CmdOrCtrl+,").build(app)?)
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()
}

fn build_file_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let attach_accel = platform_accelerator("CmdOrCtrl+O", "F6");
    SubmenuBuilder::new(app, "File")
        .item(&MenuItemBuilder::with_id("file.save", "Save").accelerator("CmdOrCtrl+S").build(app)?)
        .item(&MenuItemBuilder::with_id("node.attachFile", "Attach File…").accelerator(attach_accel).build(app)?)
        .separator()
        .close_window()
        .build()
}

fn build_edit_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Submenu<R>> {
    // Undo/Redo are custom items dispatching into the app's own tree-history,
    // not `PredefinedMenuItem::undo/redo` — those route to OS-level undo,
    // are unsupported on Windows/Linux, and would be semantically wrong here
    // even where they exist. Cut/Copy/Paste/Select All are genuine OS
    // text-field operations, so those stay predefined.
    SubmenuBuilder::new(app, "Edit")
        .item(&MenuItemBuilder::with_id("edit.undo", "Undo").accelerator("CmdOrCtrl+Z").build(app)?)
        .item(&MenuItemBuilder::with_id("edit.redo", "Redo").accelerator("CmdOrCtrl+Shift+Z").build(app)?)
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&MenuItemBuilder::with_id("find.search", "Find").accelerator("CmdOrCtrl+F").build(app)?)
        .build()
}

fn build_view_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Submenu<R>> {
    SubmenuBuilder::new(app, "View")
        .item(&MenuItemBuilder::with_id("view.leanMode", "Lean Mode").build(app)?)
        .item(&MenuItemBuilder::with_id("view.colourTray", "Colour Tray").accelerator("CmdOrCtrl+Shift+1").build(app)?)
        .item(&MenuItemBuilder::with_id("view.iconTray", "Icon Tray").accelerator("CmdOrCtrl+Shift+2").build(app)?)
        .item(&MenuItemBuilder::with_id("view.statusBar", "Status Bar").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("view.zoomIn", "Zoom In").build(app)?)
        .item(&MenuItemBuilder::with_id("view.zoomOut", "Zoom Out").build(app)?)
        .item(&MenuItemBuilder::with_id("view.zoomFit", "Fit to Window").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("view.focusMode", "Focus Mode").accelerator("CmdOrCtrl+Shift+F").build(app)?)
        .build()
}

fn build_node_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let rename_accel = platform_accelerator("CmdOrCtrl+Enter", "F2");
    let notes_accel = platform_accelerator("CmdOrCtrl+Shift+K", "F3");
    SubmenuBuilder::new(app, "Node")
        .item(&MenuItemBuilder::with_id("node.addChild", "Add Child").build(app)?)
        .item(&MenuItemBuilder::with_id("node.addSibling", "Add Sibling").build(app)?)
        .item(&MenuItemBuilder::with_id("node.rename", "Rename").accelerator(rename_accel).build(app)?)
        .item(&MenuItemBuilder::with_id("node.notesToggle", "Notes").accelerator(notes_accel).build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("node.delete", "Delete").build(app)?)
        .build()
}

fn build_help_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let shortcuts_accel = platform_accelerator("CmdOrCtrl+/", "F1");
    let builder = SubmenuBuilder::new(app, "Help").item(
        &MenuItemBuilder::with_id("find.shortcuts", "Keyboard Shortcuts")
            .accelerator(shortcuts_accel)
            .build(app)?,
    );

    #[cfg(debug_assertions)]
    let builder = builder.separator().item(
        &MenuItemBuilder::with_id(OPEN_WEBVIEW_DEVTOOLS_MENU_ID, "Open WebView Devtools")
            .accelerator("CmdOrCtrl+Shift+I")
            .build(app)?,
    );

    builder.build()
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();
            let menu = MenuBuilder::new(app)
                .items(&[
                    &build_app_menu(handle)?,
                    &build_file_menu(handle)?,
                    &build_edit_menu(handle)?,
                    &build_view_menu(handle)?,
                    &build_node_menu(handle)?,
                    &build_help_menu(handle)?,
                ])
                .build()?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            #[cfg(debug_assertions)]
            if id == OPEN_WEBVIEW_DEVTOOLS_MENU_ID {
                if let Some(main_window) = app.get_webview_window("main") {
                    main_window.open_devtools();
                }
                return;
            }
            let _ = app.emit("menu:command", id);
        })
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
            is_wsl_environment,
            // Import / Export
            export_vault_file,
            import_vault_file,
            save_export_file,
            // Password rotation
            apply_local_password_rotation,
            // Integrity verification
            verify_local_vault_integrity,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MindMapVault desktop");
}

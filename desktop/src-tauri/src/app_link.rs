//! Opens links that point at another app on this computer, such as
//! `obsidian://open?vault=…` or `zotero://select/…`.
//!
//! The shell plugin's `open` only takes http(s), mailto and tel from the
//! webview, and its scope is a regex that cannot say "any scheme but these".
//! So the check lives here.

use tauri_plugin_shell::ShellExt;

/// Schemes that run code, read local files, point back into the app, or have
/// been abused on Windows (ms-msdt, search-ms).
const BLOCKED_SCHEMES: &[&str] = &[
    "javascript", "vbscript", "data", "file", "blob", "about", "tauri", "asset", "ipc",
    "http", "https", "ms-msdt", "search-ms", "search",
];

fn scheme_of(url: &str) -> Option<String> {
    let (scheme, _) = url.split_once(':')?;
    let mut chars = scheme.chars();
    let first = chars.next()?;
    if !first.is_ascii_alphabetic()
        || !chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
    {
        return None;
    }
    Some(scheme.to_ascii_lowercase())
}

fn check_app_link(url: &str) -> Result<(), String> {
    if url.is_empty() || url.len() > 4096 || url.chars().any(|c| c.is_control()) {
        return Err("invalid link".into());
    }
    let scheme = scheme_of(url).ok_or("link has no scheme")?;
    if BLOCKED_SCHEMES.contains(&scheme.as_str()) {
        return Err(format!("{scheme}: links are not opened this way"));
    }
    Ok(())
}

#[tauri::command]
pub fn open_app_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    check_app_link(&url)?;
    #[allow(deprecated)]
    app.shell().open(url, None).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::check_app_link;

    #[test]
    fn allows_other_app_links() {
        assert!(check_app_link("obsidian://open?vault=Notes&file=Idea").is_ok());
        assert!(check_app_link("zotero://select/library/items/ABC").is_ok());
        assert!(check_app_link("mailto:someone@example.com").is_ok());
    }

    #[test]
    fn refuses_dangerous_links() {
        for url in [
            "javascript:alert(1)",
            "JavaScript:alert(1)",
            "file:///etc/passwd",
            "ms-msdt:/id PCWDiagnostic",
            "https://example.com",
            "obsidian://open\n",
            "no scheme here",
        ] {
            assert!(check_app_link(url).is_err(), "{url}");
        }
    }
}

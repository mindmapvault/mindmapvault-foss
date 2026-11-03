//! Keeps access to a vault folder the user picked, across restarts.
//!
//! In the Mac App Store build the app runs in Apple's sandbox. Picking a folder
//! in the open dialog grants access to it only until the app quits; a saved
//! path alone does not reopen it. A security-scoped bookmark does: it is
//! created while access is granted and resolved on the next start.
//!
//! Outside the sandbox the bookmark is harmless, and on Windows and Linux
//! these functions do nothing.

#[cfg(target_os = "macos")]
mod imp {
    use super::Opened;
    use objc2::runtime::Bool;
    use objc2_foundation::{
        NSData, NSString, NSURLBookmarkCreationOptions, NSURLBookmarkResolutionOptions, NSURL,
    };

    pub fn create(path: &str) -> Option<Vec<u8>> {
        let url = NSURL::fileURLWithPath(&NSString::from_str(path));
        url.bookmarkDataWithOptions_includingResourceValuesForKeys_relativeToURL_error(
            NSURLBookmarkCreationOptions::WithSecurityScope,
            None,
            None,
        )
        .ok()
        .map(|data| data.to_vec())
    }

    pub fn open(bookmark: &[u8]) -> Option<Opened> {
        let data = NSData::with_bytes(bookmark);
        let mut stale = Bool::NO;
        // SAFETY: `data` is a valid NSData and `stale` outlives the call.
        let url = unsafe {
            NSURL::URLByResolvingBookmarkData_options_relativeToURL_bookmarkDataIsStale_error(
                &data,
                NSURLBookmarkResolutionOptions::WithSecurityScope,
                None,
                &mut stale,
            )
        }
        .ok()?;
        // Access is kept for the rest of the process on purpose: the vault is
        // read and written until the app quits. Called once per bookmark.
        // SAFETY: plain message send on a valid file URL.
        let started = unsafe { url.startAccessingSecurityScopedResource() };
        Some(Opened {
            path: url.path()?.to_string(),
            stale: stale.as_bool(),
            started,
        })
    }
}

#[cfg(not(target_os = "macos"))]
mod imp {
    pub fn create(_path: &str) -> Option<Vec<u8>> {
        None
    }

    pub fn open(_bookmark: &[u8]) -> Option<super::Opened> {
        None
    }
}

/// The folder a bookmark resolved to.
#[allow(dead_code)]
pub struct Opened {
    pub path: String,
    /// The folder moved or was renamed; the bookmark should be made again.
    pub stale: bool,
    /// Whether access was granted. False outside the sandbox, where none is needed.
    pub started: bool,
}

pub use imp::{create, open};

#!/usr/bin/env python3
"""Print the manifest with the local-checkout source swapped for a release.

Usage: render-flathub-manifest.py MANIFEST TAG COMMIT

Flathub builds from a pinned tag and commit, never from a local directory.
Everything else in the manifest is kept as written, comments included.
"""
import re
import sys

REPO = "https://github.com/mindmapvault/mindmapvault-foss.git"


def main() -> None:
    manifest_path, tag, commit = sys.argv[1:4]
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        sys.exit(f"commit must be a full sha, got {commit!r}")
    with open(manifest_path, encoding="utf-8") as f:
        text = f.read()

    # The marker line, then the `type: dir` entry with its indented keys.
    pattern = re.compile(
        r"^(?P<indent>\s*)# @@APP_SOURCE@@.*\n"
        r"(?P=indent)- type: dir\n"
        r"(?:(?P=indent)  .*\n)+",
        re.MULTILINE,
    )
    m = pattern.search(text)
    if not m:
        sys.exit("app source marker not found in " + manifest_path)
    ind = m.group("indent")
    replacement = (
        f"{ind}- type: git\n"
        f"{ind}  url: {REPO}\n"
        f"{ind}  tag: {tag}\n"
        f"{ind}  commit: {commit}\n"
    )
    # No x-checker-data on purpose: Flathub's checker would bump the tag
    # without regenerating the dependency lists. Our release workflow does
    # both.
    sys.stdout.write(text[: m.start()] + replacement + text[m.end():])


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Fill the metainfo <releases/> from CHANGELOG.md and print the result.

Usage: metainfo-releases.py CHANGELOG.md template.metainfo.xml

Each "## [x.y.z] - YYYY-MM-DD" heading becomes a <release>, described by the
summary paragraph under it. Runs inside the Flatpak build, so it uses the
standard library only.
"""
import re
import sys
from xml.sax.saxutils import escape

MAX_RELEASES = 15
HEADING = re.compile(r"^##\s+\[(\d+\.\d+\.\d+)\]\s*-\s*(\d{4}-\d{2}-\d{2})\s*$")


def plain(text: str) -> str:
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)  # links
    text = re.sub(r"[*`_]{1,2}([^*`_]+)[*`_]{1,2}", r"\1", text)  # emphasis, code
    return " ".join(text.split())


def releases(changelog: str):
    lines = changelog.splitlines()
    for i, line in enumerate(lines):
        m = HEADING.match(line)
        if not m:
            continue
        summary = []
        for nxt in lines[i + 1:]:
            if nxt.startswith("#") or nxt.startswith("- "):
                break
            if not nxt.strip():
                if summary:
                    break
                continue
            summary.append(nxt)
        yield m.group(1), m.group(2), plain(" ".join(summary))


def main() -> None:
    changelog_path, template_path = sys.argv[1], sys.argv[2]
    with open(changelog_path, encoding="utf-8-sig") as f:
        changelog = f.read()
    with open(template_path, encoding="utf-8") as f:
        template = f.read()

    items = []
    for version, date, summary in list(releases(changelog))[:MAX_RELEASES]:
        url = f"https://github.com/mindmapvault/mindmapvault-foss/releases/tag/v{version}"
        desc = f"\n      <description><p>{escape(summary)}</p></description>" if summary else ""
        items.append(
            f'    <release version="{version}" date="{date}">{desc}\n'
            f'      <url type="details">{url}</url>\n'
            f"    </release>"
        )
    if not items:
        sys.exit("no releases found in " + changelog_path)

    block = "<releases>\n" + "\n".join(items) + "\n  </releases>"
    if "<releases/>" not in template:
        sys.exit("template has no <releases/> placeholder")
    sys.stdout.write(template.replace("<releases/>", block))


if __name__ == "__main__":
    main()

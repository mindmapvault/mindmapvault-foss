# @mindmapvault/mindmap-core

How big a mind-map node is, what it is made of, where each part goes inside it,
and where the boxes land on the canvas. Pure arithmetic — no React, no app
state, no network.

It lives here because `mindmapvault-server` and `mindmapvault-saas` render the
same canvas from near-identical code, and every decoration added to a node
previously had to be added to the size calculation and to the renderer
separately, in both repos, correctly, by hand. They had already drifted.

## What is in it

| Module | What it owns |
|---|---|
| `constants.ts` | The layout numbers: band heights, padding, gaps |
| `text.ts` | Which lines of a node's text are shown rather than being attachment markdown |
| `geometry.ts` | `describeNode` → `measureNodeSize` → `nodeGeometry` |
| `layout.ts` | `layoutTree`, `bezierPath` |

The three geometry functions are one pipeline and are meant to be used as one:

- `describeNode(node)` reads the node **once** and returns which parts it has
  and how tall each band is.
- `measureNodeSize(node, parts)` adds those bands up into a width and height.
- `nodeGeometry(box, parts)` takes the box the layout produced and gives back
  where each band starts inside it.

Because the second and third both take the *same* `parts`, the renderer cannot
disagree with the measurement about how much room the tag strip needs. That is
the entire point; if you find yourself recomputing a band height at a call
site, put it in `describeNode` instead.

`layoutTree` puts the parts it measured each node from into that node's
`LayoutEntry`, so a renderer never has to call `describeNode` again — read
`entry.parts` and pass it straight to `nodeGeometry`.

## Node types

The package is generic over the node type (`N extends LayoutNode<N>`) rather
than importing an app's `MindMapTreeNode`, so each app keeps its own richer
node type and this package reads only the fields it needs.

## Keeping the two repos in step

`packages/` is per-repo, not a workspace: each app has its own copy, wired up
with a `paths` entry in `tsconfig.json` and an `alias` in `vite.config.ts`.
A change here has to be copied to the other repo by hand — the same deal as
`@mindmapvault/connectors`, which has already drifted between them. If you
change this package, change it in both.

# Canvas & artboard placement — single source truth

This file canonical guide how visual-plan canvas works: artboard
placement, lane layout, annotations, patching, and legacy kit tree. Read it
in full before authoring or editing any canvas/artboard content; not author
canvas layouts from memory or paraphrase these rules per mode.

<!-- SHARED-CORE:canvas-surface START -->

**coordinate rule.** `surface` locks each artboard's footprint and
aspect — never set artboard width/height and never use coordinates inside wireframe HTML; board-level artboard `x`/`y` allowed when it creates clear
lanes. Let canvas auto-placement handle simple one-row boards.

**Lay out mixed canvases in lanes.** When canvas contains broad browser /
desktop frames plus compact `mobile`, `popover`, or `panel` surfaces, not put
everything in one horizontal strip. Use board-level artboard `x`/`y` to reserve
lanes with generous empty space: main flow on one row, compact surfaces in their
own column or row, and loading/error states in lower row. Keep at least 96px
between rendered artboard rectangles plus room annotation gutters. Connect
only neighboring steps; never draw long connector that skips across unrelated
frames. Before handoff, inspect top canvas at default zoom and move any
frame whose label, connector, or annotation crosses another frame.

**Canvas annotations designer notes on artboard.** When top canvas present, sprinkle Figma-style notes near frames they explain: short
heading, supporting text, and bullets — plain text layers, never bordered or
shadowed cards, and never box around frame. renderer spaces notes away
from frames, so place each note by frame it describes. Use arrow only to
point at one specific control or transition; broad frame-level note, write
text beside frame with no connector. Connectors real sequences only —
never fake "Step 1 → Step 2" lines between independent states.

**not create overlapping annotations.** Anchor each ordinary note to frame it explains with `targetId` + `placement` (top/right/bottom/left), and
omit `type` or use `type: "note"`. renderer parks notes in gutter beside
frame and lays them out automatically. not use `type: "callout"`,
`type: "text"`, `type: "arrow"`, x/y, or points ordinary notes; those freeform review-markup layers and must reserved intentional markup in
open canvas space. Reserve arrows note that must point at one specific
control inside frame; note that simply sits beside its frame needs no arrow.

**Patching.** Edit one wireframe, canvas annotation, diagram, or block with targeted `contentPatches`
(for example `patch-wireframe-html`, `patch-diagram-html`, `update-block`,
`replace-blocks`, `update-canvas-annotation`) than regenerating whole plan. `contentPatches` part public MCP
action schema, so Claude Code, Codex, Cursor, and other hosts can make surgical
edits. If agent working from exported source files, use
`read-visual-plan-source` / `patch-visual-plan-source`: `plan.mdx` holds
frontmatter plus markdown/document blocks, `canvas.mdx` holds
`<DesignBoard>/<Section>/<Artboard>/<Screen>/<Annotation>/<Connector>`, and patch action normalizes MDX back into same JSON runtime model. JSON canonical runtime shape; MDX repo-friendly authoring/export surface.
In browser, humans edit `rich-text` prose inline; agents should still use
`update-rich-text` content patches or source patches prose, and use
comments/structured patches canvas, artboard, wireframe, and diagram edits.
Never send partial top-level `content` object as shortcut to add canvas,
frame, or block: `content` full structured replacement, so omitted blocks
or surfaces can disappear. If full replacement truly unavoidable, read complete source/JSON first, include every existing block and surface in new
payload, and verify source/export immediately after update.

**Never emit titled artboard with no interior wireframe content.** Every artboard
you place on canvas must carry `html` wireframe or reference wireframe
block via `blockId`; when using `blockId`, referenced `wireframe` /
`legacy-wireframe` block must remain in plan. If you remove duplicate
wireframe from document body, first move its `data` inline onto corresponding `content.canvas.frames[*].wireframe` / `legacyWireframe`. label-only frame or frame pointing at deleted block renders empty and rejected at parse time. If you only title, write it as section header or
annotation, not empty artboard.

**UI mockups belong in top visual review area.** Static UI/product visuals
live on canvas; multi-step UI flows get both canvas wireframes and prototype. When user asks mockup, UI state, loading state, layout,
screen, or visual comparison, make canvas primary home that static
visual. When user asks prototype or plan contains sequence reviewer must feel, keep canvas artboards and add `content.prototype` so top surface shows Wireframes / Prototype tabs. Architecture/code diagrams stay
inline in document (SKILL.md Visual Surface Choice section owns that
rule) unless user explicitly asks spatial board. Document blocks
can explain, compare, or map implementation, but they should not host primary UI mockup or prototype just because `custom-html`, screenshots, or prose
easier to produce. If canvas/prototype surface cannot represent requested UI fidelity, still keep closest top-surface representation and
call out or extend needed renderer capability. skeleton/loading mockup
also lives in canvas artboard — never move mockup out canvas.

abstract product concepts, use canvas to create first "I get it"
moment: one real app state near top showing how concept appears to user, followed by separate annotations or diagrams mechanics. not make
first artboard hybrid app UI and architecture notes; app screen
should inspectable as product UI on its own.

**Legacy kit tree.** Older plans set `screen` array `{ el, ...props }` kit
nodes instead `html`; renderer still accepts and displays it, but new
plans emit `html`. not author fresh kit-tree screens - write HTML mockup
instead. Likewise, old or imported plans may carry coordinate-based regions or
free-float x/y on notes; those legacy escape hatches renderer still
shows but you must never produce. gutter parks notes by `targetId` +
`placement`, and coordinate rule at top this file governs all
new-plan placement.

<!-- SHARED-CORE:canvas-surface END -->

# Good vs. bad exemplar — single source truth

This file canonical worked example great plan (and anti-patterns
to avoid). Read it alongside document-quality and canvas references before
authoring plan; it bar these plans must clear.

<!-- SHARED-CORE:exemplar START -->

**GOOD.** UI-first plan todo app: canvas with `desktop` artboard whose
`data.html` real flex layout — sidebar links (`Inbox 12`, `Today 4`,
`Done`), main column with `<h1>Today</h1>`, accent `.wf-pill`s filters, muted section label `OVERDUE`, and `.wf-card` task rows carrying real
titles, due dates, and primary `button.primary` — styled only through bare
elements, helper classes, and `--wf-*` tokens, so renderer applies correct desktop footprint, theme, and one subtle whole-frame wobble. Plain-text
designer notes sit spaced off frame, pointing only at controls that need
explanation. Below it, Claude/Codex-grade document: objective and
done-criteria, few `code` blocks (grouped in vertical `tabs` block when
more than one) showing real shape load-bearing files, `callout`
with `tone="decision"` stating chosen approach with `columns` block
weighing two real options behind it,
and validation step — none it repeating canvas. If task also
changes multi-step completion flow, same top area includes Prototype tab
whose screens use same labels and states as canvas artboards, with
`data-goto` controls sequence. This bar.

**GOOD.** broad product-architecture plan opens with plain recommendation
and one concrete app state before abstraction. first canvas artboard pure product UI that matches current app shell; nearby notes explain user-visible delta. separate diagram below shows mechanics, such as file
or data flow. document then separates reusable core from app/provider
adapters and examples, covers contracts, folder or schema shape, sync
boundaries, roadmap, non-goals, bottom Open Questions form unresolved
decisions, and verification section with at least one realistic end-to-end
smoke. reviewer who not in chat gets idea from top snapshot
before reading technical plan.

**GOOD.** `/visual-plan` backend architecture review: no top canvas.
document opens with context and legend, then repeats recommendation cards:
title, confidence/category badges, monospace grid real file paths, one
inline two-dimensional before/after or layered architecture diagram, and terse
Problem/Solution/Why bullets using codebase's vocabulary. diagram uses
space to show boundaries, layers, and ownership; it not default
left-to-right chain. plan ends with top recommendation and bottom
question-form only if next architecture direction genuinely open. This better than top canvas because each diagram local to claim it supports.

**BAD.** `data.html` with hard-coded hex colors, `font-family`, or fixed
pixel width/height; gray placeholder bars "insinuating" text on non-skeleton
frame; forced desktop + mobile pair popover; floating bordered
annotation cards hugging frames; fresh hand-authored kit-tree `screen`
instead `html`; multi-step UI flow with only static frames and no prototype
tab; mockup escaped into document `custom-html` block; and marketing-style
document with hero heading and value props that just restates what canvas
already shows. Also bad: architecture-only plan forced into top canvas labeled boxes with overlapping text, where actual code evidence and
recommendations live elsewhere; product wireframe that mixes real screen
with repo names, file-contract arrows, architecture explanations, or made-up
permanent inspector; and plan that describes itself as revision prior
conversation instead standalone proposal. Never produce this.

<!-- SHARED-CORE:exemplar END -->

# Plan document quality — single source truth

This file canonical quality bar plan document below canvas:
how it reads, which blocks to use, how open questions surfaced, and pre-handoff check. Read it in full before authoring plan document; it quality bar. not write document from memory or paraphrase these rules per
mode.

<!-- SHARED-CORE:document-quality START -->

**document serious technical plan, not marketing.** Write it way strong Claude or Codex implementation plan reads: outcome-first, prose-first,
self-contained, and specific. State objective and what "done" means, scope and non-goals, proposed approach with key decisions and their
rationale, ordered steps that name real files, symbols, actions, and data
shapes, risks, and closing verification step (tests, build, or checkable
behavior). Replace vague prose with specifics; never ship step like "make it
work." No hero art, gradients, logos, nav bars, slogans, value props, giant
landing-page headings, or marketing cards unless user explicitly asks.

**Every published plan must stand alone.** Even when agent revising existing plan, output plan to work, not changelog conversation. not write phrases like "preserve previous plan", "not
drop old idea", "as discussed above", "this revision", "unlike prior
version", or "correction from earlier plan". Fold right decisions into
plan as normal objective, architecture, scope, and roadmap prose. reviewer
who opens plan from link with no chat history should understand it. Avoid
negative framing that only makes sense against absent context ("not old
mode", "not just X") unless contrast defined in plan and genuinely
helps; state positive model directly.

**Make abstract plans instantly legible.** If idea broad, strategic, or
intended third-party reviewer, put one concrete product snapshot near top before dense architecture, mode tables, manifests, or roadmaps. UI-capable concepts, that snapshot usually top-canvas app state plus short paragraph that says what user sees and what changes under hood.
Then put mechanics, data flow, sync boundaries, and implementation detail in
separate diagrams or document sections.

**Preserve user's level abstraction.** motivating use case not
automatically architecture. When prompt describes broader framework,
product mode, or reusable primitive, separate reusable core from specific
apps, providers, customers, scripts, or launch examples. Use concrete
example to make plan understandable, then make clear which parts core,
which app-specific adapters, and which future examples.

**When top visuals exist, they and document never duplicate each other.**
UI work, UI story lives in top visual surface: canvas artboards static inspection, plus prototype tabs when flow should functional. document carries technical depth visuals cannot show — concrete
file/symbol maps, API and data contracts, code snippets, migration or
implementation phases, risks, and validation. architecture/code reviews,
invert that: document visual surface, and each recommendation
carries its own nearby inline `diagram` / `data-model` block plus file
evidence (`diagram` bullet below owns how to author those diagrams).
Repeat wireframe in document only genuinely new detail view or
comparison. Skip visual surface entirely non-visual work and write clean rich document. simple binary UI visual choice, show two
directions in canvas only; not repeat same options as body
wireframes or prose. Put actual choice in bottom "Open Questions" form.

**Use right block, and make it carry substance.** authoritative,
machine-checked list block types and their data schemas, call `get-plan-blocks`
— it returns live registry vocabulary (type, MDX tag, placement, key fields)
so you never emit block editor cannot render or round-trip:

- `rich-text` plan prose with real bold/italic/code/links and nested lists.
- `annotated-code` file map: when load-bearing file worth
highlighting, prefer annotated walkthrough over bare `code` block — carry
real, syntax-highlighted code AND anchor short margin notes to lines
that actually change (new action, changed schema, wiring point), so
reader sees what matters and why instead code code's sake. Each
annotation `{ lines: "12" | "12-18"; label?; note }`; keep few high-signal
notes per file, not one per line. Highlight only files worth reading; never
exhaustive list every touched file, and never prose-only description file. Drop to plain `code` block only throwaway snippet with nothing
to call out. When more than one file matters, group blocks in vertical
`tabs` block (standard tab primitive) than bespoke container. If
exact code unknown, show smallest plausible planned shape or commented stub naming what to fill in. (`code-tabs` and `implementation-map`
legacy: their renderers stay old plans, but not author new ones.)
- decision: if reviewer must still pick between genuinely-open
either/or, put it in bottom Open Questions `question-form` as `single`
question — one option per real alternative, each with short detail and
`recommended: true` on one you would choose; not also restate same
choice elsewhere. If you already committed to approach, state it as
settled prose or `callout` with `tone="decision"`, optionally with `columns` block side-by-side comparison options you weighed — not
as confusing mid-document form question you already answered.
- `columns` side-by-side before/after or current/target comparisons where
each side needs real nested blocks; label columns clearly and avoid
stacking comparison blocks vertically when parallel reading point.
- `diagram` two-dimensional architecture, dependency, data-flow, or state
relationships, only when it clarifies something real. Prefer standard
two-dimensional layouts — paired before/after panels, layered diagrams,
swimlanes, dependency maps, matrices, or grouped regions; not default to
left-to-right chains, and use line only when relationship truly sequence. architecture/code
diagrams, prefer `data.html` / `data.css` with semantic HTML and inline SVG so
diagram can use panels, layers, matrices, arrows, annotations, and
responsive layout directly. Author diagram HTML with renderer-owned primitives
like `.diagram-panel`, `.diagram-card`, `.diagram-node`, `.diagram-box`,
`.diagram-pill`, `.diagram-muted`, and `[data-rough]`; they map to plan's
Tailwind theme variables through `--wf-ink`, `--wf-muted`, `--wf-line`,
`--wf-paper`, `--wf-card`, `--wf-accent`, `--wf-accent-soft`, `--wf-warn`, and
`--wf-ok`, and switch to Excalifont plus rough.js outlines in sketchy mode. not
set `font-family` and not hard-code hex, rgb, or hsl colors in diagram HTML
or CSS. Leave room sketch font: keep labels short, give nodes generous
width, and place boundary/annotation labels in unused space instead over
nodes; labels must not overlap nodes, connectors, or each other. small
text/SVG changes to existing HTML diagram, use `patch-diagram-html` with unique `find`/`replace` snippet instead resending whole `data.html`
string. Use legacy `nodes` / `edges` only small previews or truly
sequential flows. In architecture/code plans, prefer repeated section rhythm:
recommendation title, confidence and category badges, code-path evidence, local before/after or current/target spatial diagram, then concise
Problem/Solution/Why text.
- `tabs` multiple states, directions, or comparisons. tab that reveals
only prose usually means plan under-specified — include relevant
visual unless tab intentionally document-only.
- `table`, `checklist`, `callout` scannable structure.

**Open questions live at bottom as form when answers would change plan.** Surface answerable unresolved decisions in final `question-form`
block titled "Open Questions" so renderer presents it as distinct section.
That bottom form ONLY place that enumerates open questions: never add
second "Open Questions" heading, list, or recap same questions earlier
in document. one-line pointer in overview prose ("few decisions still open — see Open Questions below") fine, but not reproduce question list or parallel questions/decisions section above it.
Use `single` or `multi` clear choices, `freeform` constraints,
`recommended: true` default you would pick, and option `wireframe` /
`diagram` previews only when options not already visible in top
canvas. `single` and `multi` questions always render write-in field so reviewer can answer with custom option — never add explicit "Other" option
yourself; set `allowOther: false` only when free-text answer makes no sense.
Keep non-answerable assumptions or risks as concise `callout` blocks in
relevant section. Never bury questions/decisions wall inside plan
narrative, and never ask same question twice.

complex plans, not end without open-question audit. If architecture,
scope, UX, data shape, rollout, provider mapping, or ownership still depends on
choice, either commit to recommendation with rationale or add it to bottom form with recommended default. complex plan with no open questions fine only when every meaningful decision explicitly made.

**Verification must exercise real workflow.** final verification section
should go beyond typecheck/unit tests when plan changes UI, local files,
sync, providers, browser behavior, or multi-app flows. Include at least one
end-to-end smoke that matches user journey, such as fresh repo/folder,
real manifest or data fixture, browser interaction, save/sync action, and on-disk or database assertion. Name command or manual browser path when it
known.

**`custom-html` bounded escape hatch only** — single complete fragment
inside block, never `html`/`head`/`body`/`script` tags, never generic
placeholder, density demo, or proof that custom HTML works. Prefer native
blocks normal plans. architecture/code reviews, use `diagram`
`data.html` / `data.css` rich local HTML/SVG diagrams instead `custom-html`. UI/product work, `custom-html` never primary home requested mockup, UI state, or visual comparison. If UI fidelity requires
HTML/CSS, image capture, or real React/CSS, product fix canvas support
that artifact type, not moving mockup into document.

**Before handoff, open plan and check it.** Fix overlap, excessive
whitespace, clipped fragments, misleading inactive controls, poor contrast, and
unreadable diagrams before asking approval.

<!-- SHARED-CORE:document-quality END -->

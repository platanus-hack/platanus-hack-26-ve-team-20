---
name: creating-html-presentations
description: Builds single-file HTML slide decks from Markdown with the ASAP partners-dashboard dark theme, Mermaid diagrams, keyboard navigation, and localStorage slide persistence. Use when creating or updating stakeholder presentations, architecture decks, or converting a .md doc into a self-contained HTML slideshow.
license: MIT
compatibility: opencode, claudcode, codex, cursor
metadata:
  audience: developers
  standard: agentskills.io
---

# Creating HTML Presentations

Generate **one self-contained `.html` file** per deck from a source **`.md`**. Every deck shares the same visual signature (partners-dashboard dark mode, grid background, Plus Jakarta Sans, Mermaid styling).

Reference implementation: `~/.presentations/legacy-to-v2-architecture.html` (from `services/fireblocks/docs/legacy-to-v2-architecture.md`).

---

## Before You Build

Confirm with the user when not already specified:

| Input | Default |
|-------|---------|
| **Source** | Path to `.md` file |
| **Language** | Same as source `.md` (user may request another) |
| **Output path** | Ask; default via `scripts/resolve-output-path.sh` → `~/.presentations/<basename>.html` |
| **Scale** | `--presentation-scale: 1` (no zoom) |
| **Slide target** | ~6–8 slides for leadership decks; condense long MD |

Also read [reference.md](reference.md) for frontmatter, layout mapping, and placeholder tokens.

---

## Workflow

```
Task Progress:
- [ ] Step 1: Read source .md (+ optional YAML frontmatter)
- [ ] Step 2: Plan slides (hybrid mapping — see reference.md)
- [ ] Step 3: Resolve output path
- [ ] Step 4: Copy template and replace placeholders
- [ ] Step 5: Build slide HTML from MD content
- [ ] Step 6: Set SLIDE_COUNT, MERMAID_SLIDE_INDEXES, STORAGE_KEY
- [ ] Step 7: Open in browser / hand path to user
```

### Step 1: Read the Markdown

- Parse optional YAML frontmatter (`presentation:` block) — overrides slide plan, language, scale, title.
- Without frontmatter: use `##` headings as slide boundaries; condense dense sections.
- Extract ` ```mermaid ` blocks for diagram slides.
- Tables → comparison or status slides; bullet lists → cards or two-column points.

### Step 2: Plan slides (hybrid mapping)

**Default:** each major `##` section becomes one slide (merge or split to hit ~6–8 slides).

**Frontmatter overrides** (see reference.md): explicit `slides:` array with `type`, `source`, `title`.

**Infer layout from content:**

| MD signal | Layout class / structure |
|-----------|--------------------------|
| Title + executive summary | `.slide.opening` |
| `mermaid` + bullets + numeric highlights | `.slide-stack` (diagram + `.points-columns` + `.metrics`) |
| Two themed subsections (`###`) | `.grid-2` + `.card` + optional `.closing` |
| Status table or checklist | `.status-grid` + `.card` in `.grid-2` |
| Simple bullet list | `.card` or `.admin-list` / `.slide-admin` |
| Comparison table (Legacy vs V2) | `.slide-summary` + `table` + `.closing` |

Use `.positive` / `.negative` list items and `.legacy-val` / `.v2-val` metric colors to match before/after narrative.

### Step 3: Resolve output path

```bash
bash .agents/skills/creating-html-presentations/scripts/resolve-output-path.sh path/to/source.md
```

Optional explicit path:

```bash
bash .agents/skills/creating-html-presentations/scripts/resolve-output-path.sh path/to/source.md /custom/output.html
```

**Do not** write to the project workspace unless the user asks. Default sandbox: `~/.presentations/<basename>.html` (flat directory, no mirrored source path).

### Step 4: Start from the template

Copy:

```
.agents/skills/creating-html-presentations/assets/presentation-template.html
```

Replace tokens:

| Token | Value |
|-------|-------|
| `__PRESENTATION_TITLE__` | Deck title |
| `__LANG__` | `es`, `en`, etc. |
| `__EYEBROW__` | Context line (product · topic) |
| `__SUBTITLE__` | 1–2 sentence summary |
| `__TAGLINE__` | Short punchy line (optional) |
| `__STORAGE_KEY__` | Unique slug, e.g. `asap-fireblocks-legacy-v2-slide` |
| `__SLIDE_COUNT__` | Total slides (anti-flash script) |
| `__MERMAID_SLIDE_INDEXES__` | JSON array, e.g. `[1, 2]` — 0-based slide indices with diagrams |

### Step 5: Build slides

- One `<section class="slide" data-index="N">` per slide; `data-index` is 0-based and sequential.
- Wrap body in `<div class="slide-content">`.
- Keep all CSS/JS from the template — **single file**, no external CSS except Google Fonts + Mermaid CDN.
- Mermaid: embed in `<pre class="mermaid">`; add class `v2-flowchart` only when that slide needs wider diagram spacing.
- Subgraph cluster colors: use Mermaid `subgraph` + `applyLegacyClusterStyles` (already in template JS). **Never** use `style` lines with `rgba(...)` in Mermaid source — breaks the parser; apply cluster colors in JS post-render.

### Step 6: Wire JavaScript constants

Must stay consistent:

- Head anti-flash script: `STORAGE_KEY`, `SLIDE_COUNT`
- Footer: `SLIDE_STORAGE_KEY` (same as `STORAGE_KEY`), `MERMAID_SLIDE_INDEXES`
- Nav `progress` initial text: `1 / N`
- `goTo(0)` on load after dots are built

### Step 7: Verify

- Open the HTML file in a browser (or give the user the path).
- Hard refresh after diagram edits (`Ctrl+Shift+R`) — Mermaid renders once per slide visit.
- Test: arrow keys, space, prev/next, dots, slide persists on reload.

---

## Design signature (do not change)

These tokens are fixed across all decks:

```css
--bg: #041518;
--surface: #2a272e;
--accent: #5a50f9;
--accent-secondary: #c3f678;
--danger: #f31260;
--font-sans: "Plus Jakarta Sans", ...;
--presentation-scale: 1;
```

Visual elements:

- Gray grid on `body::before`, radial scrim on `.slide-content`
- Full-viewport deck, grid-stacked slides, fade/slide transitions
- Mermaid dark theme matching `.metric` card borders (`rx: 10`, stroke colors by `classDef`)
- Navigation: fixed dots (bottom center), prev/next (bottom right), keyboard arrows

Optional scale: set `--presentation-scale` in `:root` or frontmatter (default **1**).

---

## Mermaid rules

- CDN: `mermaid@11`, `startOnLoad: false`, render on first slide visit.
- Prefer short node labels; use `rankSpacing` / `nodeSpacing` in `%%{init:...}%%` for legibility.
- Legacy diagrams with emphasis groups: `subgraph clusterX [Label]` + external nodes between groups when arrows must hit nodes, not group borders.
- Avoid `style id fill:rgba(...)` in diagram text — use JS cluster styling instead.

---

## Content guidelines

- Audience: product, operations, leadership — not implementation guides.
- Spanish or English per user request; translate/summarize from source MD.
- Bullets: short, scannable; split long lists across `.points-columns`.
- Metrics: 3 cards in a row when showing comparable numbers.
- Max ~8 slides unless frontmatter says otherwise.

---

## Additional resources

- [reference.md](reference.md) — frontmatter schema, layout catalog, MD examples
- [assets/presentation-template.html](assets/presentation-template.html) — canonical single-file skeleton
- `~/.presentations/legacy-to-v2-architecture.html` — full real-world example deck

---

## Rules

- **Single HTML file** with inline CSS + JS (fonts and Mermaid from CDN only).
- **Same design signature** every time — copy template, do not invent new themes.
- **Source of truth** is the `.md`; HTML is a derived presentation artifact.
- **Default output** lives under `~/.presentations/`, not the repo.
- **Ask** for output path and language when the user has not specified them.

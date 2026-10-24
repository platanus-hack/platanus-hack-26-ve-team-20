# HTML wireframe quality — single source truth

This file canonical quality bar HTML wireframes / `<Screen>` /
`WireframeBlock` content, shared word word by `/visual-plan` and
`/visual-recap`. Read it in full before authoring ANY wireframe; not
author wireframes from memory or paraphrase these rules per command.

<!-- SHARED-CORE:wireframe-quality START -->

**wireframe HTML mockup. renderer owns look; you write content.** Set `data.html` to self-contained, semantic HTML fragment screen and set `data.surface`. renderer owns surface footprint/aspect,
dark/light theme, hand-drawn font, and rough.js sketch overlay — you
never write `<html>`/`<body>`/`<script>`/`<style>` tags or any
width/height/coordinates. You write real HTML layout and real product
content; renderer styles and roughens it.

**wireframe block's data HTML screen plus surface:**

```json
{
"surface": "browser",
"html": "<div style=\"display:flex;flex-direction:column;gap:10px;padding:16px;height:100%\"><h1>Sign in</h1><p class=\"wf-muted\">Use your work email to continue.</p><div class=\"wf-card\" style=\"display:flex;flex-direction:column;gap:10px\"><label>Email<input value=\"jane@acme.co\" /></label><label>Password<input value=\"••••••••\" /></label><label style=\"display:flex;align-items:center;gap:8px\"><input type=\"checkbox\" checked /> Remember me</label><button class=\"primary\">Sign in</button></div><a href=\"#\">Forgot password?</a></div>"
}
```

**Write PLAIN semantic HTML and let renderer style it.** Bare elements
(`h1`/`h2`/`h3`, `p`, `button`, `input`, `<input type="checkbox">`, `a`, `hr`)
auto-themed — no classes needed. Helper classes carry rest:

- `.wf-card` / `.wf-box` — bordered, padded container (panel, list item).
- `.wf-pill` / `.wf-chip` — rounded tag or filter; add `.accent`
(`<span class="wf-pill accent">`) accent-filled variant.
- `.wf-muted` — secondary/muted text (or use `<small>`).
- `button.primary` or any element with `[data-primary]` — accent-filled
primary button.

**No decorative shadows around mockups.** not put `box-shadow`, `filter:
drop-shadow(...)`, Tailwind `shadow-*` classes, or other fake depth effects on wireframe frame, root container, `.wf-card` / `.wf-box`, or canvas artboard.
Mockups should read as flat, bordered surfaces; use spacing, borders, labels,
and annotations separation. Only show shadow when real product UI
already that shadow and it essential to change reviewed.

**Use renderer icons, not visible icon words.** icon-only buttons or leading
icons inside fields, chips, menu items, and toolbars, write empty marker such
as `<span data-icon="mail" aria-label="Email"></span>` or
`<i data-icon="lock"></i>`. renderer replaces it with Tabler-style SVG and
`.wf-icon` class sizes it to surrounding text. Supported names and
aliases: `mail`/`email`, `lock`/`password`, `search`, `plus`/`add`, `x`/`close`,
`check`, `chevronDown`, `chevronUp`, `chevronLeft`, `chevronRight`, `dots`/`more`,
`chevron`/`caret`/`dropdown` (down chevron), `user`, `settings`, `calendar`,
`bell`, `send`, `edit`, `arrowLeft`, and `arrowRight`. not put visible words
like "email", "lock", "search", "chevron", or "more" where product UI would
show icon; use text only when it real label user would read.

**Use `--wf-*` tokens any custom color, never hex.** renderer flips
these on light/dark, so reading them what keeps mockup correct in both
themes. any inline border, background, or text color, reference token:
`style="border:1.4px solid var(--wf-line)"`. tokens `--wf-ink` (text),
`--wf-muted` (secondary text), `--wf-line` (borders/dividers), `--wf-paper`
(page background), `--wf-card` (container surface), `--wf-accent` /
`--wf-accent-fg` / `--wf-accent-soft` (brand action), `--wf-warn`, `--wf-ok`,
and `--wf-radius`. Never hard-code hex color and never set `font-family` — renderer owns sketch/clean font.

**Lay out with inline `style` flex/grid.** You write real layout —
`display:flex; flex-direction:column; gap:10px; padding:16px` and so on — and renderer never repositions anything. Compose actual product: reproduce current screen, then show modification. Real labels, real counts, real dates,
real button text grounded in screen you read; not lorem or gray bars.

**Surface presets — match real footprint, never default to desktop+mobile.**
Pick `surface` that matches what user will actually see:

- `browser`: web page that needs browser chrome frame around it.
- `desktop`: full desktop app page or app shell.
- `mobile`: phone screen, only when work genuinely mobile.
- `popover`: small floating menu, dropdown, or inline popover.
- `panel`: side panel, inspector, or sidebar widget.

sidebar popover renders as small surface, not desktop page and phone
frame. not emit `desktop` + `mobile` variants unless responsive behavior
actually changes layout. component or widget, show one broader
app-context frame only when placement affects understanding, then focused
component states.

**Model actual component shell small surfaces.** rendered UI change
belongs in wireframe; reserve `diagram` architecture, dependency, state,
or data-flow relationships. Popovers, dropdown menus, command palettes, and
context menus use `surface: "popover"` unless surrounding page placement point change. Dialogs, sheets, inspectors, sidebars, and long
property panels use matching `panel` / `desktop` surface as appropriate.
Show real chrome: trigger or anchor when it matters, title/header row,
top-right actions, separators, fields, options, selected states, body content,
and footer actions that visible in workflow.

**Modify, don't redesign.** When task changes existing screen, reproduce
current screen's real layout and footprint FIRST, then change only delta
and call it out with single annotation. not restack page into new
layout. net-new surfaces, compose from real app shell. Inspect actual app components before drawing existing product: sidebar density,
toolbar actions, overflow menus, property panels, and framework chrome should
match product unless plan intentionally changes them.

**Keep product screens pure.** product wireframe shows app state user
would actually see. not embed file contracts, architecture arrows, repo pills,
mode explanations, or implementation callouts inside screen just to explain
plan. Put those in canvas annotations, separate diagram, or document
body. Secondary UI such as properties, history, sync, export, or agent controls
should appear where real product would put them: overflow popover, sheet,
panel, or separate framework sidebar state, not generic permanent right
inspector unless that inspector actual design.

**Classify mockup scope before implementation.** Before turning plan mockup
into source code, decide whether each artboard represents whole page/app
shell, route body inside existing shell, or component/sub-surface. If artboard includes navigation, sidebars, auth banners, or signup/login form,
map those pieces to real shared shell/auth components instead nesting entire mockup inside current page. When mockup references product's
standard signup/login page, find and reuse that existing implementation; not
approximate it from wireframe.

**Zoom in on sub-surfaces, don't redraw page.** small sub-surface (popover, menu, dialog, toast), show full screen once, then add small
separate artboard whose `html` contains ONLY that sub-surface — not re-draw
whole page around it, and not scale duplicate up. Pick matching
`surface` (e.g. `popover`) so footprint right; never widen popover to
page width.

**Loading / skeleton states.** Set `data.skeleton: true` on wireframe and
fill `html` with neutral, textless placeholder geometry — boxes and bars
built as `<div>`s with `background:var(--wf-line)` and explicit heights/widths,
no labels or copy. renderer drops borders, sketch, and color into skeleton register automatically. Never escape to `custom-html` document block
to fake loader.

**Editing existing mockup.** To change one element, text, or color in existing html mockup, call `update-visual-plan`
with `contentPatches: [{ op: "patch-wireframe-html", blockId, edits: [{ find,
replace }] }]`. Each `find` unique snippet current html (read it
first with `get-visual-plan`); set `all: true` on edit to replace every
occurrence. result re-sanitized.

**Treat wireframe border as part visible design.** Always wrap HTML
wireframe content in root container with real inner padding before drawing
cards, fields, pills, labels, or controls. Use at least 14-16px padding,
`box-sizing: border-box`, `height: 100%`, and `gap` between child rows so first row never sits flush against screen border. Keep text away from
borders: every container, field, button, menu item, and annotation needs enough
padding and line-height to read cleanly in rendered Plan view.

**Lay out children safely so they never collide.** Use HTML flex/grid with
`gap`, `min-width: 0`, and sensible overflow. Avoid negative margins, absolute
positioning, or fixed child widths that can collide when renderer switches
between light/dark, sketch/clean, or different zoom levels.

**not wrap intentionally single-line labels.** toolbars, tab rails,
breadcrumbs, chip/filter rows, branch and file names, file chips, and code
filenames — any deliberately single-line row — not let long text wrap. Put
`white-space: nowrap` on row (and `overflow: hidden; text-overflow: ellipsis`
on individual labels that can grow), so wireframe demonstrates actual
layout behavior instead producing ugly stacked or vertical text. Use
horizontally scrollable or clipped rails overflow.

**Fill frame; keep labels short.** Each artboard fixed-size surface — compose enough realistic HTML to fill it top to bottom with even vertical rhythm; never leave large empty band. On desktop/app-shell sidebars, let nav stack flex to fill (`flex:1`) and add any persistent bottom action/status after it so rail reads complete in taller frames. On mobile especially, flow real rows down whole screen (status bar, header, then list/detail content) than header floating above gap. Keep every label short enough to sit on one line within its column — shorten copy than relying on frame to absorb it (long labels wrap or clip).

**Persistent chrome bars span full frame width.** Top bars, app headers,
toolbars, and bottom tab/nav bars full-width chrome, not centered content.
Lay each one out as single flex row that fills frame
(`style="display:flex;align-items:center;width:100%"`) and push trailing actions
to right edge with flex spacer (`<div style="flex:1"></div>`) between leading group and trailing group — never center bar inside narrow,
centered block, and never let it collapse to width its contents. In Before/After pair bar stays full-width in BOTH states even when one state fewer controls; spacer absorbs difference so remaining controls hold
their edge alignment instead sliding to center.

**Pin bottom bars to bottom frame.** mobile tab bars, footers, and
any persistent bottom action row, make frame itself flex column at
`height:100%` (`style="display:flex;flex-direction:column;height:100%"`), give scrolling body `flex:1` so it absorbs slack, and place bar as LAST
child frame (or set `margin-top:auto` on it). bar then sits flush at
bottom surface instead floating directly under content with empty band beneath it.

**Before / after must comparable.** When showing state change, preserve unchanged controls in both states so reviewer can see exactly what moved or
appeared; not show added control as generic box floating elsewhere in
surface. Place new/changed affordance where implementation puts it —
for example, new `Edit with AI` action in popover header belongs in top-right header slot, aligned with title, not in body or footer. Use
same frame size, scale, outer padding, border radius, and visual density on
both sides unless change itself alters those properties, and let frame
height fit content than leaving tall empty lower half.

**Name states with column header, never inside frame.** document-body wireframes (recaps), put two
states in `columns` block and set each column's `label` to `Before` and
`After` — renderer draws that label as `h4` heading above each frame. NOT bake `Before`/`After` pill, title, or heading into wireframe `html`: label placed inside reads as part product UI, lands in random corner,
and clutters comparison. column header one and only place state name belongs. On canvas, place two state artboards as neighbors with
frame labels — never encode Before/After inside html.

**Let surface choose side-by-side vs. stacked.** document-body
wireframes (recaps), `columns` renderer lays
narrow surfaces (`mobile`, `popover`, `panel`) out side by side, and
automatically stacks wide surfaces (`desktop`, `browser`) vertically at full
document width so large frame never crushed into half-width column and
cropped. Author both wireframes with real `surface` and matching
`Before`/`After` column labels; not hand-stack pair into separate
top-level wireframes or duplicate state name as body content.

**Good example — contacts list, surface `browser`.** small, real screen
composed from helper classes and tokens, layout in inline flex, no fonts or
hex colors:

```html
<div
style="display:flex;flex-direction:column;gap:12px;padding:16px;height:100%"
>
<div style="display:flex;align-items:center;justify-content:space-between">
    <h1>Contacts</h1>
    <button class="primary">New contact</button>
</div>
<div style="display:flex;gap:6px">
    <span class="wf-pill accent">All 128</span>
    <span class="wf-pill">Favorites</span>
    <span class="wf-pill">Archived</span>
</div>
<div
    class="wf-card"
    style="display:flex;flex-direction:column;gap:0;padding:0"
>
    <div
      style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1.4px solid var(--wf-line)"
    >
      <div
        style="width:32px;height:32px;border-radius:999px;background:var(--wf-accent-soft)"
      ></div>
      <div style="flex:1">
        <strong>Jane Cooper</strong><br /><small>jane@acme.co</small>
      </div>
      <span class="wf-pill">Lead</span>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px">
      <div
        style="width:32px;height:32px;border-radius:999px;background:var(--wf-accent-soft)"
      ></div>
      <div style="flex:1">
        <strong>Marcus Lee</strong><br /><small>marcus@globex.io</small>
      </div>
      <span class="wf-pill">Customer</span>
    </div>
</div>
</div>
```

<!-- SHARED-CORE:wireframe-quality END -->

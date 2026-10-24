---
name: visual-plan
description: >-
  Turn ordinary text plans into rich interactive visual plans with diagrams,
  file maps, annotated code, open questions, and UI/prototype review when
  useful.
metadata:
visibility: exported
---

# Agent-Native Plans

Agent-Native Plans structured visual planning mode coding agents. Build
plan you would normally write in Markdown, but as scannable document with
editable blocks mixed in: inline diagrams, code snippets,
open questions, and optional top visual review area (wireframe canvas, live
prototype, or both in tabs). Architecture and backend plans stay document-only;
UI and product plans start with top canvas/prototype (Visual Surface
Choice section owns that rule).

`/visual-plan` packaged command and main entry point. Choose review
mode from task: UI-first when work primarily product UI and review
should start with screens, prototype-first when review should start with functional live prototype, design-first when review needs full-fidelity branded
screens, or visual-intake when user explicitly wants questionnaire before
planning. When Codex, Claude Code, Markdown, or pasted plan already exists,
`/visual-plan` uses that source plan as starting point and builds review
surface from it instead starting over.

## When To Use

Create or adapt visual plan whenever plan would better as reviewable
artifact than chat paragraph. This includes modest work such as single UI
surface with states, small workflow, before/after product change, or component/API/data-shape decision that needs alignment, plus larger multi-file,
ambiguous, long-running, risky, or UI-heavy work. Use it when architecture /
data flow / UI direction / options / open questions would benefit from inline
diagrams or structured blocks, when user needs to react to direction
before you implement, or when existing text plan needs richer review
surface.

## Plan Discipline

- **Gate thoughtfully.** visual plan richer review surface, not only tool giant projects. Use it when user needs to see, compare, comment
on, or approve direction before code, even modest UI/state/workflow
change. Skip it truly trivial, unambiguous work — typos, one-line fixes, single well-specified function, anything whose diff you could describe in one
sentence — and just make change. Never pad plan with filler and never
ship single-step plan.
- **Research before you draft.** Read real files, actions, schema, and
patterns first; name actual files, symbols, and data shapes instead inventing them. Check existing `actions/` before proposing endpoints and prefer
named client helpers over raw fetch. Delegate wide exploration to sub-agent.
Lead with reuse: for each step, name what it reuses — existing actions, schema,
components, helpers — before what it adds, so plan explains genuinely new
delta instead redescribing what already exists.
- **Decide hard-to-reverse bets first.** non-trivial backend, data, or API
work, sketch where feature headed, then call out decisions that expensive to undo once data or callers depend on them — wire format, public ids,
data-model shape, auth and ownership boundaries — and get those right in plan
even if most feature ships later. Then scope to smallest first cut that
proves approach without foreclosing it, stating both what in and what explicitly deferred.
- **Keep examples at right altitude.** When user's idea broad
framework, product, or operating-model change, not collapse it into first concrete example, provider, or sync path they mention. Separate core
abstraction from motivating examples and app/provider adapters. Use examples
to make plan legible, but label them as examples unless they whole
requested scope.
- **Publish standalone plans.** If user pasted, referenced, or already Codex / Claude Code / Markdown plan, treat it as source material, but rewrite
published plan as clean standalone proposal. Preserve source plan's
useful intent and codebase facts, label inferred visuals as inferred, and avoid
revision language such as "preserve prior plan", "not drop old
idea", "unlike previous version", or "this revision changes...". reader
who never saw chat or earlier drafts should understand plan.
- **Make first read concrete.** If plan meant to shared with
someone outside chat, or if concept abstract, lead near top with
one concrete product example before mode tables, architecture, or roadmaps. UI-capable concepts, that usually means top-canvas app state that shows real user workflow in product terms. not rely on phrases that only make
sense in conversation, and not frame plan as "not old idea"; state
positive model directly.
- **Planning read-only.** Make no source edits while building or reviewing plan. Start editing only after user approves direction.
- **Clarify vs. assume.** not ask how to build it — explore and present approach and options in plan. Ask clarifying question only when ambiguity would change design and you cannot resolve it from code; use
host agent's normal ask-user-question flow and batch 2-4 high-leverage
questions before finalizing. not call `create-visual-questions` from
`/visual-plan`. Otherwise state assumption explicitly and proceed, and
keep anything unresolved in plan's single bottom `question-form` Open
Questions block. complex plans, final open-question pass before
handoff: if decision would affect architecture, scope, UX, data shape, or
rollout, either decide it in plan with rationale or put it in that bottom
form with recommended default.
- **plan approval gate.** After surfacing it, ask user to review
and approve before you write code, and name which files/areas work touches.
Presenting plan and requesting sign-off approval step — not ask separate "this look good?" question.
- **document source truth, not chat.** When scope shifts,
update plan with `update-visual-plan` than only changing course in
chat, and make updated document stand alone. not describe update as
correction to earlier draft inside plan itself. Re-read approved
plan before major steps.

## Create Structured Agent-Native Plan — Never Inline

deliverable ALWAYS structured Agent-Native Plan, not chat-only plan.
hosted Plan MCP connector (`plan` server, or legacy `agent-native-plans`) default collaboration and commenting surface; it not reason to reject
planning pattern as external dependency or rented layer. Plans portable source artifacts (`plan.mdx`, optional `canvas.mdx` /
`prototype.mdx`, JSON, and HTML export), and ownership-sensitive workflows can
use local-files mode or self-hosted/custom Plan app URL without abandoning skill's review discipline. not advise user to skip `/visual-plan` because
default surface hosted; choose right Plan mode user's
ownership, privacy, sharing, and branding needs.

By default, create plan via Plan MCP connector. NEVER hand plan over
as inline chat content — no Markdown prose, ASCII sketch, table, or fenced
wireframe. If connector's tools missing, NOT fall back to inline
output: usual cause connector that not finish connecting this
session (it registers zero tools), not auth. Stop and give user exact
restore step their current client: in Codex/Codex Desktop run
`npx -y @agent-native/core@latest reconnect https://plan.agent-native.com --client codex`
and start new Codex session; in Claude Code run `/mcp` and choose
Authenticate/Reconnect (or run same reconnect command with
`--client claude-code` and restart Claude). Auth stored per client
config/session, so one client's reconnect not make another running client
load tools. Never reinstall from scratch just to fix auth. Publish once tool
reachable. Local-files privacy mode (after Tool Guidance) exception.

## Core Workflow

1. Follow host agent's normal planning flow: inspect codebase, delegate
wide exploration when useful, gather info needed, and ask native
clarifying questions as needed before generating plan. If source plan
already exists, gather its exact text from user's paste, referenced
file, or recent visible agent context; not invent source text.
2. Call `get-plan-blocks` authoritative block catalog — not author
from memorized tags. Then call mode-matched create tool:
`create-visual-plan` document-first plans (architecture, backend, data,
refactor, API), `create-ui-plan` UI-first plans, `create-prototype-plan`
prototype-first plans, `create-plan-design` design-first plans,
`create-visual-questions` only when user explicitly asks visual
intake questionnaire. When source plan already exists,
pass it as `planText` and preserve original plan's useful intent while
producing standalone plan document, not revision memo.
3. UI/product plans, compose top canvas first with primary
wireframes and annotated states, then write document with native blocks
(see `references/canvas.md` and `references/document-quality.md`). broad product architecture plans with user-facing implication, add concrete "what this looks like in app" visual before abstract
architecture or mode tables. Keep document close to standalone
Markdown plan agent would normally output. If existing plan provided, carry forward right facts and decisions without referring to
previous draft or explaining how this version differs. non-visual
plans, skip top visual surface (Visual Surface Choice below owns rule)
and put `diagram`, `data-model`,
`api-endpoint`, `diff`, `file-tree`, `code`, and `annotated-code` blocks
directly next to relevant prose.
4. Surface returned Plans link or inline MCP App and ask user to review.
Always include actual URL in chat so next step click in CLI or
other text-only hosts. When host exposes embedded browser/preview panel
and tool can open arbitrary URLs there, open returned plan URL
automatically convenient review — convenience and smoke test, never only handoff or access
model. Plans should load out box local agent and local browser
session; if signed-in embedded browser cannot read local plan that anonymous/tool check can read, fix app/action ownership or access path
than patching one plan by hand. high-stakes plans (architecture,
backend, data, multi-file, or risky), also kick off self-review pass in
**Self-Review Before Handoff** while user reads, instead blocking handoff on it.
5. Call `get-plan-feedback` before editing, after review, after any long pause,
and before final response. Treat `anchorDetails`, resolver intent, recent
review events, and any focused screenshots from browser handoff as source
truth exactly what changed and exactly what each comment points at.
6. Apply changes with `update-visual-plan`, preferring targeted `contentPatches`.
Treat top-level `content` payload as full replacement, not merge; not send partial `content` object to add canvas or one block. If full
replacement unavoidable, first read complete plan source/content, carry
forward every existing block and visual surface, and verify source/export
afterward so document body not truncated. When user wants
source-control friendly edits, use `patch-visual-plan-source` against MDX
files instead regenerating plan.
7. Export with `export-visual-plan` only when user wants shareable receipt
or repo check-in artifacts.

## Self-Review Before Handoff

high-stakes plans — architecture, backend, data-model, migration, multi-file,
or otherwise risky work — run one adversarial self-review pass before treating plan as final. Skip it small, UI-only, or single-decision plans where cost
outweighs value. Keep pass cheap and non-blocking:

- **Surface plan first, review concurrently.** Post link and let user
start reading, then run review in parallel — never make user wait on it.
- **Review written plan; not re-research.** Critique plan text and its
own blocks. grounding already done while drafting, so review checks
output instead re-exploring repo.
- **Spawn one skeptical reviewer** whose only job to find what weak, missing,
or wrong — not to praise. Point it at: hard-to-reverse decisions made implicitly
or not at all (wire format, public ids, data-model shape, auth, ownership); steps
not anchored in real files or symbols; menu options where plan should
commit to one; obvious missing decisions ("what happens when X?", "why not Y?");
and padding or single-step filler.
- **Fix vs. ask.** Apply clear-cut fixes yourself with `update-visual-plan`
`contentPatches` — vague non-goals, unanchored claims, obvious missing
decision. Route genuine judgment calls back to user instead: add them to bottom `question-form` Open Questions block or batch them into normal
ask-user-question flow. not silently decide them.
- **not surprise user mid-read.** On large plan, apply patches before
editor loads; otherwise note briefly that self-review running so plan changing under them expected. When you next respond, summarize what review changed and what it surfaced user to decide.

## Visual Surface Choice

Choose surface before creating plan or after reading source plan. not add visual chrome by default:

UI/product plans, top canvas usually primary review surface. Put
first meaningful wireframes there, not buried as document-body blocks. Use
multiple canvas artboards when states matter, such as default view, overflow menu or popover, side panel, loading, or error. Put short annotations
beside frames with `targetId` plus `placement`; keep implementation details,
tradeoffs, file maps, data contracts, risks, and verification in document
body below canvas.

Keep product wireframes and explanatory/meta diagrams separate. Start with pure
screens that look like app state under discussion, without callout prose or
architecture notes embedded inside UI. Put arrows, labels, contracts, data
flow, and mode explanations in separate annotations, separate canvas diagrams, or
document body.

When plan touches existing app, inspect current shell/components
before drawing. first artboard should look like real app at same
density: existing sidebars, toolbar placement, overflow menus, app chrome, and
framework agent chrome stay in their real places. Model secondary surfaces as
separate states, such as top-right overflow popover, sheet, panel, loading
state, or separate AgentSidebar, than inventing permanent inspector or
folding framework chrome into product UI.

- **No visual surface** architecture-only, backend-only, data migration,
copy-only, or otherwise non-visual plans. not use top canvas architecture diagrams, dependency maps, file plans, API contracts, or
data-flow-only reviews. Use strong document with local inline diagrams
only when relationships need visual explanation, usually one spatial diagram
per recommendation or decision. Prefer grouped regions, layers, quadrants,
matrices, or before/after panels over single-axis chain unless relationship truly sequential.
- **Canvas only** one static screen, before/after comparison, component
state, small popover, or visual direction that not require clicking.
Put those wireframes in `content.canvas` and omit `content.prototype`.
- **Canvas + prototype** multi-step UI flows, onboarding, wizards,
review/approval flows, navigation changes, or anything where reviewer
needs to operate behavior. Keep static wireframes in
`content.canvas`, add aligned functional prototype in
`content.prototype`, and rely on top visual tabs to switch between them.
- **Prototype-first** when user asks to operate UI or when interaction main question. Use `create-prototype-plan`, which still preserves static
mocks where useful.

mixed canvas + prototype plans, reuse same real labels, app statuses,
and screen ids across both surfaces. canvas inspectable static reference;
prototype interactive version that same flow, not separate
design direction.

## Wireframe quality — read `references/wireframe.md`

UI recap/plan wireframes must meet strict quality bar — full-width chrome,
pinned bottom bars, real product content, before/after comparability, right
`surface` preset, `--wf-*` tokens instead hex, and no `<html>`/`<style>`/font
tags. Before authoring ANY wireframe / `<Screen>` / `WireframeBlock`, READ
`references/wireframe.md` in this skill directory — it single source truth HTML wireframe quality, shared word word with `/visual-plan`
and `/visual-recap`. not author wireframes from memory.

## Canvas — read `references/canvas.md`

canvas single source truth static UI mockups: `surface`
locks each artboard's footprint, mixed surfaces lay out
in lanes, annotations plain-text designer notes anchored by
`targetId`/`placement`, and edits surgical `contentPatches`. Before
authoring or editing ANY canvas, artboard, or annotation, READ
`references/canvas.md` in this skill directory — it single source truth
canvas/artboard mechanics. not author canvas layouts from memory.

## Document quality — read `references/document-quality.md`

document serious technical plan, not marketing: outcome-first,
prose-first, self-contained, built from right native blocks, with open
questions in single bottom `question-form` and pre-handoff visual check.
Before authoring plan document, READ `references/document-quality.md` in this
skill directory — it single source truth document quality bar.
not write document from memory.

## Good vs. bad exemplar — read `references/exemplar.md`

worked example bar — great UI-first plan and `/visual-plan`, plus
anti-patterns to avoid — READ `references/exemplar.md` in this skill
directory before authoring plan.

## Tool Guidance

- `create-visual-plan`: start one structured visual plan per agent task/run, or
import existing text plan by passing `planText`; `content` may include no
visual surface, canvas only, or canvas + prototype.
- `create-ui-plan`: start UI-first plan when work primarily product UI.
- `create-prototype-plan`: start prototype-first plan with functional top
review surface.
- `create-plan-design`: start full-fidelity branded Design-tab plan with optional matching Prototype tab.
- `convert-visual-plan-to-prototype`: convert existing HTML wireframe canvas
into prototype plan.
- `create-visual-questions`: use only when user explicitly asks visual
intake questionnaire, not as `/visual-plan` preflight.
- `update-visual-plan`: revise content, status, or comments with targeted
`contentPatches` (see Core Workflow step 6).
- `read-visual-plan-source`: read normalized plan as `plan.mdx`,
optional `canvas.mdx`, optional `.plan-state.json`, and JSON.
- `patch-visual-plan-source`: apply granular MDX AST patches by stable block,
artboard, annotation, component, or wireframe-node id.
- `import-visual-plan-source`: create or replace plan from MDX folder.
- `get-visual-plan`: read current structured plan, exported HTML, and
annotations; it also returns MDX folder source workflows.
- `get-plan-feedback`: read unconsumed human feedback. Use it frequently; it
returns grouped threads, exact anchor details, expected resolver, and recent
review-event payloads so agents can act only on comments meant them.
- `get-plan-blocks`: resolve block tags before authoring — not memorize tags;
call this first to get authoritative tag names, required fields, and prop
shapes from live block registry.
- `export-visual-plan`: export HTML, Markdown fallback, structured JSON, and MDX
files repo check-in.

When user critiques plan's look or structure, fix renderer or this
skill — never hand-edit one stored plan. Turn feedback into better guidance.

## Local-Files Privacy Mode

Use local-files privacy mode when user explicitly asks no DB writes,
no hosted Plan app, no Plan MCP publish, fully local files, offline/private
planning, repo-owned/source-controlled planning artifacts, or when
`AGENT_NATIVE_PLANS_MODE=local-files` set. Also use it when user or repo
policy says plan must stay under their own brand, domain, source control, or
infrastructure. In this mode plan data must never sent to Plan MCP
server or Plan app action surface. Schema-only block catalog lookup allowed
because it sends no plan content: use MCP `get-plan-blocks` tool if it already available, or run
`npx @agent-native/core@latest plan blocks --out plan-blocks.md` and read that
file before authoring MDX.

local-files contract is:

- Read source context from local files and shell commands only.
- Fetch/read block catalog before writing structured MDX. `plan blocks` command calls public no-auth `get-plan-blocks` route and
writes only registry metadata to disk; use `--format schema` if exact nested
fields needed. If network access unavailable, use bundled
references and rely on `plan local preview` to catch invalid tags.
- Write plan as local MDX folder under `plans/<slug>/`: `plan.mdx`,
optional `canvas.mdx`, optional `prototype.mdx`, and optional
`.plan-state.json`.
- Run `npx @agent-native/core@latest plan local preview --dir plans/<slug> --kind plan` after
writing or updating folder. Report returned local URL or `/local-plans/<slug>` route if local Plan app running with same
`PLAN_LOCAL_DIR`.
- **not** call `create-visual-plan`, `create-ui-plan`,
`create-prototype-plan`, `create-plan-design`, `import-visual-plan-source`,
`update-visual-plan`, `patch-visual-plan-source`, `get-plan-feedback`,
`export-visual-plan`, or any hosted Plan tool that plan except schema-only block catalog lookup above.
- Treat feedback as file or chat feedback: update MDX files directly, rerun
local preview command, and summarize new local URL/path. Hosted
comments, sharing, history, and publish/export receipts unavailable until
user explicitly opts into publishing.

Local-files mode prevents plan content from going to Agent-Native Plan
database. It not by itself make coding agent's language model local;
that stronger privacy boundary, host agent/model must also local or
otherwise approved by user.

## Interpreting comment anchors

`get-plan-feedback` returns rich anchors — read them before acting on any comment.

- **Coordinate frames.** `targetX`/`targetY` percentages *within* element named by `targetSelector`/`targetKind`. Bare `x`/`y` percentages
whole plan document. `canvasX`/`canvasY` raw board-world pixels on
design canvas (board size given when available).
- **Wireframe pins.** Anchors on wireframes include `targetNodeId` and
`targetNodePath` (e.g. `card > list > listItem "Acme Inc"`) identifying exact kit node. Use `targetNodeId` directly with wireframe node patch ops;
use `data-design-id` values from design artboards with
`update-design-element-style`. Prefer node id/path over raw coordinates;
fall back to coordinates plus focused screenshot (red ring marks exact
point) only when no node id present.
- **Text quotes.** Resolve `textQuote` against current prose using
`contextBefore`/`contextAfter` disambiguation. If `ambiguous: true`, ask
user — not guess which occurrence meant.
- **Detached comments.** `get-plan-feedback` flags threads whose quoted text no
longer exists as `detached` (in `detachedThreads`). Reconcile these against
rewritten content — never silently drop them.
- **Routing.** `resolutionTarget` only routing signal: act on `agent`,
treat `human` as context only. `@mentions` people to notify, never routing signal.
- **Two-axis state.** Mark every ingested comment as consumed
(`consumedCommentIds` on `update-visual-plan`). Set `status=resolved` only on
agent-targeted comments you actually addressed; leave human-targeted comments
open.

## Visibility & Sharing

Use `set-resource-visibility` to change who can see plan (e.g. public, login,
or org-scoped). Use `share-resource` to grant specific users or roles access
by email or role. Gate visibility before sharing any plan that covers
unreleased or private work — default to narrowest scope that meets review need.

## Setup & Authentication

There two ways into Plans.

**Coding agent (CLI).** Install once with Agent-Native CLI. command
installs Plans skills, registers hosted Plans MCP connector, and runs
auth/setup selected local client(s) in same step (one-time browser
sign-in at setup — this intended), so first tool call in that client not hit OAuth wall:

```bash
npx @agent-native/core@latest skills add visual-plan
```

After that, `/visual-plan` and `/visual-recap` two installed slash
commands. other planning modes (`create-ui-plan`, `create-prototype-plan`,
`create-plan-design`, `create-visual-questions`) MCP tools reachable from
`/visual-plan`, not separate slash commands. Pass `--no-connect` to register
connector without authenticating, then run
`npx @agent-native/core@latest connect https://plan.agent-native.com --client all`
whenever you ready, or choose narrower `--client`. Auth and MCP tool
loading per client config/session.

**Browser (people you share with).** Open Plans editor and create & edit
with no sign-up — you work as guest. Sign in only when you want to save or
share; signing in claims plans you made as guest into your account.

Sharing and commenting require account: public/shared plans viewable by
anyone with link, but commenting on them needs agent-native account.

fully offline, no-account use, run Plans app locally and sync plans to
your repo as MDX. This local mode separate advanced path, not default
hosted flow.

If Plans tool returns `needs auth`, `Unauthorized`, or `Session terminated`,
not keep retrying tool. Stop and give user reconnect step client they using: Codex/Codex Desktop should run
`npx -y @agent-native/core@latest reconnect https://plan.agent-native.com --client codex`
and start new Codex session; Claude Code should run `/mcp` and choose
Authenticate/Reconnect plan connector, or run reconnect command with
`--client claude-code` and restart Claude. To refresh every local client config
that already Plan entry, use `--client all`, then restart/reload each
client. Reconnect re-authenticates WITHOUT reinstalling and finds entry by
URL regardless connector name. Never reinstall from scratch just to fix auth.
Continue once connector available.

Hosted default: connect `https://plan.agent-native.com/_agent-native/mcp`. not put shared secrets in skill files.

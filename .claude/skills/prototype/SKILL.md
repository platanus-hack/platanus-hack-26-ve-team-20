---
name: prototype
description: "Make a design question tangible before committing to it: compare production-representative UI directions for a screen, component, or short flow, or drive a logic, state, data-shape, API, or CLI model through a shareable HTML demo. Use before committing to a visual, interaction, or behavioral design; not for production implementation."
---

# Prototype

Produce disposable prototypes that let a human judge a design before it is built. Prototype code may be temporary; everything presented must be credible in its intended product context.

## Choose the mode

- **UI mode:** the question is what a screen, component, or short flow should look like or how it should be operated. Follow the process below.
- **Logic mode:** the question is whether a logic, state, data-shape, API, or CLI behavior model holds up against real cases. Follow [logic mode](references/logic.md).

When the question spans both, settle the model first in Logic mode, then the interface in UI mode.

## UI process

1. **Frame the design question.** State what the prototype must help decide, the intended user, product moment, primary task and action, target platform or viewport, relevant states, protected behavior, and a time, cost, or scope bound. If the direction is already accepted or the request is only a local implementation detail, explain why comparison would add no value and stop.
2. **Ground the shared truth.** Inspect the current product, rendered baseline, repository, design system, components, terminology, real data shape, and platform conventions that apply. Prefer the real surrounding shell, density, content, and runtime. When a spec from `shape` or another product brief exists, take the user, problem, and states from it; for a new product, add a small number of relevant references without imitating them. Separate observed facts, user choices, assumptions, and freedoms.
3. **Freeze one neutral brief.** Give every designer the same user, task, exact content, capabilities, representative data, the named scenarios every candidate's scenario selector offers, viewport, invariants, allowed changes, forbidden inventions, and evaluation conditions. Keep product truth fixed so the comparison measures design rather than different interpretations of the problem.
4. **Create independent directions.** Default to three fresh designer agents, preferably from different model families, and never exceed five. Give each an isolated workspace and a non-overlapping exploration territory. Require each designer to state one named thesis, then build, run, render, inspect, and evidence its direction without seeing the other candidates. Each thesis must differ in organizing structure or interaction model and at least one other material axis such as hierarchy, primary affordance, density, disclosure, navigation, reading path, or spatial composition.
5. **Judge before presentation.** After all candidates finish, dispatch a fresh judge that authored none of them. Give it the shared brief, baseline, complete candidates, and rendered evidence. The judge checks every invariant, forbids invented content or behavior, and compares candidates pairwise for material divergence. It drives every scenario through the candidate's selector and moves between states as a user would, such as changing filters, hovering, and scrubbing, to verify states, transitions without layout shift, and runtime fidelity. Color, typography, radius, shadow, illustration, or copy changes alone do not constitute a distinct direction; if two candidates remain equivalent as rough silhouettes, one must fail.
6. **Repair once.** The judge marks each candidate `Pass`, `Rebuild`, or `Reject` and gives checkable reasons. Allow at most one bounded rebuild of a failed candidate, by its original designer, without exposing the other implementations. Rejudge the result. Do not include filler to reach the requested count; if fewer than two candidates pass, return `Incomplete` with the missing evidence or capability instead of presenting a false comparison.
7. **Present for selection.** Show only passing candidates under equivalent viewing conditions. For each, provide its name, thesis, material tradeoffs, rendered evidence, one link or command that opens it live, and known limitations. The judge may explain compliance and differences but must not select the aesthetic winner. Ask the human to choose one direction, request a specific hybrid, or reject the set.
8. **Close the prototype.** Preserve an unambiguous visual reference for the selected direction, its relevant states and viewing conditions, and unresolved questions. For a requested hybrid, assemble and show the combined result so its acceptance refers to a visible design. Retain this reference for implementation comparison; delete unselected candidates after preserving decision evidence, or retain them only in their declared isolated discovery location. Stop every server and process you started, and stop without implementing the production solution.

## UI fidelity rules

- Disposable describes lifecycle, not visual quality. Do not present rough, generic, broken, or visibly unfinished UI as an option.
- Use plausible domain-specific content, including the difficult data ranges and empty, loading, error, long-content, or responsive states material to the question.
- Preserve the real app shell, components, tokens, terminology, behavior, and platform conventions unless the brief explicitly allows changing them.
- Ship every candidate with a **scenario selector**: one control outside the product UI, covering none of it, that lists the brief's scenarios by name, loads any of them, and resets the current one to its starting point. Keep the selected scenario in the URL so reload and sharing land on it. The human drives every state from one link.
- Include only interactions needed to judge the design. Use stubs for mutations and never invent features, controls, metrics, customers, or claims to make a candidate look complete.
- Render and inspect every candidate in its intended runtime and at target sizes. Correct clipping, overflow, illegible hierarchy, broken interaction, placeholder content, and other visible defects before judging it.
- Share product primitives when useful, but do not impose a common layout that predetermines the alternatives. Build each candidate from its own thesis rather than restyling a base candidate.

## Production boundary

Selection accepts a direction, not its prototype code. Reusing any part of a candidate is new production work under the project's normal practices, with no quality claim inherited from the prototype.

## Completion criteria

Logic mode has its own [completion criteria](references/logic.md#completion-criteria). For UI mode:

- One shared, evidence-grounded brief made the design question and comparison conditions explicit.
- At least three independent candidates were attempted in isolated workspaces and a fresh judge evaluated their rendered results.
- Every presented candidate passed both fidelity and pairwise divergence checks; omissions and failed rebuilds remain explicit.
- The human received comparable evidence, could drive every scenario of each candidate live, and retained authority to select, hybridize, or reject the directions.
- Candidate disposition and the prototype-to-production boundary are explicit, and no production implementation began.

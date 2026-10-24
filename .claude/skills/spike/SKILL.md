---
name: spike
description: "Run a bounded technical experiment when observation is needed to settle feasibility, integration, performance, or tool behavior. Use when reading alone cannot answer the next technical decision; do not use it to deliver production code."
---

# Spike

Answer one empirical technical question with the smallest runnable experiment that can settle it. A spike is discovery work: its deliverable is evidence, a verdict, and a recommendation—not production code.

## Process

1. **Frame the uncertainty.** State one observable question, why its answer affects the next decision, the relevant environment and representative conditions, what observations would validate or invalidate the hypothesis, and a cost, time, or scope bound. Inspect existing evidence first; do not build an experiment when the answer is already established.
2. **Choose the decisive probe.** Design the cheapest experiment that exercises the real uncertainty. When several probes are plausible, start with the one most likely to invalidate the hypothesis at the lowest cost. Do not broaden the spike to adjacent questions.
3. **Choose the artifact's disposition.** Before building, decide whether to delete the experiment after preserving its evidence or retain it in an isolated discovery location that cannot be mistaken for production code.
4. **Build only what the observation requires.** Create the smallest runnable setup that exposes the behavior directly under representative conditions. Include important failure or edge cases. Avoid production hardening, reusable abstractions, unrelated cleanup, and scaffolding that does not improve the evidence.
5. **Run and capture.** Record the actual commands, inputs, conditions, outputs, measurements, and failures needed to assess the question. Separate observations from interpretation. Investigate surprises only while they fit within the original bound.
6. **Conclude.** Return one verdict—`Validated`, `Partial`, or `Invalidated`—with the supporting evidence, material surprises, remaining uncertainty, production constraints, and a recommendation for the decision that motivated the spike.

An invalidated hypothesis is a successful spike when the evidence removes uncertainty. If the bound expires before the question is settled, report `Partial`; do not silently extend the experiment or overstate the result.

## Production boundary

The experiment does not become production code because it worked or was retained. Reusing any part of it is new production work under the project's normal practices, with no quality claim inherited from the spike.

## Completion criteria

- The question, decision relevance, representative conditions, decisive observations, and bound are explicit.
- The experiment exercised the actual uncertainty, including material failure cases, without expanding into delivery work.
- The verdict follows from captured execution evidence and distinguishes observation, interpretation, and unresolved uncertainty.
- The artifact was deleted or retained only in the declared isolated location.
- The recommendation explains what the evidence means for the next decision without treating experimental code as production-ready.

---
name: deliver
description: "Deliver an accepted spec autonomously, from failing acceptance tests to a pull request with green checks. Use when a spec from `shape` is accepted, or for a bug fix whose reproduction and expected behavior are agreed."
---

# Deliver

Take one accepted spec to a pull request the human only has to merge. The spec's examples define success; the acceptance tests make them executable before any production code exists; the rest of the work makes them pass and leaves the code in good shape. Run to the end on your own.

## Start

Read the spec at the path you were given, every source its Context and Decisions point to, the project's coding standards, and its gate configuration. Require `Status: Accepted`. For a bug fix, the agreed reproduction and expected behavior are the spec. Work on the current branch in the current worktree.

## 1. Acceptance tests

Turn each `test` example into an executable test at the spec's test boundary, with the project's verification method, under the spec's real target conditions. Name each test for the behavior it proves. Run them and watch each go **red** for the right reason: the behavior is missing, not the setup broken. A test for something that must never happen must be able to fail. Commit the tests on their own; when the project's hooks reject failing tests, mark them as expected failures until the code makes them pass.

These assertions are the contract. Glue around them, such as setup, selectors, and helpers, may change as the code takes shape. An assertion changes only when it misstates its example; list each such change for the pull request.

## 2. Make it work

Make the tests pass, then capture each `capture` example from the running product. Commit as you go. Done when every acceptance test is green, the project's gates pass, and the evidence is captured.

What must outlive the spec goes into the change: behavior is already in tests; rationale goes into an ADR through `adr`, and vocabulary and project-wide rules are drafted where `domain-language` and `agents-md` keep them, for the human to accept with the pull request. What only a later issue needs goes into that issue.

## 3. Refine

Run `refine` in a fresh context, such as a subagent, with the spec, the diff range from where delivery began, and the assertion changes. When the harness offers no fresh context, run it yourself and say so in the pull request.

## 4. Ship

Run `ship` once `refine` finishes. When `refine` stopped on blockers, stop with its report instead. A production change made after `refine` finishes, such as a fix for a CI check or one the human asks for, gets a fresh review of that change and its callers, as `refine`'s later rounds do, before the pull request is ready.

## Decisions along the way

Decide reversible choices yourself and record the ones the human would want to know about for the pull request. A one-way door the spec does not settle, such as a migration, a new contract that writes, or a change to a seam an accepted ADR governs, is not one of them. Stop and ask when the change needs one, or when evidence shows that an example, a decision in the spec, or an accepted one-way door is wrong, and continue with work that does not depend on it. The examples are the contract, but a number that sets how much to verify, such as a repetition count, a sample size, or a margin, is a decision like any other: before a verification that runs long or repeats, time one run, and when the whole would cost out of proportion to what it adds, that is evidence its decision is wrong. Put anything to the human, a question or a stop such as `refine`'s blockers, so they can answer it without opening the spec: the behavior at stake in plain words, the options, and your recommendation.

## Done

The pull request is open, its checks are green, every example is proven by a test or a capture, and every deviation from the spec is named in its description. The human merges.

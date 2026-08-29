---
name: ai-game-qa-bootstrap
description: >
  Inspect a local game project and safely scaffold a reusable AI QA environment
  with separate Tech QA, Functional Play QA, Experience Play QA, and Visual QA
  lanes. Use when initializing, auditing, repairing, or extending QA
  infrastructure in a game repository; when converting repeated issues into
  regression rules; or when selecting Fast, Nightly, and Release QA suites from
  a change set. Detect the engine and platform, produce an honest capability
  matrix, and verify the setup without executing or silently modifying game code.
---

# AI Game QA Bootstrap

Set up project-specific QA infrastructure without claiming that every game can already be controlled automatically.

## Non-negotiable boundaries

1. Inspect before modifying.
2. Treat the project as read-only during `inspect`, `plan`, `doctor`, `validate`, and suite selection.
3. Keep all generated environment files under `.ai-game-qa/`.
4. Default to dry-run. Write only after an explicit request to initialize or apply.
5. Never overwrite a modified generated file. Report a conflict and preserve it.
6. Never delete, weaken, or rewrite an existing game test to obtain a pass.
7. Never install global packages, request administrator privileges, or change OS security settings.
8. Never execute build scripts, game binaries, or package hooks during project detection.
9. Do not follow project symlinks while inspecting or fingerprinting.
10. Mark unavailable runtime control as `adapter_required`, `manual`, or `unsupported`; do not substitute a fake result.
11. QA agents record evidence and findings. They do not silently modify game source or approve their own fixes.
12. Design judgment remains human-owned. Experience and subjective visual findings are evidence, not automatic truth.

## QA organization

Separate the professional lane from the execution method.

### Tech QA

Checks build, startup, data, logging, saves, performance, permissions, platform behavior, and deterministic regressions.

### Functional Play QA

Uses visible game inputs to verify explicit outcomes such as damage, interaction, movement, progression, reset, and state transitions.

### Experience Play QA

Observes what a blind or target player understands, misunderstands, repeats, avoids, enjoys, and abandons. Do not expose source, developer intent, previous reports, DOM, console, or hidden state unless the test explicitly changes from blind play to diagnosis.

### Visual QA

Checks layout, readability, rendering, asset identity, scene meaning, information hierarchy, animation continuity, and declared art-direction contracts. Separate deterministic failure from contract violation and subjective review.

Execution methods are independent labels:

- `deterministic`
- `scripted-runtime`
- `vision-agent`
- `blind-play-agent`
- `human-review`

## Standard workflow

### 1. Inspect

Run:

```bash
node <skill-root>/scripts/qa-bootstrap.mjs inspect --project <game-project>
```

Confirm the detected engine, framework, target, adapter hint, warnings, and capability matrix. Inspection must report `executedProjectCode: false`.

### 2. Plan

Run:

```bash
node <skill-root>/scripts/qa-bootstrap.mjs plan --project <game-project>
```

Review every proposed `create`, `update`, `unchanged`, and `conflict` action. Do not treat a conflict as permission to replace the file.

### 3. Apply only after an explicit initialization request

```bash
node <skill-root>/scripts/qa-bootstrap.mjs apply --project <game-project> --write
```

The command must keep the source fingerprint unchanged and write only below `.ai-game-qa/`.

### 4. Validate

```bash
node <skill-root>/scripts/qa-bootstrap.mjs validate --project <game-project>
node <skill-root>/scripts/qa-bootstrap.mjs doctor --project <game-project>
```

Resolve structural failures before proposing runtime automation. A missing optional adapter is a capability limitation, not a failed game.

### 5. Fill project contracts

Use the generated files:

- `.ai-game-qa/contracts/technical.md`
- `.ai-game-qa/contracts/gameplay.md`
- `.ai-game-qa/contracts/visual.md`

Do not ask a visual agent to infer unrecorded art direction, identity, or scene purpose as fact.

### 6. Promote repeated or important issues

An issue is eligible when at least one is true:

- severity is `critical` or `high`;
- the same underlying problem occurred at least twice;
- recurrence risk is broad;
- manual review cost is high and the expected result is clear.

Dry-run first:

```bash
node <skill-root>/scripts/qa-bootstrap.mjs promote \
  --project <game-project> \
  --issue <issue.json>
```

Then write explicitly:

```bash
node <skill-root>/scripts/qa-bootstrap.mjs promote \
  --project <game-project> \
  --issue <issue.json> \
  --write
```

Preserve the issue ID, promotion reason, oracle, trigger metadata, and evidence requirements. A rule must fail on the known broken fixture before it is accepted as a regression rule whenever such a fixture is practical.

### 7. Select suites

For a changed set:

```bash
node <skill-root>/scripts/qa-bootstrap.mjs select \
  --project <game-project> \
  --suite fast \
  --changed src/combat/damage.ts \
  --tag combat
```

Use:

- **Fast** for change-impact matches, always-on rules, and low/medium-cost checks.
- **Nightly** for all enabled registered rules.
- **Release** for all enabled rules plus declared human-review gates.

Change-impact selection is an optimization, not proof of full coverage. Keep Nightly and Release suites.

## Runtime adapter gate

This v0.1 skill scaffolds the environment and contracts. Before an agent or script controls a game, require an adapter that documents and verifies:

- supported engine, build target, and host OS;
- launch and cleanup ownership;
- screenshot and coordinate-input contract;
- save isolation and known limitations;
- logs and source-access boundaries;
- permission preflight;
- deterministic test fixtures;
- failure diagnostics.

Do not execute an unknown binary or build command merely because the project was detected.

## Completion report

Report:

- detected engine/framework/target;
- capability status per QA lane;
- files created, updated, unchanged, and conflicted;
- source fingerprint preservation;
- validation and doctor results;
- runtime adapters still required;
- next contract or rule that a human must define.

Keep implementation diaries and raw machine paths out of committed project files.

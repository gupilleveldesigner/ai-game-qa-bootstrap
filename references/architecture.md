# Architecture

## Purpose

AI Game QA Bootstrap is a setup layer, not a universal runtime runner. It discovers what kind of game project is present, records what QA is currently possible, scaffolds project-owned QA contracts, and preserves recurring knowledge as reusable rules.

## Components

```text
SKILL.md
   │
   ├── inspect / doctor
   │      ├── engine detection
   │      └── capability matrix
   │
   ├── plan / apply
   │      ├── dry-run action plan
   │      ├── conflict preservation
   │      ├── generated manifest
   │      └── source fingerprint guard
   │
   ├── promote
   │      └── issue → reusable QA rule
   │
   └── select
          ├── Fast change-impact suite
          ├── Nightly full suite
          └── Release full suite
```

## Separation of responsibilities

- **Bootstrap** owns detection, path safety, schemas, scaffolding, rule registration, and suite selection.
- **Runtime adapters** own launch, capture, input, logs, save isolation, permissions, and cleanup for one known target.
- **QA agents** own observation and evidence under their lane's contract.
- **Fix agents** may change game source, but may not rewrite the original failing rule without explicit review.
- **Humans** own product intent, risk acceptance, subjective design judgment, and release approval.

## Data flow

1. Inspect the project without executing it.
2. Produce detection signals and a capability matrix.
3. Plan files under `.ai-game-qa/`.
4. Apply only after explicit authorization.
5. Define technical, gameplay, and visual contracts.
6. Register rules from known issues.
7. Select Fast rules from change metadata.
8. Run complete Nightly and Release suites independently of the Fast selector.
9. Preserve evidence and compare fixes against the same rule.

## Why four lanes

Functional correctness and player experience are not the same oracle. A door can technically open while players fail to understand that it is interactive. Likewise, a UI can be geometrically valid while its hierarchy makes the objective hard to find. Splitting lanes keeps deterministic failures, functional behavior, player observations, and visual judgments from collapsing into one vague report.

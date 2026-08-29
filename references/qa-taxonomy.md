# QA Taxonomy

## Professional lanes

### Tech QA

Use for build, startup, crash, data, logging, save/load, performance, platform, permission, packaging, and deterministic regression behavior.

Typical outcomes: `passed`, `failed`, `blocked`, or `unsupported`.

### Functional Play QA

Use when the system must be exercised through visible player input and an observable outcome exists.

Examples include attacks reducing health, switches opening doors, weapon swaps, encounter progression, and reset behavior.

Typical outcomes: `passed`, `failed`, or `blocked`.

### Experience Play QA

Use for first-time understanding, learning, navigation, interest, friction, repeated behavior, avoided behavior, and genuine exit points.

Do not force `pass/fail` when the result is an observation or trend. Prefer observation, experience risk, retention signal, update opportunity, or needs-more-runs.

### Visual QA

Use for geometry, layout, readability, rendering, asset identity, scene meaning, camera, animation continuity, information hierarchy, and art-direction contracts.

Classify findings as:

- `deterministic_failure` — measurable clipping, missing asset, invalid bounds, or wrong identity ID;
- `contract_violation` — a declared scene, character, palette, hierarchy, or style rule is violated;
- `subjective_review` — a reasoned visual concern that needs human judgment.

## Execution methods

Execution method is independent of lane:

| Method | Meaning |
|---|---|
| `deterministic` | A script or exact rule evaluates the result. |
| `scripted-runtime` | A controlled runtime sequence performs inputs and checks observable outcomes. |
| `vision-agent` | A visual model reviews screenshots or video against explicit contracts. |
| `blind-play-agent` | An agent plays without source, logs, prior reports, or developer intent. |
| `human-review` | A person makes the decision, supported by recorded evidence. |

## Cross-lane links

Do not duplicate the same root issue as unrelated tickets. Preserve each lane's evidence while linking causal and impact relationships.

# Evidence Contract

Evidence should make a finding reproducible without exposing secrets or unrelated project data.

## Common evidence types

- log excerpt with bounded context;
- screenshot with viewport and timestamp;
- short video with start/end state;
- action trace with input and before/after frame;
- metric with collection method and unit;
- human note that clearly separates observation from interpretation.

## Minimum finding fields

- rule ID;
- lane and execution method;
- environment/build identity;
- reproduction steps or observed action sequence;
- expected result;
- actual result;
- evidence references;
- confidence;
- limitation or blocked condition;
- links to related cross-lane findings.

## Storage

Generated projects ignore runtime evidence, reports, and state by default. Teams may choose a project-specific archival policy, but must not commit tokens, credentials, user home paths, private saves, unredacted production logs, or confidential content outside repository policy.

Evidence paths should remain project-relative and must never be accepted as arbitrary file-serving paths without canonical root validation.

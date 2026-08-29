# QA Rule Contract

A reusable rule is more than a checklist sentence. It must contain enough information to decide when it runs, what evidence it needs, and what counts as failure.

## Required concepts

- stable rule ID;
- professional lane;
- execution method;
- severity;
- origin issue and promotion reason;
- file, tag, dependency, or always-on triggers;
- Fast/Nightly/Release cadence;
- cost estimate;
- expected observable result;
- explicit failure condition;
- required evidence.

## Promotion gate

Promote a finding when any condition is true:

- critical or high severity;
- the same underlying problem occurred at least twice;
- broad recurrence risk;
- high manual review cost with a clear observable oracle.

A repeated vague opinion is not automatically a rule. Clarify the oracle first.

## Regression proof

When practical, preserve two fixtures:

1. the known broken fixture where the rule fails;
2. the fixed fixture where the same unchanged rule passes.

Do not accept a test that only succeeds after its expected result was rewritten to match the implementation.

## Change-impact selection

Fast selection may use changed file patterns, system and content tags, dependency tags, recent failures, always-on critical rules, and risk expansion when impact is uncertain.

Fast selection is not proof of full coverage. Nightly and Release remain full suites.

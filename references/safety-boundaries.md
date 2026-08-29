# Safety Boundaries

## Project inspection

Inspection may read ordinary project files required for detection. It must not:

- execute package scripts, editor commands, game binaries, or plugins;
- load project code into a runtime;
- follow symbolic links;
- copy secrets, environment files, credentials, saves, or unrelated source;
- infer that detection equals runtime support.

## Generated writes

All generated writes are restricted to `.ai-game-qa/`.

Before writing:

1. canonicalize the project root;
2. reject absolute and parent-traversal paths;
3. reject a symbolic link in any generated path component;
4. compare desired files with the generated manifest;
5. preserve modified generated files as conflicts;
6. compute the game-source fingerprint.

After writing, the source fingerprint must be unchanged.

## Runtime trust

This bootstrap does not sandbox untrusted game code. A future runtime adapter must state this clearly and must not launch a project merely because it was detected.

A runtime adapter must use explicit entrypoints, owned process tracking, adapter-specific permission preflight, scoped save isolation with documented limits, no elevation or OS security bypass, and evidence-preserving failure classification.

## Agent boundaries

A blind Experience Play session must not receive source code, logs, DOM, internal state, previous reports, or developer explanations. A QA diagnosis may receive narrowly allowed source and logs only after visible reproduction.

A QA agent must not edit the game, weaken the failing rule, delete evidence, approve its own fix without an independent rerun, or convert missing capability into fabricated observations.

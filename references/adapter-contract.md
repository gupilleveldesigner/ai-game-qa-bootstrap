# Runtime Adapter Contract

A runtime adapter upgrades one or more capabilities from `adapter_required` to `supported`. It is not valid merely because it can launch a process once.

## Mandatory declarations

- engine/framework and build target;
- supported host operating systems;
- runtime prerequisites;
- launch entrypoint and argument model;
- process ownership and cleanup;
- screen capture method and limitations;
- coordinate system and allowed inputs;
- save/session isolation and known gaps;
- log access boundary;
- network policy;
- permission preflight and user actions;
- reset and stop behavior;
- evidence locations;
- deterministic fixture tests;
- unsupported modes and diagnostics.

## Safety requirements

- no shell composition for untrusted entrypoints;
- no privilege escalation;
- no global security disablement;
- no process termination outside the recorded owned tree;
- no deletion of save data unless the adapter created and can exactly identify it;
- no claim of complete isolation when registry, cloud, absolute paths, services, or platform stores remain possible;
- no source access in a blind play workspace.

## Verification gate

An adapter is `supported` only after its real or platform-gated integration test confirms launch, capture, input, evidence, reset, stop, and cleanup. Mock tests alone establish contract shape, not physical platform support.

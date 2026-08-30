# Changelog

## Unreleased

## 0.1.1 - 2026-08-30

- Revalidate setup plans and target hashes immediately before writes so stale plans cannot overwrite user changes.
- Reject symbolic links in nested generated paths during planning, validation, rule loading, and writes.
- Validate generated configuration and QA rules against their required structure.
- Avoid classifying package-only Node.js tooling as a web game project.
- Accept multiple `--changed` and `--tag` values and reject unknown CLI options.
- Add standalone CI across Node.js 20, 22, and 24.

## 0.1.0 - 2026-08-29

- Added read-only project inspection and multi-engine detection.
- Added project-specific QA capability matrices.
- Added dry-run-first, idempotent `.ai-game-qa` scaffolding.
- Added Tech QA, Functional Play QA, Experience Play QA, and Visual QA lanes.
- Added issue-to-rule promotion and Fast/Nightly/Release suite selection.
- Added path, symlink, conflict, source-fingerprint, and schema validation safeguards.

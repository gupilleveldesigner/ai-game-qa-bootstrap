# AI Game QA Bootstrap

An engine-agnostic Codex skill and zero-dependency Node.js toolkit for safely creating a project-specific game QA environment.

It separates four QA lanes:

- **Tech QA** — build, startup, logs, data, saves, performance, platform, and deterministic regression checks.
- **Functional Play QA** — visible-input scenarios with explicit expected outcomes.
- **Experience Play QA** — blind or human observation of understanding, behavior, interest, confusion, and exit points.
- **Visual QA** — layout, readability, rendering, identity, scene meaning, animation, and art-direction contracts.

The lane and execution method are separate. A Visual QA rule may be deterministic; a Tech QA rule may need a runtime adapter.

## What v0.1 does

- detects common game project types without executing project code;
- produces an honest capability matrix instead of claiming universal automation;
- previews a dry-run plan;
- creates an idempotent `.ai-game-qa/` environment;
- preserves modified generated files as conflicts;
- fingerprints source files before and after apply;
- turns recurring or high-risk issues into reusable QA rules;
- selects change-relevant Fast checks and complete Nightly/Release suites;
- validates the generated environment;
- runs with Node.js built-ins only.

## What v0.1 does not do

- automatically play every engine or platform;
- execute build scripts or game binaries during inspection;
- modify game source;
- infer unrecorded design intent as fact;
- weaken existing tests;
- sandbox untrusted game code;
- replace human release ownership.

Runtime control belongs in independently verified adapters.

## Install as a project skill

Copy this directory to:

```text
<game-project>/.agents/skills/ai-game-qa-bootstrap/
```

Or keep it in a shared skills directory and invoke its `SKILL.md` from Codex.

Requirements:

- Node.js 20 or newer
- no npm dependencies
- no administrator privileges

## Quick start

```bash
# 1. Read-only inspection
node scripts/qa-bootstrap.mjs inspect --project ../MyGame

# 2. Dry-run plan
node scripts/qa-bootstrap.mjs plan --project ../MyGame

# 3. Explicit apply
node scripts/qa-bootstrap.mjs apply --project ../MyGame --write

# 4. Verify
node scripts/qa-bootstrap.mjs validate --project ../MyGame
node scripts/qa-bootstrap.mjs doctor --project ../MyGame
```

Windows PowerShell example:

```powershell
$GameProject = Resolve-Path ..\MyGame
node .\scripts\qa-bootstrap.mjs inspect --project $GameProject
node .\scripts\qa-bootstrap.mjs apply --project $GameProject --write
```

## Generated project structure

```text
.ai-game-qa/
├── README.md
├── config.json
├── capabilities.json
├── project-manifest.json
├── generated-manifest.json
├── contracts/
│   ├── technical.md
│   ├── gameplay.md
│   └── visual.md
├── rules/
│   ├── tech/
│   ├── play-functional/
│   ├── play-experience/
│   └── visual/
├── suites/
│   ├── fast.json
│   ├── nightly.json
│   └── release.json
├── schemas/
├── templates/
├── adapters/
├── fixtures/
├── evidence/
├── reports/
└── state/
```

## Detected project families

The detector currently recognizes markers for:

- HTML5/Web, Phaser, PixiJS, Three.js, Babylon.js
- LÖVE2D
- Godot
- Unity
- Unreal Engine
- Defold
- GameMaker
- Construct
- Ren'Py
- Bevy
- MonoGame/FNA/XNA
- generic fallback projects

Detection is not runtime support. `capabilities.json` records `supported`, `adapter_required`, `project_input_required`, `manual`, or `unsupported` for each capability.

## Promote an issue into a QA rule

Start from `.ai-game-qa/templates/issue.example.json`, then dry-run:

```bash
node scripts/qa-bootstrap.mjs promote \
  --project ../MyGame \
  --issue ../issue.json
```

Write after review:

```bash
node scripts/qa-bootstrap.mjs promote \
  --project ../MyGame \
  --issue ../issue.json \
  --write
```

Promotion is allowed when the issue is high/critical, repeated, broadly risky, or expensive to review manually with a clear oracle.

## Select affected QA

```bash
node scripts/qa-bootstrap.mjs select \
  --project ../MyGame \
  --suite fast \
  --changed src/combat/damage.ts \
  --tag combat
```

Fast selection never replaces the complete Nightly and Release suites.

## Safety model

- All generated writes stay under `.ai-game-qa/`.
- The default is dry-run.
- Project code is not executed during detection.
- Project symlinks are not followed during scanning or fingerprinting.
- A symlink in the generated output path blocks writes.
- User-modified generated files are conflicts, not overwrite targets.
- Source fingerprinting excludes `.ai-game-qa/` and verifies that apply did not modify game source.
- No global install, elevation, registry change, or security bypass is used.

This tool does **not** sandbox a malicious game, build script, plugin, or binary. Use runtime adapters only with projects and builds you trust.

## 한국어 요약

이 스킬은 게임을 무조건 자동 테스트한다고 주장하지 않습니다. 프로젝트를 먼저 읽기 전용으로 분석하고, 테크 QA·기능 플레이 QA·경험 플레이 QA·시각 QA의 규칙·계약·실행군을 안전하게 구성합니다. 실제 게임 실행과 입력은 엔진별 런타임 어댑터가 검증된 뒤에만 연결합니다.

## Development

```bash
npm test
```

The test suite uses temporary projects and does not touch real game repositories.

## License

MIT

import { GENERATOR_NAME, GENERATOR_VERSION, QA_LANES, SCHEMA_VERSION } from "./constants.mjs";
import { qaIssueSchema, qaReportSchema, qaRuleSchema } from "./schemas.mjs";

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function laneReadme(lane) {
  const descriptions = {
    tech: "Deterministic build, startup, data, logging, save, performance, and platform checks.",
    "play-functional": "Visible-input scenarios with explicit expected outcomes. These are functional checks, not experience opinions.",
    "play-experience": "Blind or human play observations about understanding, behavior, interest, confusion, and exit points.",
    visual: "Layout, readability, rendering, identity, semantic consistency, and art-direction contract checks."
  };
  return `# ${lane}\n\n${descriptions[lane]}\n\nRegister rules as strict JSON files matching \`schemas/qa-rule.schema.json\`.\n`;
}

export function buildGeneratedFiles({ detection, capabilities, sourceFingerprint }) {
  const engine = detection.primary.engine;
  const framework = detection.primary.framework ?? null;
  const files = new Map();

  files.set(".ai-game-qa/README.md", `# Project AI Game QA Environment\n\nThis directory is generated and maintained by ${GENERATOR_NAME}.\n\n## Lanes\n\n- **Tech QA**: deterministic and environment-facing correctness.\n- **Functional Play QA**: visible-input scenarios with explicit outcomes.\n- **Experience Play QA**: blind or human observation of player experience.\n- **Visual QA**: layout, rendering, readability, identity, and semantic visual contracts.\n\nExecution method is a separate axis. A Visual QA rule can be deterministic; a Tech QA rule can require a runtime adapter.\n\n## Safety\n\n- The bootstrap never executes project code during inspection.\n- Generated files stay under \`.ai-game-qa\`.\n- Modified generated files become conflicts rather than being overwritten.\n- Runtime automation is not claimed until an adapter is installed and validated.\n`);

  files.set(".ai-game-qa/config.json", json({
    schemaVersion: SCHEMA_VERSION,
    generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
    project: {
      path: ".",
      engine,
      framework,
      target: detection.primary.target,
      adapterHint: detection.primary.adapterHint
    },
    lanes: QA_LANES.map((id) => ({ id, enabled: true })),
    suites: {
      fast: { policy: "change-impact", maxCost: "medium" },
      nightly: { policy: "all-enabled" },
      release: { policy: "all-enabled-plus-human-review" }
    },
    safety: {
      dryRunByDefault: true,
      modifyGameSource: false,
      overwriteConflicts: false,
      followSymlinks: false,
      allowGlobalInstall: false,
      allowPrivilegeEscalation: false
    }
  }));

  files.set(".ai-game-qa/capabilities.json", json(capabilities));
  files.set(".ai-game-qa/project-manifest.json", json({
    schemaVersion: SCHEMA_VERSION,
    projectPath: ".",
    detection,
    sourceFingerprint
  }));

  files.set(".ai-game-qa/contracts/technical.md", `# Technical QA Contract\n\nDefine build, startup, logging, save, data, performance, and platform expectations here.\n\nA technical finding must distinguish **observed fact**, **diagnostic evidence**, and **cause hypothesis**.\n`);
  files.set(".ai-game-qa/contracts/gameplay.md", `# Gameplay QA Contract\n\n## Functional play\n\nDefine visible actions, expected outcomes, reset conditions, and blocking states.\n\n## Experience play\n\nDefine the test question, intended audience, blindness boundary, duration, and evidence policy. Experience observations are not automatic release blockers.\n`);
  files.set(".ai-game-qa/contracts/visual.md", `# Visual QA Contract\n\nRecord explicit visual intent before asking an agent to make semantic or aesthetic judgments.\n\nRecommended sections:\n\n- scene function and required visual signals;\n- character and object identity references;\n- UI hierarchy and safe areas;\n- palette, value, pixel-grid, camera, and animation rules;\n- deterministic failures versus subjective review.\n`);

  for (const lane of QA_LANES) files.set(`.ai-game-qa/rules/${lane}/README.md`, laneReadme(lane));

  files.set(".ai-game-qa/suites/fast.json", json({
    schemaVersion: SCHEMA_VERSION,
    id: "fast",
    selection: "changed files, tags, dependency tags, and always-on rules",
    maximumCost: "medium",
    purpose: "Frequent feedback without pretending to cover the whole project"
  }));
  files.set(".ai-game-qa/suites/nightly.json", json({
    schemaVersion: SCHEMA_VERSION,
    id: "nightly",
    selection: "all enabled registered rules",
    purpose: "Catch cross-system regressions that change-impact selection can miss"
  }));
  files.set(".ai-game-qa/suites/release.json", json({
    schemaVersion: SCHEMA_VERSION,
    id: "release",
    selection: "all enabled registered rules plus required human-review gates",
    purpose: "Release-candidate evidence and unresolved-risk review"
  }));

  files.set(".ai-game-qa/schemas/qa-issue.schema.json", json(qaIssueSchema));
  files.set(".ai-game-qa/schemas/qa-rule.schema.json", json(qaRuleSchema));
  files.set(".ai-game-qa/schemas/qa-report.schema.json", json(qaReportSchema));

  files.set(".ai-game-qa/templates/issue.example.json", json({
    id: "ISSUE-001",
    title: "Example repeated issue",
    summary: "Describe what was observed without guessing the cause.",
    severity: "medium",
    occurrences: 2,
    expected: "State the expected observable result.",
    actual: "State the actual observable result.",
    suggestedLane: "play-functional",
    tags: ["example"],
    affectedFiles: ["src/example/**"],
    evidence: ["evidence/example.png"],
    broadRisk: false,
    manualReviewCost: "medium",
    oracleIsClear: true
  }));

  files.set(".ai-game-qa/adapters/README.md", `# Runtime adapters\n\nVersion ${GENERATOR_VERSION} scaffolds contracts and capability status; it does not claim universal runtime control.\n\nAn adapter must declare:\n\n1. supported engine, target, and host platform;\n2. launch and cleanup ownership;\n3. screenshot and input coordinate contract;\n4. save-data isolation and its limitations;\n5. log access boundaries;\n6. permission preflight;\n7. deterministic fixtures and failure diagnostics.\n`);
  files.set(".ai-game-qa/fixtures/README.md", `# QA fixtures\n\nStore minimal, non-sensitive fixtures that reproduce rules before and after fixes. Never copy secrets, production saves, or unrelated project data here.\n`);
  files.set(".ai-game-qa/evidence/.gitignore", "*\n!.gitignore\n");
  files.set(".ai-game-qa/reports/.gitignore", "*\n!.gitignore\n");
  files.set(".ai-game-qa/state/.gitignore", "*\n!.gitignore\n");

  return files;
}

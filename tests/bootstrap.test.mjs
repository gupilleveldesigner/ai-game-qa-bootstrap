import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildCapabilityMatrix } from "../scripts/lib/capabilities.mjs";
import { detectProject } from "../scripts/lib/detect.mjs";
import {
  assertSafeRelativePath,
  hashText,
  projectFingerprint,
  resolveInside,
  walkFiles
} from "../scripts/lib/fs-safe.mjs";
import {
  applySetupPlan,
  createSetupPlan,
  planGeneratedFiles,
  validateSetup
} from "../scripts/lib/plan.mjs";
import {
  buildRuleFromIssue,
  inferLane,
  promoteIssue,
  promotionEligibility
} from "../scripts/lib/rules.mjs";
import { matchesGlob, selectRules } from "../scripts/lib/suites.mjs";

async function makeFixture(t, files = {}, directories = []) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-game-qa-bootstrap-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  for (const directory of directories) await mkdir(path.join(root, directory), { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  return root;
}

function packageJson({ dependencies = {}, devDependencies = {}, scripts = {} } = {}) {
  return JSON.stringify({ name: "fixture", version: "1.0.0", dependencies, devDependencies, scripts }, null, 2);
}

function issue(overrides = {}) {
  return {
    id: "ISSUE-014",
    title: "Enemy does not receive damage",
    summary: "Visible attacks connect but enemy health does not change.",
    severity: "medium",
    occurrences: 2,
    expected: "A valid attack reduces enemy health.",
    actual: "Enemy health remains unchanged.",
    tags: ["combat", "damage"],
    affectedFiles: ["src/combat/**"],
    evidence: ["evidence/hit.png"],
    broadRisk: false,
    manualReviewCost: "medium",
    oracleIsClear: true,
    ...overrides
  };
}

function rule(id, overrides = {}) {
  return {
    schemaVersion: 1,
    id,
    title: id,
    lane: "tech",
    executionMethod: "deterministic",
    enabled: true,
    severity: "medium",
    origin: { issueId: id, promotionReason: "test" },
    trigger: { filePatterns: ["src/**/*.ts"], tags: ["combat"], dependencyTags: [], always: false },
    cadence: ["on-change", "nightly", "release"],
    cost: "low",
    oracle: { expected: "expected", failureCondition: "failure" },
    evidence: { required: ["log"], references: [] },
    createdAt: "2026-08-29T00:00:00.000Z",
    ...overrides
  };
}

test("01 detects Phaser through package dependencies", async (t) => {
  const root = await makeFixture(t, { "package.json": packageJson({ dependencies: { phaser: "3.90.0" } }), "index.html": "<canvas></canvas>" });
  const result = await detectProject(root);
  assert.equal(result.primary.engine, "web");
  assert.equal(result.primary.framework, "phaser");
});

test("02 detects PixiJS through package dependencies", async (t) => {
  const root = await makeFixture(t, { "package.json": packageJson({ dependencies: { "pixi.js": "8.0.0" } }), "index.html": "<canvas></canvas>" });
  assert.equal((await detectProject(root)).primary.framework, "pixi");
});

test("03 detects Three.js through package dependencies", async (t) => {
  const root = await makeFixture(t, { "package.json": packageJson({ dependencies: { three: "0.180.0" } }), "index.html": "<canvas></canvas>" });
  assert.equal((await detectProject(root)).primary.framework, "three");
});

test("04 detects Babylon.js through package dependencies", async (t) => {
  const root = await makeFixture(t, { "package.json": packageJson({ dependencies: { "@babylonjs/core": "8.0.0" } }), "index.html": "<canvas></canvas>" });
  assert.equal((await detectProject(root)).primary.framework, "babylon");
});

test("05 detects a generic static web export", async (t) => {
  const root = await makeFixture(t, { "index.html": "<!doctype html><title>Game</title>" });
  const result = await detectProject(root);
  assert.equal(result.primary.engine, "web");
  assert.equal(result.primary.framework, "generic-web");
});

test("06 detects LÖVE2D from root main.lua", async (t) => {
  const root = await makeFixture(t, { "main.lua": "function love.draw() end" });
  assert.equal((await detectProject(root)).primary.engine, "love2d");
});

test("07 detects Godot from project.godot", async (t) => {
  const root = await makeFixture(t, { "project.godot": "[application]" });
  assert.equal((await detectProject(root)).primary.engine, "godot");
});

test("08 detects Unity from Assets and ProjectSettings", async (t) => {
  const root = await makeFixture(t, { "ProjectSettings/ProjectVersion.txt": "m_EditorVersion: 6000" }, ["Assets"]);
  assert.equal((await detectProject(root)).primary.engine, "unity");
});

test("09 detects Unreal from a root uproject", async (t) => {
  const root = await makeFixture(t, { "MyGame.uproject": "{}" });
  assert.equal((await detectProject(root)).primary.engine, "unreal");
});

test("10 detects Defold from game.project", async (t) => {
  const root = await makeFixture(t, { "game.project": "[project]" });
  assert.equal((await detectProject(root)).primary.engine, "defold");
});

test("11 detects GameMaker from a root yyp", async (t) => {
  const root = await makeFixture(t, { "Game.yyp": "{}" });
  assert.equal((await detectProject(root)).primary.engine, "gamemaker");
});

test("12 detects Construct from a root c3p", async (t) => {
  const root = await makeFixture(t, { "Game.c3p": "fixture" });
  assert.equal((await detectProject(root)).primary.engine, "construct");
});

test("13 detects Ren'Py from a root rpy", async (t) => {
  const root = await makeFixture(t, { "script.rpy": "label start:" });
  assert.equal((await detectProject(root)).primary.engine, "renpy");
});

test("14 detects Bevy from Cargo.toml", async (t) => {
  const root = await makeFixture(t, { "Cargo.toml": "[dependencies]\nbevy = \"0.16\"\n" });
  assert.equal((await detectProject(root)).primary.engine, "bevy");
});

test("15 detects MonoGame from a csproj reference", async (t) => {
  const root = await makeFixture(t, { "Game.csproj": "<Project><PackageReference Include=\"MonoGame.Framework.DesktopGL\" /></Project>" });
  assert.equal((await detectProject(root)).primary.engine, "monogame");
});

test("16 falls back to a generic project", async (t) => {
  const root = await makeFixture(t, { "notes.txt": "custom engine" });
  assert.equal((await detectProject(root)).primary.engine, "generic");
});

test("17 uses the documented build-script priority", async (t) => {
  const root = await makeFixture(t, {
    "package.json": packageJson({ scripts: { "build:web": "echo web", build: "echo primary", "build:production": "echo prod" } }),
    "index.html": "<canvas></canvas>"
  });
  assert.equal((await detectProject(root)).primary.build.script, "build");
});

test("18 inspection never executes a package script", async (t) => {
  const root = await makeFixture(t, {
    "package.json": packageJson({ scripts: { build: "node -e \"require('fs').writeFileSync('executed.txt','bad')\"" } }),
    "index.html": "<canvas></canvas>"
  });
  const result = await detectProject(root);
  assert.equal(result.inspection.executedProjectCode, false);
  await assert.rejects(readFile(path.join(root, "executed.txt"), "utf8"), { code: "ENOENT" });
});

test("19 web capability matrix requires a runtime adapter rather than claiming support", async (t) => {
  const root = await makeFixture(t, { "index.html": "<canvas></canvas>" });
  const matrix = buildCapabilityMatrix(await detectProject(root));
  assert.equal(matrix.lanes.visual.screenshotCapture.status, "adapter_required");
  assert.equal(matrix.claims.fullAutomationClaimed, false);
});

test("20 generic projects retain manual runtime status", async (t) => {
  const root = await makeFixture(t, { "readme.txt": "custom" });
  const matrix = buildCapabilityMatrix(await detectProject(root));
  assert.equal(matrix.lanes["play-functional"].automatedInput.status, "manual");
});

test("21 semantic visual QA requires project intent", async (t) => {
  const root = await makeFixture(t, { "index.html": "<canvas></canvas>" });
  const matrix = buildCapabilityMatrix(await detectProject(root));
  assert.equal(matrix.lanes.visual.semanticReview.status, "project_input_required");
});

test("22 capability matrix always contains all four QA lanes", async (t) => {
  const root = await makeFixture(t, { "project.godot": "[application]" });
  const lanes = Object.keys(buildCapabilityMatrix(await detectProject(root)).lanes).sort();
  assert.deepEqual(lanes, ["play-experience", "play-functional", "tech", "visual"]);
});

test("23 rejects absolute generated paths", () => {
  assert.throws(() => assertSafeRelativePath(path.resolve("/tmp/outside")), /Unsafe absolute/);
});

test("24 rejects parent traversal", () => {
  assert.throws(() => assertSafeRelativePath("../outside.json"), /escapes/);
});

test("25 resolves a normal path inside the root", async (t) => {
  const root = await makeFixture(t);
  assert.equal(resolveInside(root, ".ai-game-qa/config.json"), path.join(root, ".ai-game-qa", "config.json"));
});

test("26 scanner records but does not follow a directory symlink", async (t) => {
  const root = await makeFixture(t, { "inside.txt": "inside" });
  const external = await mkdtemp(path.join(os.tmpdir(), "ai-game-qa-external-"));
  t.after(async () => rm(external, { recursive: true, force: true }));
  await writeFile(path.join(external, "secret.txt"), "secret", "utf8");
  try {
    await symlink(external, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error?.code === "EPERM") return;
    throw error;
  }
  const scan = await walkFiles(root, { excludes: [] });
  assert.deepEqual(scan.symlinks, ["linked"]);
  assert.equal(scan.files.includes("linked/secret.txt"), false);
});

test("27 apply refuses a symlink at the generated output root", async (t) => {
  const root = await makeFixture(t, { "index.html": "<canvas></canvas>" });
  const external = await mkdtemp(path.join(os.tmpdir(), "ai-game-qa-output-"));
  t.after(async () => rm(external, { recursive: true, force: true }));
  try {
    await symlink(external, path.join(root, ".ai-game-qa"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error?.code === "EPERM") return;
    throw error;
  }
  await assert.rejects(createSetupPlan(root), /symbolic link/);
});

test("28 project fingerprint is stable for unchanged source", async (t) => {
  const root = await makeFixture(t, { "src/a.txt": "A", "src/b.txt": "B" });
  assert.deepEqual(await projectFingerprint(root), await projectFingerprint(root));
});

test("29 project fingerprint ignores generated QA output", async (t) => {
  const root = await makeFixture(t, { "src/a.txt": "A" });
  const before = await projectFingerprint(root);
  await mkdir(path.join(root, ".ai-game-qa"), { recursive: true });
  await writeFile(path.join(root, ".ai-game-qa", "temporary.txt"), "generated", "utf8");
  const after = await projectFingerprint(root);
  assert.equal(before.value, after.value);
  assert.equal(before.fileCount, after.fileCount);
});

test("30 apply is a dry-run without --write", async (t) => {
  const root = await makeFixture(t, { "index.html": "<canvas></canvas>" });
  const plan = await createSetupPlan(root);
  const result = await applySetupPlan(plan, { write: false });
  assert.equal(result.written, false);
  await assert.rejects(readFile(path.join(root, ".ai-game-qa", "config.json"), "utf8"), { code: "ENOENT" });
});

test("31 setup plan includes the four lanes and three suites", async (t) => {
  const root = await makeFixture(t, { "main.lua": "function love.draw() end" });
  const plan = await createSetupPlan(root);
  const paths = new Set(plan.actions.map((action) => action.path));
  for (const lane of ["tech", "play-functional", "play-experience", "visual"]) {
    assert.equal(paths.has(`.ai-game-qa/rules/${lane}/README.md`), true);
  }
  for (const suite of ["fast", "nightly", "release"]) {
    assert.equal(paths.has(`.ai-game-qa/suites/${suite}.json`), true);
  }
});

test("32 apply writes only under .ai-game-qa", async (t) => {
  const root = await makeFixture(t, { "index.html": "<canvas></canvas>", "source.txt": "keep" });
  const result = await applySetupPlan(await createSetupPlan(root), { write: true });
  assert.equal(result.filesWritten.every((file) => file.startsWith(".ai-game-qa/")), true);
  assert.equal(await readFile(path.join(root, "source.txt"), "utf8"), "keep");
});

test("33 repeated apply is idempotent", async (t) => {
  const root = await makeFixture(t, { "index.html": "<canvas></canvas>" });
  await applySetupPlan(await createSetupPlan(root), { write: true });
  const second = await createSetupPlan(root);
  assert.equal(second.summary.create, 0);
  assert.equal(second.summary.update, 0);
  assert.equal(second.summary.conflict, 0);
  assert.equal(second.summary.unchanged, second.actions.length);
});

test("34 apply verifies that game source fingerprint is unchanged", async (t) => {
  const root = await makeFixture(t, { "src/game.js": "export const hp = 10;", "index.html": "<script src='src/game.js'></script>" });
  const result = await applySetupPlan(await createSetupPlan(root), { write: true });
  assert.equal(result.sourceUnchanged, true);
});

test("35 modified generated files become conflicts", async (t) => {
  const root = await makeFixture(t, { "index.html": "<canvas></canvas>" });
  await applySetupPlan(await createSetupPlan(root), { write: true });
  await writeFile(path.join(root, ".ai-game-qa", "config.json"), "{\n  \"userModified\": true\n}\n", "utf8");
  const plan = await createSetupPlan(root);
  assert.equal(plan.actions.find((action) => action.path === ".ai-game-qa/config.json").action, "conflict");
});

test("36 an unchanged managed file may be safely updated by a newer template", async (t) => {
  const root = await makeFixture(t, { ".ai-game-qa/test.txt": "old" });
  const previous = { files: { ".ai-game-qa/test.txt": { sha256: hashText("old") } } };
  const actions = await planGeneratedFiles(root, new Map([[".ai-game-qa/test.txt", "new"]]), previous);
  assert.equal(actions[0].action, "update");
});

test("37 generated manifest records managed hashes", async (t) => {
  const root = await makeFixture(t, { "project.godot": "[application]" });
  await applySetupPlan(await createSetupPlan(root), { write: true });
  const manifest = JSON.parse(await readFile(path.join(root, ".ai-game-qa", "generated-manifest.json"), "utf8"));
  assert.equal(manifest.generator.name, "ai-game-qa-bootstrap");
  assert.match(manifest.files[".ai-game-qa/config.json"].sha256, /^[a-f0-9]{64}$/);
});

test("38 a freshly applied setup validates", async (t) => {
  const root = await makeFixture(t, { "index.html": "<canvas></canvas>" });
  await applySetupPlan(await createSetupPlan(root), { write: true });
  assert.deepEqual(await validateSetup(root), { ok: true, errors: [], warnings: [] });
});

test("39 a high-severity issue is immediately eligible", () => {
  assert.equal(promotionEligibility(issue({ severity: "high", occurrences: 1 })).eligible, true);
});

test("40 a repeated medium issue is eligible", () => {
  assert.equal(promotionEligibility(issue({ severity: "medium", occurrences: 2 })).eligible, true);
});

test("41 a single low-risk issue is not automatically eligible", () => {
  assert.equal(promotionEligibility(issue({ severity: "low", occurrences: 1, oracleIsClear: false })).eligible, false);
});

test("42 an explicit valid lane is preserved", () => {
  assert.equal(inferLane(issue({ suggestedLane: "play-experience" })), "play-experience");
});

test("43 visual terminology infers the Visual QA lane", () => {
  assert.equal(inferLane(issue({ suggestedLane: undefined, title: "HUD text overlaps the portrait", tags: ["ui", "layout"] })), "visual");
  assert.equal(buildRuleFromIssue(issue({ suggestedLane: "visual" }), { now: "2026-08-29T00:00:00.000Z" }).lane, "visual");
});

test("44 issue promotion supports dry-run, write, idempotence, and conflict preservation", async (t) => {
  const root = await makeFixture(t, { "index.html": "<canvas></canvas>" });
  await applySetupPlan(await createSetupPlan(root), { write: true });
  const now = "2026-08-29T00:00:00.000Z";
  assert.equal((await promoteIssue(root, issue(), { write: false, now })).status, "planned");
  assert.equal((await promoteIssue(root, issue(), { write: true, now })).status, "created");
  assert.equal((await promoteIssue(root, issue(), { write: true, now })).status, "unchanged");
  assert.equal((await promoteIssue(root, issue({ title: "Changed title" }), { write: true, now })).status, "conflict");
});

test("45 glob matching supports recursive and single-segment wildcards", () => {
  assert.equal(matchesGlob("src/combat/damage.ts", "src/**/*.ts"), true);
  assert.equal(matchesGlob("src/ui/hud.css", "src/*/hud.css"), true);
  assert.equal(matchesGlob("assets/hud.css", "src/*/hud.css"), false);
});

test("46 Fast selects relevant low/medium rules and excludes high-cost rules", () => {
  const rules = [
    rule("TECH-COMBAT", { trigger: { filePatterns: ["src/combat/**"], tags: [], dependencyTags: [], always: false } }),
    rule("VIS-HIGH", { lane: "visual", executionMethod: "vision-agent", cost: "high", trigger: { filePatterns: ["src/combat/**"], tags: [], dependencyTags: [], always: false } }),
    rule("TECH-OTHER", { trigger: { filePatterns: ["src/audio/**"], tags: [], dependencyTags: [], always: false } })
  ];
  const result = selectRules({ rules, suite: "fast", changedFiles: ["src/combat/damage.ts"] });
  assert.deepEqual(result.selected.map((item) => item.id), ["TECH-COMBAT"]);
  assert.equal(result.excluded.find((item) => item.id === "VIS-HIGH").reason, "high_cost");
});

test("47 Nightly includes every enabled registered rule", () => {
  const rules = [rule("TECH-A"), rule("VIS-B", { lane: "visual", executionMethod: "vision-agent", cost: "high" })];
  assert.deepEqual(selectRules({ rules, suite: "nightly" }).selected.map((item) => item.id), ["TECH-A", "VIS-B"]);
});

test("48 Release includes all enabled rules and excludes disabled rules", () => {
  const rules = [rule("TECH-A"), rule("TECH-DISABLED", { enabled: false }), rule("PLAY-B", { lane: "play-functional", executionMethod: "scripted-runtime" })];
  const result = selectRules({ rules, suite: "release" });
  assert.deepEqual(result.selected.map((item) => item.id), ["PLAY-B", "TECH-A"]);
  assert.deepEqual(result.excluded, [{ id: "TECH-DISABLED", reason: "disabled" }]);
});

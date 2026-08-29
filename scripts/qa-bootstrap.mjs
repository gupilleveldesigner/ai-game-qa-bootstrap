#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";
import { detectProject } from "./lib/detect.mjs";
import { buildCapabilityMatrix } from "./lib/capabilities.mjs";
import { applySetupPlan, createSetupPlan, validateSetup } from "./lib/plan.mjs";
import { loadRules, promoteIssue } from "./lib/rules.mjs";
import { selectRules } from "./lib/suites.mjs";
import { runDoctor } from "./lib/doctor.mjs";

const HELP = `AI Game QA Bootstrap v0.1.0

Usage:
  node scripts/qa-bootstrap.mjs inspect [--project PATH]
  node scripts/qa-bootstrap.mjs plan [--project PATH]
  node scripts/qa-bootstrap.mjs apply [--project PATH] [--write]
  node scripts/qa-bootstrap.mjs validate [--project PATH]
  node scripts/qa-bootstrap.mjs doctor [--project PATH]
  node scripts/qa-bootstrap.mjs promote --issue FILE [--project PATH] [--write]
  node scripts/qa-bootstrap.mjs select --suite fast|nightly|release [--project PATH]
                                      [--changed FILE ...] [--tag TAG ...]

Safety defaults:
  - inspect, plan, doctor, validate, promote, and select do not execute game code.
  - apply and promote are dry-run unless --write is supplied.
  - generated writes are restricted to .ai-game-qa.
  - modified generated files are reported as conflicts, not overwritten.
`;

function parseArguments(argv) {
  const values = { _: [], changed: [], tag: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      values._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (["write", "help"].includes(key)) {
      values[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Option --${key} requires a value.`);
    index += 1;
    if (key === "changed" || key === "tag") values[key].push(next);
    else values[key] = next;
  }
  return values;
}

function serializablePlan(plan) {
  return {
    schemaVersion: plan.schemaVersion,
    generator: plan.generator,
    projectPath: ".",
    detection: plan.detection,
    capabilities: plan.capabilities,
    sourceFingerprint: plan.sourceFingerprint,
    actions: plan.actions,
    summary: plan.summary
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const command = args._[0];
  if (!command || args.help || command === "help" || command === "--help") {
    process.stdout.write(HELP);
    return;
  }

  const project = args.project ?? process.cwd();
  let result;

  switch (command) {
    case "inspect": {
      const detection = await detectProject(project);
      result = { detection, capabilities: buildCapabilityMatrix(detection) };
      break;
    }
    case "plan": {
      result = serializablePlan(await createSetupPlan(project));
      break;
    }
    case "apply": {
      const plan = await createSetupPlan(project);
      result = { plan: serializablePlan(plan), result: await applySetupPlan(plan, { write: Boolean(args.write) }) };
      break;
    }
    case "validate":
      result = await validateSetup(project);
      if (!result.ok) process.exitCode = 2;
      break;
    case "doctor":
      result = await runDoctor(project);
      if (!result.ok) process.exitCode = 2;
      break;
    case "promote": {
      if (!args.issue) throw new Error("promote requires --issue FILE");
      const issue = JSON.parse(await readFile(args.issue, "utf8"));
      result = await promoteIssue(project, issue, { write: Boolean(args.write) });
      break;
    }
    case "select": {
      const rules = await loadRules(project);
      result = selectRules({
        rules,
        suite: args.suite ?? "fast",
        changedFiles: args.changed,
        tags: args.tag
      });
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: error.message, code: "AI_GAME_QA_BOOTSTRAP_ERROR" }, null, 2)}\n`);
  process.exitCode = 1;
});

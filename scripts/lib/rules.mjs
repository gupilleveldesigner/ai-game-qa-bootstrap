import { readFile } from "node:fs/promises";
import path from "node:path";
import { EXECUTION_METHODS, OUTPUT_DIR, QA_LANES, SCHEMA_VERSION } from "./constants.mjs";
import {
  assertNoSymlinkInPath,
  canonicalProjectRoot,
  pathExists,
  readJson,
  resolveInside,
  walkFiles,
  writeJsonAtomic
} from "./fs-safe.mjs";
import { validateJsonSchema } from "./json-schema.mjs";
import { qaIssueSchema, qaRuleSchema } from "./schemas.mjs";

const LANE_PREFIX = {
  tech: "TECH",
  "play-functional": "PLAY-FUNC",
  "play-experience": "PLAY-EXP",
  visual: "VIS"
};

function uniqueStrings(values = []) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function slug(value) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return normalized.slice(0, 70) || "RULE";
}

export function inferLane(issue) {
  if (QA_LANES.includes(issue.suggestedLane)) return issue.suggestedLane;
  const haystack = `${issue.title ?? ""} ${issue.summary ?? ""} ${(issue.tags ?? []).join(" ")}`.toLowerCase();
  if (/visual|render|sprite|texture|layout|overlap|contrast|readab|clipping|ui|hud|art|animation|camera/.test(haystack)) return "visual";
  if (/confus|understand|onboard|interest|boring|leave|retention|experience|first[- ]?time|hook/.test(haystack)) return "play-experience";
  if (/attack|damage|input|interaction|door|button|quest|combat|movement|functional|scenario|repro/.test(haystack)) return "play-functional";
  return "tech";
}

export function promotionEligibility(issue) {
  const severity = issue.severity ?? "low";
  const occurrences = Number(issue.occurrences ?? 1);
  if (["critical", "high"].includes(severity)) {
    return { eligible: true, reason: `${severity} severity warrants a regression rule after one confirmed occurrence.` };
  }
  if (occurrences >= 2) {
    return { eligible: true, reason: `The issue was observed ${occurrences} times.` };
  }
  if (issue.broadRisk === true) {
    return { eligible: true, reason: "The issue has broad cross-scene, cross-platform, or cross-content recurrence risk." };
  }
  if (issue.manualReviewCost === "high" && issue.oracleIsClear === true) {
    return { eligible: true, reason: "The check is expensive to repeat manually and has a clear observable oracle." };
  }
  return { eligible: false, reason: "Promote after recurrence, higher severity, broad risk, or a clear high-cost manual oracle." };
}

function chooseExecutionMethod(lane, issue) {
  if (lane === "tech") return "deterministic";
  if (lane === "play-functional") return "scripted-runtime";
  if (lane === "play-experience") return "blind-play-agent";
  if (lane === "visual") {
    const haystack = `${issue.title ?? ""} ${issue.summary ?? ""}`.toLowerCase();
    return /overflow|bounds|dimension|missing|wrong id|identity|pixel|resolution/.test(haystack)
      ? "deterministic"
      : "vision-agent";
  }
  return "human-review";
}

function evidenceForLane(lane, issue) {
  const references = uniqueStrings(issue.evidence);
  if (lane === "tech") return { required: ["log"], references };
  if (lane === "play-functional") return { required: ["action-trace", "screenshot"], references };
  if (lane === "play-experience") return { required: ["action-trace", "human-note"], references };
  return { required: ["screenshot"], references };
}

export function buildRuleFromIssue(issue, options = {}) {
  const issueValidation = validateIssue(issue);
  if (!issueValidation.ok) throw new Error(`Invalid issue: ${issueValidation.errors.join(", ")}`);
  const eligibility = promotionEligibility(issue);
  if (!eligibility.eligible && !options.allowIneligible) {
    throw new Error(`Issue is not eligible for rule promotion: ${eligibility.reason}`);
  }
  const lane = inferLane(issue);
  const issueToken = slug(issue.id ?? issue.title ?? "RULE");
  const id = `${LANE_PREFIX[lane]}-${issueToken}`.slice(0, 120);
  const tags = uniqueStrings(issue.tags).map((tag) => tag.toLowerCase());
  const files = uniqueStrings(issue.affectedFiles).map((file) => file.replaceAll("\\", "/"));
  const executionMethod = options.executionMethod ?? chooseExecutionMethod(lane, issue);
  if (!EXECUTION_METHODS.includes(executionMethod)) throw new Error(`Unsupported execution method: ${executionMethod}`);

  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    title: issue.title,
    lane,
    executionMethod,
    enabled: true,
    severity: issue.severity,
    origin: {
      issueId: issue.id,
      promotionReason: eligibility.reason
    },
    trigger: {
      filePatterns: files,
      tags,
      dependencyTags: [],
      always: files.length === 0 && tags.length === 0
    },
    cadence: issue.severity === "critical"
      ? ["fast", "on-change", "nightly", "release"]
      : ["on-change", "nightly", "release"],
    cost: issue.manualReviewCost === "high" ? "high" : lane === "tech" ? "low" : "medium",
    oracle: {
      expected: issue.expected,
      failureCondition: issue.actual
    },
    evidence: evidenceForLane(lane, issue),
    createdAt: options.now ?? new Date().toISOString()
  };
}

export function validateRule(rule) {
  return validateJsonSchema(rule, qaRuleSchema);
}

export function validateIssue(issue) {
  return validateJsonSchema(issue, qaIssueSchema);
}

export async function promoteIssue(inputRoot, issue, options = {}) {
  const root = await canonicalProjectRoot(inputRoot);
  const rule = buildRuleFromIssue(issue, options);
  const relative = `${OUTPUT_DIR}/rules/${rule.lane}/${rule.id}.json`;
  const absolute = resolveInside(root, relative);
  await assertNoSymlinkInPath(root, relative);

  const configPath = `${OUTPUT_DIR}/config.json`;
  await assertNoSymlinkInPath(root, configPath);
  if (!(await pathExists(resolveInside(root, configPath)))) {
    throw new Error("Initialize the QA environment before promoting issues.");
  }

  if (await pathExists(absolute)) {
    const existing = await readJson(absolute);
    if (JSON.stringify(existing) === JSON.stringify(rule)) {
      return { status: "unchanged", path: relative, rule };
    }
    return { status: "conflict", path: relative, rule, existing };
  }

  if (!options.write) return { status: "planned", path: relative, rule };
  await writeJsonAtomic(absolute, rule);
  return { status: "created", path: relative, rule };
}

export async function loadRules(inputRoot) {
  const root = await canonicalProjectRoot(inputRoot);
  const rulesPath = `${OUTPUT_DIR}/rules`;
  await assertNoSymlinkInPath(root, rulesPath);
  const rulesRoot = resolveInside(root, rulesPath);
  if (!(await pathExists(rulesRoot))) return [];
  const scan = await walkFiles(rulesRoot, { excludes: [], maxFiles: 10000 });
  if (scan.symlinks.length > 0) throw new Error(`Rule registry contains symbolic links: ${scan.symlinks.join(", ")}`);
  const rules = [];
  for (const relative of scan.files.filter((file) => file.endsWith(".json")).sort()) {
    const absolute = path.join(rulesRoot, relative);
    const rule = JSON.parse(await readFile(absolute, "utf8"));
    const validation = validateRule(rule);
    if (!validation.ok) {
      throw new Error(`Invalid rule ${relative}: ${validation.errors.join(", ")}`);
    }
    rules.push(rule);
  }
  return rules;
}

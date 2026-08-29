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
  const errors = [];
  if (rule?.schemaVersion !== SCHEMA_VERSION) errors.push("schemaVersion must be 1");
  if (!/^[A-Z0-9][A-Z0-9-]{2,119}$/.test(rule?.id ?? "")) errors.push("id is invalid");
  if (!QA_LANES.includes(rule?.lane)) errors.push("lane is invalid");
  if (!EXECUTION_METHODS.includes(rule?.executionMethod)) errors.push("executionMethod is invalid");
  if (typeof rule?.title !== "string" || !rule.title.trim()) errors.push("title is required");
  if (!Array.isArray(rule?.cadence) || rule.cadence.length === 0) errors.push("cadence is required");
  if (typeof rule?.oracle?.expected !== "string" || !rule.oracle.expected.trim()) errors.push("oracle.expected is required");
  if (typeof rule?.oracle?.failureCondition !== "string" || !rule.oracle.failureCondition.trim()) errors.push("oracle.failureCondition is required");
  return { ok: errors.length === 0, errors };
}

export async function promoteIssue(inputRoot, issue, options = {}) {
  const root = await canonicalProjectRoot(inputRoot);
  const rule = buildRuleFromIssue(issue, options);
  const relative = `${OUTPUT_DIR}/rules/${rule.lane}/${rule.id}.json`;
  const absolute = resolveInside(root, relative);
  await assertNoSymlinkInPath(root, relative);

  if (!(await pathExists(resolveInside(root, `${OUTPUT_DIR}/config.json`)))) {
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
  const rulesRoot = resolveInside(root, `${OUTPUT_DIR}/rules`);
  if (!(await pathExists(rulesRoot))) return [];
  const scan = await walkFiles(rulesRoot, { excludes: [], maxFiles: 10000 });
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

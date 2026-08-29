export const qaIssueSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://example.invalid/ai-game-qa/qa-issue.schema.json",
  title: "AI Game QA Issue",
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "summary", "severity", "occurrences", "expected", "actual"],
  properties: {
    id: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$" },
    title: { type: "string", minLength: 1, maxLength: 200 },
    summary: { type: "string", minLength: 1, maxLength: 4000 },
    severity: { enum: ["critical", "high", "medium", "low"] },
    occurrences: { type: "integer", minimum: 1, maximum: 100000 },
    expected: { type: "string", minLength: 1, maxLength: 4000 },
    actual: { type: "string", minLength: 1, maxLength: 4000 },
    suggestedLane: { enum: ["tech", "play-functional", "play-experience", "visual"] },
    tags: { type: "array", maxItems: 50, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 80 } },
    affectedFiles: { type: "array", maxItems: 200, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 500 } },
    evidence: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 500 } },
    broadRisk: { type: "boolean" },
    manualReviewCost: { enum: ["low", "medium", "high"] },
    oracleIsClear: { type: "boolean" }
  }
};

export const qaRuleSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://example.invalid/ai-game-qa/qa-rule.schema.json",
  title: "AI Game QA Rule",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "id", "title", "lane", "executionMethod", "enabled", "severity",
    "origin", "trigger", "cadence", "cost", "oracle", "evidence", "createdAt"
  ],
  properties: {
    schemaVersion: { const: 1 },
    id: { type: "string", pattern: "^[A-Z0-9][A-Z0-9-]{2,119}$" },
    title: { type: "string", minLength: 1, maxLength: 200 },
    lane: { enum: ["tech", "play-functional", "play-experience", "visual"] },
    executionMethod: { enum: ["deterministic", "scripted-runtime", "vision-agent", "blind-play-agent", "human-review"] },
    enabled: { type: "boolean" },
    severity: { enum: ["critical", "high", "medium", "low"] },
    origin: {
      type: "object",
      additionalProperties: false,
      required: ["issueId", "promotionReason"],
      properties: {
        issueId: { type: "string", minLength: 1, maxLength: 80 },
        promotionReason: { type: "string", minLength: 1, maxLength: 500 }
      }
    },
    trigger: {
      type: "object",
      additionalProperties: false,
      required: ["filePatterns", "tags", "dependencyTags", "always"],
      properties: {
        filePatterns: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 500 } },
        tags: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 80 } },
        dependencyTags: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 80 } },
        always: { type: "boolean" }
      }
    },
    cadence: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      uniqueItems: true,
      items: { enum: ["fast", "on-change", "nightly", "release"] }
    },
    cost: { enum: ["low", "medium", "high"] },
    oracle: {
      type: "object",
      additionalProperties: false,
      required: ["expected", "failureCondition"],
      properties: {
        expected: { type: "string", minLength: 1, maxLength: 4000 },
        failureCondition: { type: "string", minLength: 1, maxLength: 4000 }
      }
    },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["required", "references"],
      properties: {
        required: { type: "array", maxItems: 30, uniqueItems: true, items: { enum: ["log", "screenshot", "video", "action-trace", "metric", "human-note"] } },
        references: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 500 } }
      }
    },
    createdAt: { type: "string", format: "date-time" }
  }
};

export const qaReportSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://example.invalid/ai-game-qa/qa-report.schema.json",
  title: "AI Game QA Report",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "runId", "project", "suite", "startedAt", "finishedAt", "status", "results", "limitations"],
  properties: {
    schemaVersion: { const: 1 },
    runId: { type: "string", minLength: 1, maxLength: 160 },
    project: {
      type: "object",
      additionalProperties: false,
      required: ["engine", "framework", "sourceFingerprint"],
      properties: {
        engine: { type: "string", minLength: 1, maxLength: 80 },
        framework: { type: ["string", "null"], maxLength: 80 },
        sourceFingerprint: { type: "string", pattern: "^[a-f0-9]{64}$" }
      }
    },
    suite: { enum: ["fast", "nightly", "release", "custom"] },
    startedAt: { type: "string", format: "date-time" },
    finishedAt: { type: "string", format: "date-time" },
    status: { enum: ["passed", "failed", "blocked", "partial"] },
    results: {
      type: "array",
      maxItems: 10000,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ruleId", "lane", "status", "summary", "evidence"],
        properties: {
          ruleId: { type: "string", minLength: 1, maxLength: 120 },
          lane: { enum: ["tech", "play-functional", "play-experience", "visual"] },
          status: { enum: ["passed", "failed", "blocked", "review_required"] },
          summary: { type: "string", minLength: 1, maxLength: 4000 },
          evidence: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 500 } }
        }
      }
    },
    limitations: { type: "array", maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 1000 } }
  }
};

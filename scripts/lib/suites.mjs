function escapeRegex(character) {
  return /[|\\{}()[\]^$+?.]/.test(character) ? `\\${character}` : character;
}

export function globToRegex(pattern) {
  const normalized = pattern.replaceAll("\\", "/");
  let output = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const next = normalized[index + 1];
    if (current === "*" && next === "*") {
      const after = normalized[index + 2];
      if (after === "/") {
        output += "(?:.*/)?";
        index += 2;
      } else {
        output += ".*";
        index += 1;
      }
      continue;
    }
    if (current === "*") {
      output += "[^/]*";
      continue;
    }
    if (current === "?") {
      output += "[^/]";
      continue;
    }
    output += escapeRegex(current);
  }
  output += "$";
  return new RegExp(output);
}

export function matchesGlob(filePath, pattern) {
  return globToRegex(pattern).test(filePath.replaceAll("\\", "/"));
}

function relevantToChange(rule, changedFiles, tags) {
  if (rule.trigger?.always === true) return { relevant: true, reason: "always" };
  const patterns = rule.trigger?.filePatterns ?? [];
  for (const file of changedFiles) {
    for (const pattern of patterns) {
      if (matchesGlob(file, pattern)) return { relevant: true, reason: `file:${file}` };
    }
  }
  const ruleTags = new Set([...(rule.trigger?.tags ?? []), ...(rule.trigger?.dependencyTags ?? [])].map((tag) => tag.toLowerCase()));
  for (const tag of tags) {
    if (ruleTags.has(tag.toLowerCase())) return { relevant: true, reason: `tag:${tag}` };
  }
  return { relevant: false, reason: "no_change_match" };
}

export function selectRules({ rules, suite = "fast", changedFiles = [], tags = [] }) {
  if (!new Set(["fast", "nightly", "release"]).has(suite)) throw new Error(`Unknown suite: ${suite}`);
  const selected = [];
  const excluded = [];

  for (const rule of [...rules].sort((a, b) => a.id.localeCompare(b.id))) {
    if (rule.enabled === false) {
      excluded.push({ id: rule.id, reason: "disabled" });
      continue;
    }

    if (suite === "nightly" || suite === "release") {
      selected.push({ rule, reason: `${suite}_full_suite` });
      continue;
    }

    const cadence = new Set(rule.cadence ?? []);
    if (!cadence.has("fast") && !cadence.has("on-change")) {
      excluded.push({ id: rule.id, reason: "not_in_fast_cadence" });
      continue;
    }
    if (rule.cost === "high") {
      excluded.push({ id: rule.id, reason: "high_cost" });
      continue;
    }

    const relevance = relevantToChange(rule, changedFiles, tags);
    if (!relevance.relevant) {
      excluded.push({ id: rule.id, reason: relevance.reason });
      continue;
    }
    selected.push({ rule, reason: relevance.reason });
  }

  return {
    suite,
    selected: selected.map(({ rule, reason }) => ({ id: rule.id, lane: rule.lane, executionMethod: rule.executionMethod, reason })),
    excluded,
    totals: { selected: selected.length, excluded: excluded.length }
  };
}

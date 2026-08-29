import { CAPABILITY_STATUSES, GENERATOR_NAME, OUTPUT_DIR, QA_LANES, SCHEMA_VERSION } from "./constants.mjs";
import { assertSafeRelativePath } from "./fs-safe.mjs";

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredObject(value, path, errors) {
  if (!plainObject(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  return true;
}

function requiredString(value, path, errors) {
  if (typeof value !== "string" || !value.trim()) errors.push(`${path} must be a non-empty string`);
}

function validateGenerator(generator, path, errors) {
  if (!requiredObject(generator, path, errors)) return;
  if (generator.name !== GENERATOR_NAME) errors.push(`${path}.name must be ${GENERATOR_NAME}`);
  requiredString(generator.version, `${path}.version`, errors);
}

function validateConfig(value) {
  const errors = [];
  if (!requiredObject(value, "$", errors)) return errors;
  if (value.schemaVersion !== SCHEMA_VERSION) errors.push("$.schemaVersion must be 1");
  validateGenerator(value.generator, "$.generator", errors);
  if (requiredObject(value.project, "$.project", errors)) {
    requiredString(value.project.engine, "$.project.engine", errors);
    requiredString(value.project.target, "$.project.target", errors);
    requiredString(value.project.adapterHint, "$.project.adapterHint", errors);
  }
  if (!Array.isArray(value.lanes)) errors.push("$.lanes must be an array");
  else {
    const laneIds = new Set(value.lanes.map((lane) => lane?.id));
    for (const lane of QA_LANES) if (!laneIds.has(lane)) errors.push(`$.lanes must include ${lane}`);
    for (const lane of value.lanes) if (!plainObject(lane) || typeof lane.enabled !== "boolean") errors.push("$.lanes entries require id and enabled");
  }
  if (requiredObject(value.suites, "$.suites", errors)) {
    for (const suite of ["fast", "nightly", "release"]) if (!plainObject(value.suites[suite])) errors.push(`$.suites.${suite} is required`);
  }
  if (requiredObject(value.safety, "$.safety", errors)) {
    const expected = {
      dryRunByDefault: true,
      modifyGameSource: false,
      overwriteConflicts: false,
      followSymlinks: false,
      allowGlobalInstall: false,
      allowPrivilegeEscalation: false
    };
    for (const [key, expectedValue] of Object.entries(expected)) {
      if (value.safety[key] !== expectedValue) errors.push(`$.safety.${key} must be ${expectedValue}`);
    }
  }
  return errors;
}

function validateCapabilities(value) {
  const errors = [];
  if (!requiredObject(value, "$", errors)) return errors;
  if (value.schemaVersion !== SCHEMA_VERSION) errors.push("$.schemaVersion must be 1");
  if (!requiredObject(value.project, "$.project", errors)) return errors;
  requiredString(value.project.engine, "$.project.engine", errors);
  if (requiredObject(value.lanes, "$.lanes", errors)) {
    for (const lane of QA_LANES) {
      const capabilities = value.lanes[lane];
      if (!requiredObject(capabilities, `$.lanes.${lane}`, errors)) continue;
      for (const [id, capability] of Object.entries(capabilities)) {
        const path = `$.lanes.${lane}.${id}`;
        if (!requiredObject(capability, path, errors)) continue;
        if (!CAPABILITY_STATUSES.includes(capability.status)) errors.push(`${path}.status is invalid`);
        requiredString(capability.reason, `${path}.reason`, errors);
        if (!Array.isArray(capability.requires) || capability.requires.some((item) => typeof item !== "string")) errors.push(`${path}.requires must be a string array`);
      }
    }
  }
  if (!requiredObject(value.claims, "$.claims", errors)) return errors;
  if (value.claims.runtimeExecuted !== false) errors.push("$.claims.runtimeExecuted must be false");
  if (value.claims.fullAutomationClaimed !== false) errors.push("$.claims.fullAutomationClaimed must be false");
  if (value.claims.setupOnlyVersion !== true) errors.push("$.claims.setupOnlyVersion must be true");
  return errors;
}

function validateProjectManifest(value) {
  const errors = [];
  if (!requiredObject(value, "$", errors)) return errors;
  if (value.schemaVersion !== SCHEMA_VERSION) errors.push("$.schemaVersion must be 1");
  if (!requiredObject(value.detection, "$.detection", errors)) return errors;
  if (value.detection?.inspection?.executedProjectCode !== false) errors.push("$.detection.inspection.executedProjectCode must be false");
  if (!requiredObject(value.sourceFingerprint, "$.sourceFingerprint", errors)) return errors;
  if (!/^[a-f0-9]{64}$/.test(value.sourceFingerprint.value ?? "")) errors.push("$.sourceFingerprint.value must be a SHA-256 hash");
  return errors;
}

function validateGeneratedManifest(value) {
  const errors = [];
  if (!requiredObject(value, "$", errors)) return errors;
  if (value.schemaVersion !== SCHEMA_VERSION) errors.push("$.schemaVersion must be 1");
  validateGenerator(value.generator, "$.generator", errors);
  if (requiredObject(value.files, "$.files", errors)) {
    for (const [relative, record] of Object.entries(value.files)) {
      try {
        assertSafeRelativePath(relative);
        if (!relative.startsWith(`${OUTPUT_DIR}/`)) errors.push(`$.files key is outside ${OUTPUT_DIR}: ${relative}`);
      } catch (error) {
        errors.push(`$.files has an unsafe path: ${error.message}`);
      }
      if (!plainObject(record) || !/^[a-f0-9]{64}$/.test(record.sha256 ?? "")) errors.push(`$.files[${JSON.stringify(relative)}].sha256 is invalid`);
    }
  }
  if (!Array.isArray(value.conflicts) || value.conflicts.some((item) => typeof item !== "string")) errors.push("$.conflicts must be a string array");
  return errors;
}

function validateSuite(value, expectedId) {
  const errors = [];
  if (!requiredObject(value, "$", errors)) return errors;
  if (value.schemaVersion !== SCHEMA_VERSION) errors.push("$.schemaVersion must be 1");
  if (value.id !== expectedId) errors.push(`$.id must be ${expectedId}`);
  requiredString(value.selection, "$.selection", errors);
  requiredString(value.purpose, "$.purpose", errors);
  return errors;
}

export function validateGeneratedJson(relativePath, value) {
  if (relativePath === `${OUTPUT_DIR}/config.json`) return validateConfig(value);
  if (relativePath === `${OUTPUT_DIR}/capabilities.json`) return validateCapabilities(value);
  if (relativePath === `${OUTPUT_DIR}/project-manifest.json`) return validateProjectManifest(value);
  if (relativePath === `${OUTPUT_DIR}/generated-manifest.json`) return validateGeneratedManifest(value);
  const suite = /^\.ai-game-qa\/suites\/(fast|nightly|release)\.json$/.exec(relativePath)?.[1];
  if (suite) return validateSuite(value, suite);
  return [];
}

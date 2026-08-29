import { CAPABILITY_STATUSES, QA_LANES } from "./constants.mjs";

function capability(status, reason, requires = []) {
  if (!CAPABILITY_STATUSES.includes(status)) throw new Error(`Unknown capability status: ${status}`);
  return { status, reason, requires };
}

export function buildCapabilityMatrix(detection) {
  const engine = detection.primary.engine;
  const adapter = detection.primary.adapterHint;
  const isWeb = adapter === "web";
  const isLove = engine === "love2d";
  const knownNative = ["unity", "unreal", "godot", "defold", "gamemaker", "renpy", "bevy", "monogame"].includes(engine);

  const lanes = {
    tech: {
      projectInspection: capability("supported", "Read-only engine and project-structure inspection is built in."),
      staticChecks: capability("supported", "Rules and deterministic project checks can be registered without a runtime adapter."),
      buildVerification: detection.primary.build
        ? capability("project_input_required", "A build script was detected but is never executed during inspection.", ["explicit user-approved build execution"])
        : capability("manual", "No portable build command was detected.", ["project build contract"]),
      runtimeLogs: isWeb || isLove || knownNative
        ? capability("adapter_required", `A ${adapter} runtime adapter must be installed and configured.`)
        : capability("manual", "Runtime logging requires a project-specific adapter.")
    },
    "play-functional": {
      scenarioContracts: capability("supported", "Functional scenarios and expected outcomes can be registered."),
      automatedInput: isWeb || isLove
        ? capability("adapter_required", `Install a ${adapter} control adapter before running inputs.`)
        : capability("manual", "Functional play remains manual until an input adapter is provided."),
      stateAssertions: capability("project_input_required", "The project must define observable outcomes instead of exposing unrestricted internals.", ["game-specific oracle"])
    },
    "play-experience": {
      blindProtocol: capability("supported", "Blind-play instructions, evidence rules, and report contracts can be scaffolded."),
      visualControl: isWeb || isLove
        ? capability("adapter_required", `Install a ${adapter} screenshot/input adapter for agent play.`)
        : capability("manual", "Experience play can be human-run with evidence capture until an adapter exists."),
      interpretation: capability("project_input_required", "Experience findings require a declared test question and human ownership of design decisions.", ["test brief"])
    },
    visual: {
      visualContracts: capability("supported", "Scene, identity, layout, and readability contracts can be registered."),
      screenshotCapture: isWeb || isLove || knownNative
        ? capability("adapter_required", `Install a ${adapter} capture adapter before automated screenshots.`)
        : capability("manual", "Screenshots must be supplied manually until a capture adapter exists."),
      multiViewport: isWeb
        ? capability("adapter_required", "A browser adapter can provide deterministic viewport coverage.")
        : capability("manual", "Viewport coverage is project/platform specific."),
      semanticReview: capability("project_input_required", "Semantic visual QA needs explicit visual intent and approved references.", ["visual contract", "approved references"])
    }
  };

  for (const lane of QA_LANES) {
    if (!lanes[lane]) throw new Error(`Capability matrix omitted lane ${lane}`);
  }

  return {
    schemaVersion: 1,
    project: {
      engine,
      framework: detection.primary.framework ?? null,
      target: detection.primary.target,
      adapterHint: adapter
    },
    lanes,
    claims: {
      runtimeExecuted: false,
      fullAutomationClaimed: false,
      setupOnlyVersion: true
    }
  };
}

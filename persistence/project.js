/**
 * Project save / load.
 *
 * A project is a JSON document describing the current audio graph: which
 * effects are in the chain, in what order, with what per-effect params,
 * and how they are connected. The format is forward-compatible:
 *
 *   {
 *     "format": "audiofx.project",
 *     "formatVersion": 1,
 *     "schema": 1,
 *     "name": "Vocal warmth",
 *     "createdAt": "2026-06-03T...",
 *     "updatedAt": "2026-06-03T...",
 *     "graph": {
 *       "nodes": [
 *         { "id": "fx-input-mic-1", "type": "input-mic@1.0.0", "params": {...} },
 *         ...
 *       ],
 *       "connections": [
 *         { "from": "fx-input-mic-1", "to": "fx-distortion-1" },
 *         ...
 *       ]
 *     }
 *   }
 *
 * - `format` is a magic string used for file-type detection.
 * - `formatVersion` is the on-disk version; bump on any breaking change.
 * - `schema` is the loader's understanding; reject if formatVersion > schema.
 * - `nodes[i].type` is `<manifest.id>@<manifest.version>`; the loader
 *   uses the registry to resolve the class.
 * - Unknown `type` values are logged and skipped (degraded but not crashed).
 *
 * Migrations: the loader looks for `migrations/v{schema}_to_v{N}.js`
 * transform functions; a future Phase 2c.2 can add them when the
 * format needs to evolve.
 */

export const PROJECT_FORMAT = "audiofx.project";
export const PROJECT_SCHEMA = 1;
export const PROJECT_FORMAT_VERSION = 1;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Validate a project document. Throws with a descriptive message on the
 * first violation. Returns the (unchanged) document on success.
 */
export function validateProject(doc) {
  if (!isPlainObject(doc)) {
    throw new Error("Project must be an object");
  }
  if (doc.format !== PROJECT_FORMAT) {
    throw new Error(`Unknown project format: '${doc.format}'. Expected '${PROJECT_FORMAT}'.`);
  }
  if (typeof doc.formatVersion !== "number") {
    throw new Error("Project.formatVersion is required and must be a number");
  }
  if (doc.formatVersion > PROJECT_SCHEMA) {
    throw new Error(
      `Project was saved with formatVersion ${doc.formatVersion}, but this ` +
        `loader only understands up to ${PROJECT_SCHEMA}.`
    );
  }
  if (!isPlainObject(doc.graph)) {
    throw new Error("Project.graph must be an object");
  }
  if (!Array.isArray(doc.graph.nodes)) {
    throw new Error("Project.graph.nodes must be an array");
  }
  if (!Array.isArray(doc.graph.connections)) {
    throw new Error("Project.graph.connections must be an array");
  }
  for (const [i, node] of doc.graph.nodes.entries()) {
    if (typeof node.id !== "string") {
      throw new Error(`nodes[${i}].id must be a string`);
    }
    if (typeof node.type !== "string") {
      throw new Error(`nodes[${i}].type must be a string`);
    }
  }
  return doc;
}

/**
 * Serialize a manager's effect chain into a project document.
 * Connections are inferred from the chain order (each effect's output
 * feeds the next effect's input, and the last effect's output feeds
 * `audioContext.destination`).
 *
 * @param {object} manager - an EffectChainManager.
 * @param {object} [options]
 * @param {string} [options.name]
 * @returns {object} the project document (also JSON-safe).
 */
export function serializeProject(manager, options = {}) {
  const now = new Date().toISOString();
  const nodes = manager.effectChain.map((entry) => {
    const manifestId = entry.manifestId ?? null;
    const audioNode = entry.audioNode;
    const version = audioNode?.constructor?.manifest?.version ?? "0.0.0";
    return {
      id: entry.id,
      type: manifestId ? `${manifestId}@${version}` : entry.name,
      params: typeof audioNode?.getConfig === "function" ? audioNode.getConfig() : {},
    };
  });

  const connections = [];
  for (let i = 0; i < manager.effectChain.length - 1; i++) {
    connections.push({
      from: manager.effectChain[i].id,
      to: manager.effectChain[i + 1].id,
    });
  }

  return {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    schema: PROJECT_SCHEMA,
    name: options.name ?? "Untitled",
    createdAt: options.createdAt ?? now,
    updatedAt: now,
    graph: { nodes, connections },
  };
}

/**
 * Restore a project into a (possibly empty) manager.
 *
 * Nodes are added in chain order, then `applyConfig` is called with
 * the saved params. Connections are inferred from order; the manager
 * will rebuild the audio graph accordingly. Unknown effect types are
 * logged and skipped (the project is still loaded with the rest of
 * the chain intact).
 *
 * @param {object} project - a validated project document.
 * @param {object} manager - an EffectChainManager created with a registry.
 * @returns {Promise<{skipped: string[]}>} a list of skipped node ids.
 */
export async function deserializeProject(project, manager) {
  validateProject(project);
  if (!manager.registry) {
    throw new Error("deserializeProject requires the manager to have a registry");
  }
  const registry = manager.registry;
  const skipped = [];

  // First, ensure the container is empty (caller's responsibility to call
  // manager.clear() if needed). We assume we are appending to a clean
  // chain. Skip this assertion — it would force too much coupling.

  for (const node of project.graph.nodes) {
    const [manifestId, version] = node.type.split("@");
    const entry = registry.get(manifestId);
    if (!entry) {
      console.warn(`deserializeProject: unknown effect type '${node.type}' (node '${node.id}') — skipping`);
      skipped.push(node.id);
      continue;
    }
    if (entry.manifest.version !== version) {
      // For now: warn but still load. A future migration layer would
      // either translate the params or refuse to load.
      console.warn(
        `deserializeProject: version mismatch for '${manifestId}': ` +
          `project has ${version}, registry has ${entry.manifest.version}`
      );
    }
    try {
      await manager.addEffect(manifestId, { params: node.params });
    } catch (err) {
      console.error(`deserializeProject: failed to add '${manifestId}':`, err);
      skipped.push(node.id);
    }
  }
  return { skipped };
}

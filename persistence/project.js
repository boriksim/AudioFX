/**
 * Project save / load.
 *
 * A project is a JSON document describing the current audio graph:
 * which nodes are in the patch, where they sit, how they are connected,
 * and with what per-node params. The format is forward-compatible:
 *
 *   {
 *     "format": "audiofx.project",
 *     "formatVersion": 2,
 *     "schema": 2,
 *     "name": "Vocal warmth",
 *     "createdAt": "2026-06-03T...",
 *     "updatedAt": "2026-06-03T...",
 *     "graph": {
 *       "nodes": [
 *         {
 *           "id": "fx-input-mic-1",
 *           "type": "input-mic@1.0.0",
 *           "params": {...},
 *           "position": { "x": 40, "y": 80 }   // optional in v2
 *         }
 *       ],
 *       "connections": [
 *         { "from": "fx-input-mic-1", "to": "fx-distortion-1",
 *           "fromPort": "out", "toPort": "in" }  // ports optional in v2
 *       ]
 *     }
 *   }
 *
 * v1 -> v2 migration: nodes get a default `position: {x: 0, y: i*120}`
 * (vertical column layout), and connections get default
 * `fromPort: "out", toPort: "in"`. The migration is automatic on load.
 *
 * - `format` is a magic string used for file-type detection.
 * - `formatVersion` is the on-disk version; bump on any breaking change.
 * - `schema` is the loader's understanding; reject if formatVersion > schema.
 * - `nodes[i].type` is `<manifest.id>@<manifest.version>`; the loader
 *   uses the registry to resolve the class.
 * - Unknown `type` values are logged and skipped (degraded but not crashed).
 */

export const PROJECT_FORMAT = "audiofx.project";
export const PROJECT_SCHEMA = 2;
export const PROJECT_FORMAT_VERSION = 2;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Apply all pending migrations to bring a project document up to
 * the current schema. Migrations are pure transforms; they should
 * never throw. Unknown migrations are logged and skipped.
 */
export function migrateProject(doc) {
  while (doc.formatVersion < PROJECT_SCHEMA) {
    const from = doc.formatVersion;
    const to = from + 1;
    const fn = MIGRATIONS[`v${from}_to_v${to}`];
    if (!fn) {
      console.warn(`migrateProject: no migration from v${from} to v${to}; leaving as-is`);
      break;
    }
    doc = fn(doc);
    doc.formatVersion = to;
    doc.schema = to;
  }
  return doc;
}

/**
 * v1 -> v2: nodes get a vertical-column default position; connections
 * get default port ids. The linear chain order is preserved.
 */
function migrateV1ToV2(doc) {
  const COLUMN_X = 0;
  const ROW_HEIGHT = 120;
  const next = { ...doc, graph: { ...doc.graph } };
  next.graph.nodes = doc.graph.nodes.map((n, i) => ({
    ...n,
    position: n.position ?? { x: COLUMN_X, y: i * ROW_HEIGHT },
  }));
  next.graph.connections = doc.graph.connections.map((c) => ({
    ...c,
    fromPort: c.fromPort ?? "out",
    toPort: c.toPort ?? "in",
  }));
  return next;
}

const MIGRATIONS = {
  v1_to_v2: migrateV1ToV2,
};

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
 * Serialize a manager's effect chain into a project document. Saves
 * explicit connections (with port ids), per-node params, and
 * per-node position. Chain-order connections are not stored
 * separately — they are derived from the chain order at load time.
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
    const out = {
      id: entry.id,
      type: manifestId ? `${manifestId}@${version}` : entry.name,
      params: typeof audioNode?.getConfig === "function" ? audioNode.getConfig() : {},
    };
    if (entry.position) out.position = entry.position;
    return out;
  });

  // Only persist NON-chain-order explicit connections; the chain
  // order is reconstructed at load time. (Chain-order connections
  // would just be {from: chain[i].id, to: chain[i+1].id, out, in}.)
  const chainConnSet = new Set();
  for (let i = 0; i < manager.effectChain.length - 1; i++) {
    const a = manager.effectChain[i].id;
    const b = manager.effectChain[i + 1].id;
    chainConnSet.add(`${a}|out|${b}|in`);
  }
  const connections = (manager.connections ?? []).filter((c) => {
    return !chainConnSet.has(`${c.from}|${c.fromPort}|${c.to}|${c.toPort}`);
  });

  return {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    schema: PROJECT_SCHEMA,
    name: options.name ?? "Untitled",
    createdAt: options.createdAt ?? now,
    updatedAt: now,
    graph: { nodes, connections },
    breaks: manager.getChainBreaks ? manager.getChainBreaks() : [],
    masterOutputIds: manager.getMasterOutput ? Array.from(manager.getMasterOutput()) : [],
  };
}

/**
 * Restore a project into a (possibly empty) manager. Runs migrations
 * first so a v1 project loads cleanly into a v2-aware runtime.
 *
 * @param {object} project - a validated project document.
 * @param {object} manager - an EffectChainManager created with a registry.
 * @returns {Promise<{skipped: string[]}>} a list of skipped node ids.
 */
export async function deserializeProject(project, manager) {
  validateProject(project);
  // Run any pending migrations BEFORE consuming the doc. We do this
  // on a clone so callers that reuse the parsed object aren't surprised.
  const migrated = migrateProject({ ...project, graph: { ...project.graph, nodes: [...project.graph.nodes], connections: [...project.graph.connections] } });
  if (!manager.registry) {
    throw new Error("deserializeProject requires the manager to have a registry");
  }
  const registry = manager.registry;
  const skipped = [];

  for (const node of migrated.graph.nodes) {
    const [manifestId, version] = node.type.split("@");
    const entry = registry.get(manifestId);
    if (!entry) {
      console.warn(`deserializeProject: unknown effect type '${node.type}' (node '${node.id}') — skipping`);
      skipped.push(node.id);
      continue;
    }
    if (entry.manifest.version !== version) {
      console.warn(
        `deserializeProject: version mismatch for '${manifestId}': ` +
          `project has ${version}, registry has ${entry.manifest.version}`
      );
    }
    try {
      await manager.addEffect(manifestId, {
        params: node.params,
        position: node.position ?? null,
      });
    } catch (err) {
      console.error(`deserializeProject: failed to add '${manifestId}':`, err);
      skipped.push(node.id);
    }
  }

  // Re-apply explicit connections (chain-order ones are auto-managed).
  for (const c of migrated.graph.connections) {
    try {
      manager.connect(c.from, c.to, { fromPort: c.fromPort, toPort: c.toPort });
    } catch (err) {
      console.warn(`deserializeProject: failed to wire ${c.from} -> ${c.to}:`, err);
    }
  }

  // Re-apply chain-order breaks. We do this AFTER explicit
  // connections so a saved project that breaks a chain-order pair
  // AND has an explicit re-connection between the same pair ends
  // up with the explicit connection in effect (the break stays
  // dormant — it would be cleaned up by removeEffect anyway).
  if (Array.isArray(migrated.breaks)) {
    for (const key of migrated.breaks) {
      if (typeof key !== "string") continue;
      const [fromId, toId] = key.split("|");
      if (!fromId || !toId) continue;
      try {
        manager.breakChain(fromId, toId);
      } catch (err) {
        console.warn(`deserializeProject: failed to break chain ${fromId}|${toId}:`, err);
      }
    }
  }

  // Re-apply master output ids. Has effect only when
  // `useMasterOutput` is true on the manager.
  if (Array.isArray(migrated.masterOutputIds)) {
    for (const id of migrated.masterOutputIds) {
      if (typeof id !== "string") continue;
      try {
        manager.setMasterOutput(id);
      } catch (err) {
        console.warn(`deserializeProject: failed to set master output '${id}':`, err);
      }
    }
  }

  return { skipped };
}

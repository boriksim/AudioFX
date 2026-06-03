import { describe, it, expect, beforeEach } from "vitest";
import { PluginRegistry } from "../../core/PluginRegistry.js";

class Alpha {
  static manifest = { id: "alpha", name: "Alpha", version: "1.0.0", category: "test" };
  init() {}
}

class Beta {
  static manifest = { id: "beta", name: "Beta", version: "2.3.4", category: "test" };
}

class NoManifest {}

class NoVersion {
  static manifest = { id: "no-version", name: "NoVersion" };
}

class NoId {
  static manifest = { name: "NoId", version: "1.0.0" };
}

describe("PluginRegistry", () => {
  let registry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it("register() stores a class by its manifest.id", () => {
    registry.register(Alpha);
    expect(registry.has("alpha")).toBe(true);
    expect(registry.get("alpha").EffectClass).toBe(Alpha);
  });

  it("register() is chainable", () => {
    const result = registry.register(Alpha);
    expect(result).toBe(registry);
  });

  it("get() returns undefined for unknown ids", () => {
    expect(registry.get("nope")).toBeUndefined();
  });

  it("list() returns an array of manifests", () => {
    registry.register(Alpha).register(Beta);
    const manifests = registry.list();
    expect(manifests).toHaveLength(2);
    expect(manifests.map((m) => m.id).sort()).toEqual(["alpha", "beta"]);
  });

  it("register() throws if the class has no manifest", () => {
    expect(() => registry.register(NoManifest)).toThrow(/no static manifest/);
  });

  it("register() throws if the manifest has no id", () => {
    expect(() => registry.register(NoId)).toThrow(/manifest.id is required/);
  });

  it("register() throws if the manifest has no version", () => {
    expect(() => registry.register(NoVersion)).toThrow(/manifest.version is required/);
  });

  it("register() throws if given a non-class", () => {
    expect(() => registry.register({})).toThrow(/expects a class/);
    expect(() => registry.register(null)).toThrow(/expects a class/);
  });

  it("instantiate() constructs the class with the right args", () => {
    registry.register(Alpha);
    const ctx = { dummy: true };
    const dom = document.createElement("div");
    const instance = registry.instantiate("alpha", ctx, dom);
    expect(instance).toBeInstanceOf(Alpha);
  });

  it("instantiate() throws for an unknown id", () => {
    expect(() => registry.instantiate("nope", {})).toThrow(/Unknown effect: 'nope'/);
  });

  describe("loadFromModule()", () => {
    it("dynamic-imports a module and registers the class matching the id", async () => {
      // Use a data: URL that exports a class with a matching manifest.
      const dataUrl =
        "data:text/javascript;base64," +
        btoa(`
          export class TestLoaded {
            static manifest = { id: "loaded", name: "Loaded", version: "9.9.9" };
          }
        `);
      const entry = await registry.loadFromModule("loaded", dataUrl);
      expect(entry.EffectClass.name).toBe("TestLoaded");
      expect(registry.has("loaded")).toBe(true);
    });

    it("throws if the module has no class with the requested id", async () => {
      const dataUrl =
        "data:text/javascript;base64," +
        btoa(`export const unrelated = 42;`);
      await expect(registry.loadFromModule("missing", dataUrl)).rejects.toThrow(
        /No class with manifest.id === 'missing'/
      );
    });

    it("returns the already-registered entry without re-importing", async () => {
      registry.register(Alpha);
      const entry = await registry.loadFromModule("alpha", "data:text/javascript,ignored");
      expect(entry.EffectClass).toBe(Alpha);
    });
  });
});

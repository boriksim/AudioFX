import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { exportProject, importProjectFile } from "../../persistence/importExport.js";

function makeValidProject(name = "Test") {
  return {
    format: "audiofx.project",
    formatVersion: 1,
    schema: 1,
    name,
    createdAt: "2026-06-03T00:00:00.000Z",
    updatedAt: "2026-06-03T00:00:00.000Z",
    graph: { nodes: [], connections: [] },
  };
}

class FakeFile {
  constructor(text) {
    this._text = text;
  }
  get text() {
    return () => Promise.resolve(this._text);
  }
}

describe("exportProject", () => {
  let originalCreateObjectURL, originalRevoke, createSpy, revokeSpy, clickSpy;

  beforeEach(() => {
    document.body.innerHTML = "";
    originalCreateObjectURL = URL.createObjectURL;
    originalRevoke = URL.revokeObjectURL;
    createSpy = vi.fn(() => "blob:fake-url");
    revokeSpy = vi.fn();
    URL.createObjectURL = createSpy;
    URL.revokeObjectURL = revokeSpy;
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevoke;
    clickSpy.mockRestore();
  });

  it("builds a Blob, creates a URL, and triggers a download click", () => {
    const project = makeValidProject("My Patch");
    exportProject(project);
    expect(createSpy).toHaveBeenCalledTimes(1);
    const blob = createSpy.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/json");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("uses the project name (sanitized) as the download filename", () => {
    const project = makeValidProject("My Cool Patch!");
    exportProject(project);
    const anchor = clickSpy.mock.instances[0];
    expect(anchor.download).toBe("My_Cool_Patch_.audiofx.json");
  });

  it("accepts a custom filename and sanitizes it", () => {
    exportProject(makeValidProject(), "vocal/warmth 1");
    const anchor = clickSpy.mock.instances[0];
    expect(anchor.download).toBe("vocal_warmth_1.audiofx.json");
  });

  it("falls back to 'project' when the name is empty after sanitization", () => {
    exportProject(makeValidProject("????"));
    const anchor = clickSpy.mock.instances[0];
    expect(anchor.download).toBe("project.audiofx.json");
  });

  it("revokes the object URL on the next tick", () => {
    return new Promise((resolve) => {
      exportProject(makeValidProject("X"));
      expect(revokeSpy).not.toHaveBeenCalled();
      setTimeout(() => {
        expect(revokeSpy).toHaveBeenCalledWith("blob:fake-url");
        resolve();
      }, 5);
    });
  });

  it("throws on an invalid project (does not produce a download)", () => {
    expect(() => exportProject({ format: "wrong" })).toThrow();
    expect(clickSpy).not.toHaveBeenCalled();
  });
});

describe("importProjectFile", () => {
  it("parses and validates a JSON file", async () => {
    const project = makeValidProject("Hello");
    const file = new FakeFile(JSON.stringify(project));
    const result = await importProjectFile(file);
    expect(result).toEqual(project);
  });

  it("rejects non-JSON content with a descriptive error", async () => {
    const file = new FakeFile("not json at all");
    await expect(importProjectFile(file)).rejects.toThrow(/not valid JSON/);
  });

  it("rejects JSON of the wrong shape", async () => {
    const file = new FakeFile(JSON.stringify({ format: "wrong" }));
    await expect(importProjectFile(file)).rejects.toThrow();
  });

  it("rejects a missing/invalid File argument", async () => {
    await expect(importProjectFile(null)).rejects.toThrow(/requires a File/);
    await expect(importProjectFile({})).rejects.toThrow(/requires a File/);
  });
});

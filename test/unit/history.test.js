import { describe, it, expect, beforeEach, vi } from "vitest";
import { HistoryController } from "../../persistence/history.js";

describe("HistoryController", () => {
  let state, snapshot, apply, history;

  beforeEach(() => {
    state = { value: 0 };
    snapshot = () => JSON.parse(JSON.stringify(state));
    apply = vi.fn((s) => {
      state.value = s.value;
    });
    history = new HistoryController({ snapshot, apply, debounceMs: 10, maxSize: 3 });
  });

  it("starts with the initial state already captured (canUndo=false because there's nothing older)", () => {
    // captureInitial: true (the default) takes a snapshot of the
    // current state at construction. canUndo is still false because
    // undo needs at least 2 entries (the current state and an older one).
    expect(history.state()).toEqual({ canUndo: false, canRedo: false, undoDepth: 1, redoDepth: 0 });
  });

  it("push() schedules a debounced commit; canUndo becomes true after commit", () => {
    expect(history.state().canUndo).toBe(false);
    history.push();
    expect(history.state().undoDepth).toBe(1); // initial + 1 pending, but pending not yet committed
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(history.state().undoDepth).toBe(2);
        expect(history.state().canUndo).toBe(true);
        resolve();
      }, 20);
    });
  });

  it("rapid pushes coalesce into one entry (only the final snapshot is kept)", () => {
    return new Promise((resolve) => {
      // Three pushes inside one debounce window (debounceMs=10). The
      // pending snapshot is overwritten each time, so only the final
      // state (=3) ends up in the stack.
      state.value = 1;
      history.push();
      state.value = 2;
      history.push();
      state.value = 3;
      history.push();
      setTimeout(() => {
        // initial (s0) + coalesced post-mutation (s3) = 2 entries.
        expect(history.state().undoDepth).toBe(2);
        history.undo();
        // After undo, we restore s1 (the snapshot just before s3).
        // Wait — the snapshot at push time IS s3, so undo restores s3
        // to state? No, the snapshot pushed in this test sequence
        // captures s3. So undo restores state to s3? But state is
        // already s3. Hmm, let me re-think.
        // Actually the snapshots in the stack are: [s0, s3]. Top is s3.
        // undo: pop s3, restore s3 → state is 3, not 0.
        // The initial state (s0) is one more undo away.
        history.undo();
        expect(state.value).toBe(0);
        resolve();
      }, 20);
    });
  });

  it("undo() restores the previous snapshot and pushes the current onto redo", () => {
    return new Promise((resolve) => {
      // Each commit is spaced > debounceMs apart so we get two entries.
      state.value = 1;
      history.push();
      setTimeout(() => {
        state.value = 2;
        history.push();
        setTimeout(() => {
          // undoStack = [s0, s1, s2]
          expect(history.state().canUndo).toBe(true);
          history.undo();
          // Pop s2, restore s1. State is 1.
          expect(state.value).toBe(1);
          expect(history.state().canRedo).toBe(true);
          history.undo();
          // Pop s1, restore s0. State is 0.
          expect(state.value).toBe(0);
          expect(history.state().canUndo).toBe(false);
          resolve();
        }, 20);
      }, 20);
    });
  });

  it("redo() reverses an undo", () => {
    return new Promise((resolve) => {
      state.value = 1;
      history.push();
      setTimeout(() => {
        state.value = 2;
        history.push();
        setTimeout(() => {
          history.undo(); // s1
          history.undo(); // s0
          expect(state.value).toBe(0);
          history.redo(); // s1
          expect(state.value).toBe(1);
          history.redo(); // s2
          expect(state.value).toBe(2);
          resolve();
        }, 20);
      }, 20);
    });
  });

  it("a new push after undo clears the redo stack", () => {
    return new Promise((resolve) => {
      state.value = 1;
      history.push();
      setTimeout(() => {
        history.undo();
        expect(history.state().canRedo).toBe(true);
        state.value = 5;
        history.push();
        setTimeout(() => {
          expect(history.state().canRedo).toBe(false);
          resolve();
        }, 20);
      }, 20);
    });
  });

  it("maxSize caps the undo stack (oldest entries are dropped)", () => {
    return new Promise((resolve) => {
      const h = new HistoryController({ snapshot, apply, debounceMs: 1, maxSize: 2 });
      let n = 0;
      const tick = () => {
        n++;
        state.value = n;
        h.push();
        if (n < 5) setTimeout(tick, 5);
        else {
          setTimeout(() => {
            // initial s0 + 4 commits (after 5 pushes the last 2 are kept, but
            // we also have the initial capture).
            // undoStack = [s0, s4, s5] (last two wins). But maxSize=2 means
            // [s4, s5] after 5 pushes... wait, initial s0 is also there.
            // Actually with maxSize=2 the total is capped to 2, so we drop s0.
            // The last 2 entries (s4, s5) are kept.
            expect(h.state().undoDepth).toBe(2);
            resolve();
          }, 10);
        }
      };
      tick();
    });
  });

  it("flush() commits a pending snapshot immediately", () => {
    history.push();
    history.flush();
    // initial + the just-committed push = 2 entries.
    expect(history.state().undoDepth).toBe(2);
  });

  it("undo() returns false when there is nothing to undo", () => {
    // With captureInitial there is always one entry. Undo all the way
    // to the bottom first.
    history.undo();
    expect(history.undo()).toBe(false);
  });

  it("redo() returns false when there is nothing to redo", () => {
    expect(history.redo()).toBe(false);
  });

  it("subscribe() notifies listeners on every state change", () => {
    const fn = vi.fn();
    history.subscribe(fn);
    history.push();
    history.flush();
    expect(fn).toHaveBeenCalled();
  });

  it("clear() empties both stacks and discards pending snapshots", () => {
    history.push();
    history.flush();
    history.undo();
    history.clear();
    expect(history.state()).toEqual({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
  });

  it("captureInitial: false skips the constructor snapshot", () => {
    const h = new HistoryController({ snapshot, apply, debounceMs: 10, captureInitial: false });
    expect(h.state().undoDepth).toBe(0);
  });

  it("shouldCommit filter can skip a push", () => {
    return new Promise((resolve) => {
      const h = new HistoryController({
        snapshot,
        apply,
        debounceMs: 1,
        shouldCommit: () => false,
      });
      h.push();
      setTimeout(() => {
        expect(h.state().undoDepth).toBe(0);
        resolve();
      }, 10);
    });
  });
});

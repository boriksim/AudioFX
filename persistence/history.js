/**
 * Snapshot-based undo/redo with debounced commits.
 *
 * Why snapshots and not a diff log? Because the project serializer
 * (Phase 2c) already exists, snapshots are trivially correct, and
 * restoring a snapshot is a single `clear() + deserializeProject()`
 * call. The cost is one full rebuild per undo, which is fine for
 * chain sizes a human would actually edit.
 *
 * Debouncing: a slider drag fires `input` events at the frame rate.
 * We coalesce pushes within `debounceMs` (default 250ms) into a
 * single history entry — the final state of the gesture, not every
 * intermediate value. This keeps the stack short and meaningful.
 */

export class HistoryController {
  /**
   * @param {object} options
   * @param {() => object} options.snapshot - serialize current state.
   * @param {(snapshot: object) => (void|Promise<void>)} options.apply - restore a snapshot.
   * @param {number} [options.debounceMs=250] - coalesce rapid pushes.
   * @param {number} [options.maxSize=50] - cap the undo stack.
   * @param {() => boolean} [options.shouldCommit] - optional filter;
   *   return false to skip pushing (e.g. no-op changes).
   */
  constructor({ snapshot, apply, debounceMs = 250, maxSize = 50, shouldCommit, captureInitial = true } = {}) {
    if (typeof snapshot !== "function" || typeof apply !== "function") {
      throw new Error("HistoryController requires snapshot() and apply()");
    }
    this._snapshot = snapshot;
    this._apply = apply;
    this._debounceMs = debounceMs;
    this._maxSize = maxSize;
    this._shouldCommit = shouldCommit ?? (() => true);
    this._undoStack = [];
    this._redoStack = [];
    this._pending = null;
    this._timer = 0;
    this._listeners = new Set();
    if (captureInitial && this._shouldCommit()) {
      this._undoStack.push(this._snapshot());
    }
  }

  /** @returns {{canUndo: boolean, canRedo: boolean, undoDepth: number, redoDepth: number}} */
  state() {
    return {
      // An undo needs at least 2 entries: the top is the current state,
      // and we restore to the new top. If there's only the initial
      // snapshot left, there's nothing older to go back to.
      canUndo: this._undoStack.length > 1,
      canRedo: this._redoStack.length > 0,
      undoDepth: this._undoStack.length,
      redoDepth: this._redoStack.length,
    };
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    for (const fn of this._listeners) fn(this.state());
  }

  /**
   * Schedule a snapshot to be committed after the debounce window.
   * If called again before the window elapses, only the most recent
   * snapshot is kept (intermediate states are dropped).
   */
  push() {
    if (!this._shouldCommit()) return;
    this._pending = this._snapshot();
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._commit(), this._debounceMs);
  }

  /** Force an immediate commit if there's a pending snapshot. */
  flush() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = 0;
    }
    this._commit();
  }

  _commit() {
    this._timer = 0;
    if (this._pending == null) return;
    this._undoStack.push(this._pending);
    if (this._undoStack.length > this._maxSize) {
      this._undoStack.splice(0, this._undoStack.length - this._maxSize);
    }
    this._redoStack = [];
    this._pending = null;
    this._emit();
  }

  /**
   * Undo to the previous snapshot. Returns true on success.
   *
   * The undo stack's top always represents the *current* state — that
   * invariant is what makes undo and redo symmetric. To undo:
   *   1. snapshot the current state for the redo stack
   *   2. pop the top (it matched the current state — discard it)
   *   3. apply the new top (= the state to restore to)
   * If the stack is too shallow (length < 2) there is nothing older
   * to restore to and undo returns false.
   */
  undo() {
    this.flush();
    if (this._undoStack.length < 2) return false;
    const current = this._snapshot();
    this._undoStack.pop();
    this._redoStack.push(current);
    const target = this._undoStack[this._undoStack.length - 1];
    const result = this._apply(target);
    this._emit();
    return result === undefined ? true : !!result;
  }

  /**
   * Redo the next snapshot. Returns true on success. Symmetric to undo:
   *   1. snapshot the current state onto the undo stack
   *   2. pop the next target off the redo stack
   *   3. apply that target
   */
  redo() {
    this.flush();
    if (this._redoStack.length === 0) return false;
    const current = this._snapshot();
    this._undoStack.push(current);
    const target = this._redoStack.pop();
    const result = this._apply(target);
    this._emit();
    return result === undefined ? true : !!result;
  }

  /** Empty both stacks and discard any pending snapshot. */
  clear() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = 0;
    }
    this._undoStack = [];
    this._redoStack = [];
    this._pending = null;
    this._emit();
  }
}

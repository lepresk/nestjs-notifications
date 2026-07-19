/**
 * Strategy for deferring delivery until the surrounding database transaction
 * commits. The default runs the hook immediately, which suits non-transactional
 * call sites. Wire an implementation backed by an after-commit context (for
 * example `@lepresk/after-commit`) to defer delivery until commit.
 */
export interface AfterCommitDispatcher {
  register(hook: () => Promise<void>): void;
}

export const IMMEDIATE_AFTER_COMMIT_DISPATCHER: AfterCommitDispatcher = {
  register(hook): void {
    void hook();
  },
};

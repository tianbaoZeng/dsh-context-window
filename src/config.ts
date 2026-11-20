export interface ContextWindowConfig {
  /** Usage ratio that triggers auto-summarisation (0..1). */
  threshold: number;
  /** Maximum number of simultaneously pinned files. */
  maxPinnedFiles: number;
  /** Model context window size in tokens, used for the meter denominator. */
  windowTokens: number;
  /** Case-insensitive phrase that triggers diff-based context injection. */
  diffTrigger: string;
  /** Directory where session snapshots are stored. */
  snapshotDir: string;
  /** Whether auto-summarisation runs at all. */
  autoSummarize: boolean;
}

export const DEFAULT_CONFIG: ContextWindowConfig = {
  threshold: 0.8,
  maxPinnedFiles: 5,
  windowTokens: 65536,
  diffTrigger: 'continue from where we left off',
  snapshotDir: '.dsh',
  autoSummarize: true,
};

export function resolveConfig(input?: Partial<ContextWindowConfig>): ContextWindowConfig {
  const cfg: ContextWindowConfig = { ...DEFAULT_CONFIG, ...(input ?? {}) };
  if (!(cfg.threshold > 0 && cfg.threshold < 1)) {
    throw new Error(`dsh-context-window: threshold must be in (0, 1), got ${cfg.threshold}`);
  }
  if (!Number.isInteger(cfg.maxPinnedFiles) || cfg.maxPinnedFiles < 1) {
    throw new Error(`dsh-context-window: maxPinnedFiles must be a positive integer, got ${cfg.maxPinnedFiles}`);
  }
  if (!Number.isInteger(cfg.windowTokens) || cfg.windowTokens < 1) {
    throw new Error(`dsh-context-window: windowTokens must be a positive integer, got ${cfg.windowTokens}`);
  }
  return cfg;
}

import type { Context } from '@deepseek-ai/cordis';
import { wire } from './adapter';
import type { ContextWindowConfig } from './config';

export const name = 'dsh-context-window';

export const inject: string[] = [];

export function apply(ctx: Context, config?: Partial<ContextWindowConfig>): void {
  wire(ctx, config);
}

export { wire } from './adapter';
export { resolveConfig, DEFAULT_CONFIG, type ContextWindowConfig } from './config';
export { ContextMeter } from './core/contextMeter';
export { PinManager, type PinnedFile } from './core/pinManager';
export { Summarizer, type ChatMessage, type LlmSummarizeFn } from './core/summarizer';
export { DiffInjector, type DiffInjectPayload } from './core/diffInjector';
export { SnapshotStore, type SessionSnapshot } from './core/snapshotStore';
export { estimateTokens, usageFromPayload } from './core/tokenEstimator';

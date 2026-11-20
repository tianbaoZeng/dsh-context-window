import type { PinManager } from './pinManager';

export interface DiffInjectPayload {
  diffs: Array<{ path: string; diff: string }>;
}

/**
 * Watches user messages for the trigger phrase (e.g. "continue from where we
 * left off") and, on match, emits git diffs of pinned files instead of full
 * file contents — the harness can then inject the payload into the context.
 */
export class DiffInjector {
  constructor(
    private readonly pins: PinManager,
    private readonly trigger: string,
    private readonly onInject: (payload: DiffInjectPayload) => void,
  ) {}

  matches(message: string): boolean {
    return message.toLowerCase().includes(this.trigger.toLowerCase());
  }

  async check(message: string): Promise<boolean> {
    if (!this.matches(message)) return false;
    const diffs = await this.pins.diffsForAll();
    this.onInject({ diffs });
    return true;
  }
}

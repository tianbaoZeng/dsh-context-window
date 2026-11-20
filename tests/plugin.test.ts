// Integration test for the plugin wiring without a real DSH runtime:
// a fake Cordis context records registrations and lets the test fire events,
// exactly like the vscode mock pattern used in tests/VscodeExtension.test.ts.
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Context, CommandDefinition, CommandsService, ToolDefinition, ToolsService } from '@deepseek-ai/cordis';
import { apply, wire, type ContextWindowConfig } from '../src/index';

class FakeContext implements Context {
  readonly commands: CommandsService;
  readonly tools: ToolsService;
  private commandDefs: CommandDefinition[] = [];
  private toolDefs: ToolDefinition[] = [];
  private listeners = new Map<string, Array<(payload: any) => unknown>>();
  readonly emitted: Array<{ event: string; args: unknown[] }> = [];
  logger = { info: () => {}, warn: () => {} };

  constructor() {
    this.commands = {
      register: (def) => {
        this.commandDefs.push(def);
        return () => {};
      },
    };
    this.tools = {
      register: (def) => {
        this.toolDefs.push(def);
        return () => {};
      },
    };
  }

  on(event: string, listener: (payload: any) => unknown): () => void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return () => {};
  }

  emit(event: string, ...args: unknown[]): void {
    this.emitted.push({ event, args });
  }

  effect(): void {}

  fire(event: string, payload: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(payload);
    }
  }

  getCommands(): CommandDefinition[] {
    return [...this.commandDefs];
  }

  getTools(): ToolDefinition[] {
    return [...this.toolDefs];
  }
}

function makeCtxAndWire(config?: Partial<ContextWindowConfig>) {
  const ctx = new FakeContext();
  const result = wire(ctx, config);
  return { ctx, ...result };
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('dsh-context-window plugin wiring', () => {
  test('registers the documented commands and tools', () => {
    const { ctx } = makeCtxAndWire();
    expect(ctx.getCommands().map((c) => c.name).sort()).toEqual(
      ['context-status', 'pin', 'restore', 'snapshot', 'unpin'].sort(),
    );
    expect(ctx.getTools().map((t) => t.name).sort()).toEqual(
      ['context_diff', 'context_pin', 'context_restore', 'context_snapshot', 'context_status', 'context_unpin'].sort(),
    );
  });

  test('counts tokens from session events', () => {
    const { ctx, meter } = makeCtxAndWire();
    ctx.fire('session/event', { type: 'user/message', content: 'x'.repeat(400) });
    expect(meter.usedTokens).toBe(100);
    ctx.fire('session/event', { type: 'assistant/message', content: 'y'.repeat(400), usage: { total_tokens: 50 } });
    expect(meter.usedTokens).toBe(150);
  });

  test('counts tokens from llm stream deltas', () => {
    const { ctx, meter } = makeCtxAndWire();
    ctx.fire('llm/stream', { text: 'a'.repeat(80) });
    expect(meter.usedTokens).toBe(20);
  });

  test('context-status reports ratio and pinned files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-cw-'));
    const file = path.join(dir, 'keep.ts');
    await fs.writeFile(file, 'export const keep = true;\n', 'utf8');

    const { ctx, meter } = makeCtxAndWire({ windowTokens: 100, snapshotDir: path.join(dir, '.dsh') });
    const pinCmd = ctx.getCommands().find((c) => c.name === 'pin')!;
    const pinOut = await pinCmd.handler([file]);
    expect(pinOut).toContain('pinned');

    meter.setUsed(60);
    const statusCmd = ctx.getCommands().find((c) => c.name === 'context-status')!;
    const out = await statusCmd.handler([]);
    expect(out).toContain('60%');
    expect(out).toContain(file);
    expect(out).toContain('pinned 1/5');
  });

  test('snapshot and restore roundtrip through the commands', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-cw-'));
    const file = path.join(dir, 'keep.ts');
    await fs.writeFile(file, 'hello\n', 'utf8');

    const { ctx, meter } = makeCtxAndWire({ snapshotDir: path.join(dir, '.dsh') });
    await (ctx.getCommands().find((c) => c.name === 'pin')!).handler([file]);
    meter.setUsed(777);
    const snapOut = await (ctx.getCommands().find((c) => c.name === 'snapshot')!).handler([]);
    const id = /saved snapshot (\S+)/.exec(snapOut)![1];

    meter.setUsed(0);
    await (ctx.getCommands().find((c) => c.name === 'unpin')!).handler([file]);
    const restoreOut = await (ctx.getCommands().find((c) => c.name === 'restore')!).handler([id]);
    expect(restoreOut).toContain(`restored ${id}`);
    expect(meter.usedTokens).toBe(777);
    expect(await (ctx.getCommands().find((c) => c.name === 'context-status')!).handler([])).toContain(file);
  });

  test('restore reports a missing snapshot id', async () => {
    const { ctx } = makeCtxAndWire();
    const out = await (ctx.getCommands().find((c) => c.name === 'restore')!).handler(['nope']);
    expect(out).toContain('snapshot not found');
  });

  test('emits summary-ready when usage crosses the threshold', async () => {
    const { ctx } = makeCtxAndWire({ threshold: 0.5, windowTokens: 100, autoSummarize: true });
    ctx.fire('session/event', { type: 'user/message', content: 'a'.repeat(400) });
    ctx.fire('session/event', { type: 'assistant/message', content: 'b'.repeat(400) });
    ctx.fire('session/event', { type: 'user/message', content: 'c'.repeat(400) });
    await flushAsync();
    expect(ctx.emitted.some((e) => e.event === 'dsh-context-window/summary-ready')).toBe(true);
  });

  test('does not summarise when auto is disabled', async () => {
    const { ctx } = makeCtxAndWire({ threshold: 0.5, windowTokens: 100, autoSummarize: false });
    for (let i = 0; i < 10; i++) {
      ctx.fire('session/event', { type: 'user/message', content: 'z'.repeat(400) });
    }
    await flushAsync();
    expect(ctx.emitted.some((e) => e.event === 'dsh-context-window/summary-ready')).toBe(false);
  });

  test('emits diff-inject when the trigger phrase appears', async () => {
    const { ctx } = makeCtxAndWire();
    ctx.fire('session/event', { type: 'user/message', content: 'let us continue from where we left off' });
    await flushAsync();
    expect(ctx.emitted.some((e) => e.event === 'dsh-context-window/diff-inject')).toBe(true);
  });

  test('invalid config is rejected at load time', () => {
    expect(() => wire(new FakeContext(), { threshold: 1.5 })).toThrow(/threshold/);
    expect(() => wire(new FakeContext(), { maxPinnedFiles: 0 })).toThrow(/maxPinnedFiles/);
  });

  test('apply() wires without config and stop() unwinds cleanly', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-cw-'));
    const ctx = new FakeContext();
    apply(ctx, { snapshotDir: path.join(dir, '.dsh') });
    expect(ctx.getCommands()).toHaveLength(5);
    const { stop } = wire(ctx, {});
    expect(() => stop()).not.toThrow();
  });
});

// The single file that touches the real DSH/Cordis API. DSH is in developer
// preview; if the installed version's types differ from src/types/dsh-api.d.ts,
// align this file first (and keep the core/ modules untouched).
import type { Context, ToolDefinition } from '@deepseek-ai/cordis';
import { resolveConfig, type ContextWindowConfig } from './config';
import { ContextMeter } from './core/contextMeter';
import { PinManager } from './core/pinManager';
import { SnapshotStore } from './core/snapshotStore';
import { Summarizer, type ChatMessage } from './core/summarizer';
import { DiffInjector } from './core/diffInjector';
import { estimateTokens, usageFromPayload } from './core/tokenEstimator';
import { createCommandHandlers, COMMAND_DESCRIPTIONS } from './commands';

export interface WireResult {
  meter: ContextMeter;
  pins: PinManager;
  store: SnapshotStore;
  stop: () => void;
}

export function wire(ctx: Context, input?: Partial<ContextWindowConfig>): WireResult {
  const cfg = resolveConfig(input);
  const meter = new ContextMeter(cfg.windowTokens);
  const pins = new PinManager({ maxPinnedFiles: cfg.maxPinnedFiles });
  const store = new SnapshotStore(cfg.snapshotDir);
  const summarizer = new Summarizer({ threshold: cfg.threshold, auto: cfg.autoSummarize });
  const history: ChatMessage[] = [];
  const disposers: Array<() => void> = [];
  const log = (msg: string) => ctx.logger?.info(`[dsh-context-window] ${msg}`);

  const diffInjector = new DiffInjector(pins, cfg.diffTrigger, (payload) => {
    ctx.emit('dsh-context-window/diff-inject', payload);
  });

  const handlers = createCommandHandlers({
    pins,
    meter,
    store,
    threshold: cfg.threshold,
    getHistory: () => history,
  });

  async function diffText(filePath?: string): Promise<string> {
    if (filePath) {
      const diff = await pins.diffFor(filePath);
      return diff ?? `(no diff available for ${filePath})`;
    }
    const all = await pins.diffsForAll();
    if (all.length === 0) return '(no pinned files with diffs)';
    return all.map((e) => `## ${e.path}\n${e.diff}`).join('\n');
  }

  const toolDefs: ToolDefinition[] = [
    {
      name: 'context_status',
      description:
        'Show current context-window token usage, usage ratio and the list of pinned files.',
      execute: async () => ({ content: await handlers['context-status']([]) }),
    },
    {
      name: 'context_diff',
      description:
        'Return git diffs of pinned files since they were pinned; pass a path for a single file.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Optional single pinned file path' } },
      },
      execute: async (args) => ({
        content: await diffText(typeof args.path === 'string' ? args.path : undefined),
      }),
    },
    {
      name: 'context_pin',
      description: 'Pin a file so its content stays in the context regardless of eviction.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path to pin' } },
        required: ['path'],
      },
      execute: async (args) => ({
        content: await handlers.pin([String(args.path)]),
      }),
    },
    {
      name: 'context_unpin',
      description: 'Release a previously pinned file.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path to unpin' } },
        required: ['path'],
      },
      execute: async (args) => ({ content: await handlers.unpin([String(args.path)]) }),
    },
    {
      name: 'context_snapshot',
      description: 'Save the current context state (tokens, pinned files, recent messages).',
      execute: async () => ({ content: await handlers.snapshot([]) }),
    },
    {
      name: 'context_restore',
      description: 'Restore a saved session snapshot by id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Snapshot id from /snapshot' } },
        required: ['id'],
      },
      execute: async (args) => ({ content: await handlers.restore([String(args.id)]) }),
    },
  ];

  // Session log: token accounting + history projection + triggers.
  disposers.push(
    ctx.on('session/event', (payload: any) => {
      const usage = usageFromPayload(payload);
      const text = typeof payload?.content === 'string' ? payload.content : '';
      if (typeof usage === 'number') meter.addTokens(usage);
      else if (text) meter.addTokens(estimateTokens(text));
      const type: unknown = payload?.type ?? payload?.event?.type;
      if ((type === 'user/message' || type === 'assistant/message') && text) {
        const role: ChatMessage['role'] = type === 'user/message' ? 'user' : 'assistant';
        history.push({ role, content: text });
        if (role === 'user') {
          void diffInjector.check(text).then((hit) => {
            if (hit) log('diff trigger matched; emitted dsh-context-window/diff-inject');
          });
        }
        if (summarizer.shouldRun(meter, history.length)) {
          void summarizer
            .run(history)
            .then((compacted) => {
              history.length = 0;
              history.push(...compacted);
              const tokensAfter = estimateTokens(compacted.map((m) => m.content).join('\n'));
              ctx.emit('dsh-context-window/summary-ready', {
                messages: compacted.length,
                tokensAfter,
              });
              log(`auto-summarised history to ${compacted.length} messages (~${tokensAfter} tok)`);
            })
            .catch(() => undefined);
        }
      }
    }),
  );

  // LLM stream: count tokens from deltas or reported usage.
  disposers.push(
    ctx.on('llm/stream', (payload: any) => {
      const usage = usageFromPayload(payload);
      const delta =
        typeof payload?.text === 'string'
          ? payload.text
          : typeof payload?.delta === 'string'
            ? payload.delta
            : '';
      meter.addTokens(typeof usage === 'number' ? usage : estimateTokens(delta));
    }),
  );

  for (const name of Object.keys(COMMAND_DESCRIPTIONS)) {
    disposers.push(
      ctx.commands.register({
        name,
        description: COMMAND_DESCRIPTIONS[name],
        handler: (args: string[]) => handlers[name](args),
      }),
    );
  }

  for (const tool of toolDefs) {
    disposers.push(ctx.tools.register(tool));
  }

  log(
    `loaded (threshold ${cfg.threshold}, window ${cfg.windowTokens} tok, max ${cfg.maxPinnedFiles} pinned)`,
  );

  return {
    meter,
    pins,
    store,
    stop: () => {
      for (const dispose of [...disposers].reverse()) {
        try {
          dispose();
        } catch {
          // best-effort unwind
        }
      }
    },
  };
}

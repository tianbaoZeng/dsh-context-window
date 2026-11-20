// Minimal ambient types for '@deepseek-ai/cordis' — the subset of the DSH
// plugin API used by dsh-context-window. When the real package is installed
// (peer dependency, provided by the DSH runtime), its declarations take
// precedence over this stub, exactly like tests/vscode-stub.d.ts.
//
// DSH is in developer preview and its API evolves between versions. All
// real-API touchpoints are concentrated in src/adapter.ts; if the installed
// version's types differ from this stub, align the adapter first.
declare module '@deepseek-ai/cordis' {
  export interface ToolParameters {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  }

  export interface ToolResult {
    content: string;
  }

  export interface ToolDefinition {
    name: string;
    description: string;
    parameters?: ToolParameters;
    execute(args: Record<string, unknown>): Promise<ToolResult | string | void>;
  }

  export interface CommandDefinition {
    name: string;
    description: string;
    handler(args: string[]): Promise<string> | string;
  }

  export interface ToolsService {
    register(tool: ToolDefinition): () => void;
  }

  export interface CommandsService {
    register(command: CommandDefinition): () => void;
  }

  export interface Logger {
    info(message: string): void;
    warn(message: string): void;
  }

  export interface Context {
    on(event: string, listener: (payload: any) => unknown): () => void;
    emit(event: string, ...args: unknown[]): void;
    effect(fn: () => void | (() => void)): void;
    tools: ToolsService;
    commands: CommandsService;
    logger?: Logger;
  }
}

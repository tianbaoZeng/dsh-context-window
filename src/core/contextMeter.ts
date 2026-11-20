const ANSI = { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', reset: '\x1b[0m' };

export class ContextMeter {
  private used = 0;

  constructor(private readonly total: number) {}

  get usedTokens(): number {
    return this.used;
  }

  get totalTokens(): number {
    return this.total;
  }

  get ratio(): number {
    return this.total > 0 ? this.used / this.total : 0;
  }

  addTokens(n: number): void {
    if (Number.isFinite(n) && n > 0) this.used += n;
  }

  setUsed(n: number): void {
    this.used = Math.max(0, n);
  }

  isAbove(threshold: number): boolean {
    return this.ratio >= threshold;
  }

  renderBar(width = 20): string {
    const filled = Math.min(width, Math.round(this.ratio * width));
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
    return `[${bar}] ${Math.round(this.ratio * 100)}% (${Math.round(this.used)}/${this.total} tok)`;
  }

  renderColored(threshold: number): string {
    let color = ANSI.green;
    if (this.ratio >= threshold) color = ANSI.red;
    else if (this.ratio >= threshold * 0.75) color = ANSI.yellow;
    return `${color}${this.renderBar()}${ANSI.reset}`;
  }
}

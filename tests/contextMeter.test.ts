import { ContextMeter } from '../src/core/contextMeter';

describe('ContextMeter', () => {
  test('starts empty and accumulates tokens', () => {
    const meter = new ContextMeter(100);
    expect(meter.usedTokens).toBe(0);
    expect(meter.ratio).toBe(0);
    meter.addTokens(30);
    meter.addTokens(20);
    expect(meter.usedTokens).toBe(50);
    expect(meter.ratio).toBeCloseTo(0.5);
  });

  test('ignores non-positive deltas', () => {
    const meter = new ContextMeter(100);
    meter.addTokens(-5);
    meter.addTokens(0);
    expect(meter.usedTokens).toBe(0);
  });

  test('setUsed clamps at zero', () => {
    const meter = new ContextMeter(100);
    meter.setUsed(-10);
    expect(meter.usedTokens).toBe(0);
  });

  test('isAbove respects the threshold', () => {
    const meter = new ContextMeter(100);
    meter.setUsed(79);
    expect(meter.isAbove(0.8)).toBe(false);
    meter.setUsed(80);
    expect(meter.isAbove(0.8)).toBe(true);
  });

  test('renderBar shows ratio and totals', () => {
    const meter = new ContextMeter(100);
    meter.setUsed(50);
    const bar = meter.renderBar();
    expect(bar).toContain('50%');
    expect(bar).toContain('50/100');
    expect(bar).toMatch(/^\[█+░+\] /);
  });

  test('renderColored turns red above the threshold', () => {
    const meter = new ContextMeter(100);
    meter.setUsed(90);
    const colored = meter.renderColored(0.8);
    expect(colored).toContain('\x1b[31m');
    expect(colored).toContain('\x1b[0m');
    meter.setUsed(10);
    expect(meter.renderColored(0.8)).toContain('\x1b[32m');
  });
});

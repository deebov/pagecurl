import { describe, expect, test } from 'bun:test';
import { cubicBezier, Easing, Tween } from '../src/index.js';

describe('cubicBezier', () => {
  test('starts at 0, ends at 1 and never runs backwards', () => {
    for (const curve of Object.values(Easing)) {
      const ease = cubicBezier(curve);
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      let last = 0;
      for (let u = 0.01; u < 1; u += 0.01) {
        const v = ease(u);
        expect(v).toBeGreaterThanOrEqual(last - 1e-9);
        last = v;
      }
    }
  });

  test('linear control points give a straight line', () => {
    const ease = cubicBezier([1 / 3, 1 / 3, 2 / 3, 2 / 3]);
    expect(ease(0.37)).toBeCloseTo(0.37, 6);
  });
});

describe('Tween', () => {
  test('follows a moving target when it has no end value', () => {
    const tween = new Tween(0, undefined, 1, Easing.inOut, 10);
    expect(tween.value(10, 50)).toBe(0);
    expect(tween.value(11, 80)).toBe(80);
    expect(tween.done(11)).toBe(true);
  });
});

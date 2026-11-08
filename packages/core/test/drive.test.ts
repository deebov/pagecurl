import { describe, expect, test } from 'bun:test';
import { CurlDriver, type Direction, Kind, type Point, Spine } from '../src/index.js';
import { hash, random } from './cases.js';
import fixtures from './fixtures/drive.json';

const SPINES = [Spine.Left, Spine.Top, Spine.Center, Spine.Middle, Spine.Right, Spine.Bottom];

/** Runs a fixed sequence of turns and drags for one spine and hashes everything it returns. */
function digest(spine: Spine): string {
  const rnd = random(777 + spine);
  const values: number[] = [];
  for (let c = 0; c < 60; c++) {
    const rect = [0, 0, 200 + rnd() * 800, 200 + rnd() * 800] as const;
    const driver = new CurlDriver(spine, rect);
    const kind = rnd() < 0.5 ? Kind.Drag : Kind.Turn;
    const direction = (rnd() < 0.5 ? 0 : 1) as Direction;
    const at = (): Point => [
      rnd() * rect[2] * 1.4 - 0.2 * rect[2],
      rnd() * rect[3] * 1.4 - 0.2 * rect[3],
    ];
    const state = driver.begin(kind, at(), direction);
    values.push(state.kind, ...driver.pageFrame(direction), driver.distanceToTravel());
    for (const key of ['time', 'radius', 'angle'] as const)
      values.push(...driver.range(state, key));
    for (let m = 0; m < 6; m++) {
      const inputs = driver.inputsAt(state, at());
      values.push(inputs.time, inputs.radius, inputs.angle);
    }
    const limits = { rest: 0.25, minVelocity: 2048, maxVelocity: 4096 };
    values.push(driver.releaseDuration(state, (rnd() - 0.5) * 9000, rnd() < 0.5, rnd(), limits));
  }
  return hash(values);
}

describe('CurlDriver', () => {
  for (const spine of SPINES) {
    test(`spine ${spine} matches the recorded inputs exactly`, () => {
      expect(digest(spine)).toBe((fixtures as Record<string, string>)[spine] as string);
    });
  }

  test('a drag towards the spine reaches the end of the turn', () => {
    const driver = new CurlDriver(Spine.Left, [0, 0, 400, 600]);
    const state = driver.begin(Kind.Drag, [390, 300], 0);
    expect(driver.inputsAt(state, [380, 300]).time).toBeLessThan(0.2);
    expect(driver.inputsAt(state, [-400, 300]).time).toBeGreaterThan(0.7);
  });

  test('turning back from a left spine runs in reverse', () => {
    const driver = new CurlDriver(Spine.Left, [0, 0, 400, 600]);
    expect(driver.begin(Kind.Turn, [0, 0], 1).kind).toBe(Kind.TurnBack);
    expect(driver.begin(Kind.Drag, [10, 10], 1).kind).toBe(Kind.DragBack);
  });
});

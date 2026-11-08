import { describe, expect, test } from 'bun:test';
import { buildCurlMesh, MODE_TEXTURE, VERTEX_FLOATS } from '../src/index.js';
import { hash, meshCases } from './cases.js';
import fixtures from './fixtures/mesh.json';

const cases = meshCases(fixtures.length);

function digest(i: number): string {
  const mesh = buildCurlMesh(cases[i] as (typeof cases)[number]);
  const values: number[] = [];
  for (const d of mesh.draws) {
    values.push(d.mode, d.count);
    for (let k = d.first * VERTEX_FLOATS; k < (d.first + d.count) * VERTEX_FLOATS; k++) {
      values.push(mesh.vertices[k] as number);
    }
  }
  return hash(values);
}

describe('buildCurlMesh', () => {
  test('matches the recorded meshes exactly', () => {
    const mismatches = fixtures.filter((expected, i) => digest(i) !== expected).length;
    expect(mismatches).toBe(0);
  });

  test('a flat page is one textured strip across the whole page', () => {
    const mesh = buildCurlMesh({
      width: 300,
      height: 400,
      pixelRatio: 2,
      time: 0,
      angle: Math.PI,
      radius: 40,
      front: true,
      back: true,
      colors: {
        front: [1, 1, 1, 1],
        backNear: [1, 1, 1, 0.75],
        backFar: [1, 1, 1, 0.85],
        shadow: [0, 0, 0, 0.4],
      },
    });
    const textured = mesh.draws.filter((d) => d.mode === MODE_TEXTURE);
    expect(textured.length).toBeGreaterThan(0);
    let minX = Infinity;
    let maxX = -Infinity;
    for (const d of textured) {
      for (let v = d.first; v < d.first + d.count; v++) {
        const x = mesh.vertices[v * VERTEX_FLOATS] as number;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    expect(minX).toBeLessThanOrEqual(0.5);
    expect(maxX).toBeGreaterThanOrEqual(299.5);
  });
});

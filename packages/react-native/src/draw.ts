// Draws curl meshes with Skia. The mesh comes as triangle strips in three modes (vertex colour,
// page × colour, colour × page alpha); consecutive strips of one mode go out as a single indexed
// triangle list, and the page is a runtime shader evaluated at the vertices' texture coordinates.

import { type CurlMesh, MODE_COLOR, MODE_TINT, VERTEX_FLOATS } from '@pagecurl/core';
import {
  BlendMode,
  FilterMode,
  MipmapMode,
  type SkCanvas,
  type SkImage,
  type SkJSIInstance,
  type SkShader,
  Skia,
  TileMode,
  VertexMode,
} from '@shopify/react-native-skia';
import type { LayerView } from './book.js';

const PAGE = `
uniform shader page;
uniform float2 scale;
uniform float width;
uniform float flip;
uniform float tint;
half4 main(float2 p) {
  float x = flip > 0.5 ? width - p.x : p.x;
  half4 c = page.eval(float2(x, p.y) * scale);
  return tint > 0.5 ? half4(c.a) : c;
}`;

let pageEffect: ReturnType<typeof Skia.RuntimeEffect.Make> = null;
let white: SkShader | null = null;

/**
 * Draws one layer of a turn at `origin` (the top-left of the book in the canvas) and returns the
 * Skia objects it made, to be freed once the recording no longer needs them.
 */
export function drawMesh(
  canvas: SkCanvas,
  mesh: CurlMesh,
  image: SkImage,
  view: LayerView,
  origin: readonly [number, number],
): SkJSIInstance<string>[] {
  pageEffect ??= Skia.RuntimeEffect.Make(PAGE);
  white ??= Skia.Shader.MakeColor(Skia.Color('white'));
  if (!pageEffect) throw new Error('pagecurl: the page shader did not compile');
  const made: SkJSIInstance<string>[] = [];
  const [fx, fy, fw, fh] = view.frame;
  const texWidth = fw * view.pixelRatio;
  const texHeight = fh * view.pixelRatio;
  const imageShader = image.makeShaderOptions(
    TileMode.Clamp,
    TileMode.Clamp,
    FilterMode.Linear,
    MipmapMode.None,
  );
  const shade = (tint: boolean) => {
    const shader = (pageEffect as NonNullable<typeof pageEffect>).makeShaderWithChildren(
      [
        image.width() / texWidth,
        image.height() / texHeight,
        texWidth,
        view.flip ? 1 : 0,
        tint ? 1 : 0,
      ],
      [imageShader],
    );
    made.push(shader);
    return shader;
  };
  made.push(imageShader);

  canvas.save();
  canvas.translate(origin[0] + fx, origin[1] + fy);
  const v = mesh.vertices;
  const draws = mesh.draws;
  for (let i = 0; i < draws.length;) {
    const mode = (draws[i] as (typeof draws)[number]).mode;
    const positions: { x: number; y: number }[] = [];
    const texs: { x: number; y: number }[] = [];
    const colors: number[][] = [];
    const indices: number[] = [];
    for (; i < draws.length && (draws[i] as (typeof draws)[number]).mode === mode; i++) {
      const { first, count } = draws[i] as (typeof draws)[number];
      const base = positions.length;
      for (let k = 0; k < count; k++) {
        const o = (first + k) * VERTEX_FLOATS;
        positions.push({ x: v[o] as number, y: v[o + 1] as number });
        texs.push({ x: v[o + 2] as number, y: v[o + 3] as number });
        // Skia takes straight colours; the mesh's are premultiplied.
        const a = v[o + 7] as number;
        const k1 = a > 0 ? 1 / a : 0;
        colors.push([
          Math.min(1, (v[o + 4] as number) * k1),
          Math.min(1, (v[o + 5] as number) * k1),
          Math.min(1, (v[o + 6] as number) * k1),
          a,
        ]);
      }
      for (let k = 0; k + 2 < count; k++) indices.push(base + k, base + k + 1, base + k + 2);
    }
    if (!indices.length) continue;
    const vertices = Skia.MakeVertices(
      VertexMode.Triangles,
      positions,
      texs,
      colors as unknown as Parameters<typeof Skia.MakeVertices>[3],
      indices,
      true,
    );
    const paint = Skia.Paint();
    // Vertex colours are blended with the paint's shader: white leaves them as they are.
    paint.setShader(mode === MODE_COLOR ? white : shade(mode === MODE_TINT));
    canvas.drawVertices(vertices, BlendMode.Modulate, paint);
    made.push(vertices, paint);
  }
  canvas.restore();
  return made;
}

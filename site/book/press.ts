// The press: prints a page's ink onto its material. A page is drawn first as coverage, three
// channels of where things go (see Plate), and this pass turns that into a picture of a real
// sheet: paper with its formation, fibres, laid lines, yellowing and foxing, letterpress ink
// that spread and missed, a second colour that didn't quite register, the back of the leaf
// showing through, and cloth, gilt and marbling for the covers and endpapers. Everything is a
// function of the point on the page in page units, so it looks the same at any size.
//
// The techniques follow initialis (github.com/azlen/initialis): ink as a filter over paper, edges
// thresholded against noise, value-noise formation and hashed fibres.

/** What a page is made of. */
export type Material =
  /** Paper. Channels: first ink, second ink, plate mark (pressed into the paper). */
  | 'paper'
  /** Book cloth over board. Channels: gilt, blind stamping, unused. */
  | 'cloth'
  /** Marbled paper pasted inside the board. Channels: label ink, label paper, cloth turn-in. */
  | 'endpaper';

export interface PrintOptions {
  material: Material;
  /** Where the spine is: -1 on the left (a right-hand page), 1 on the right, 0 nowhere. */
  spine: number;
  seed: number;
  /** Page units across the page. */
  units: number;
  ink?: string;
  ink2?: string;
  /** Book cloth colour. */
  cloth?: string;
  /** The other side of the leaf, to show through the paper. */
  back?: HTMLCanvasElement | null;
}

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0., 1.); }`;

const FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D cov, back;
uniform vec2 res;
uniform float scale, spine, seed, units, material, hasBack;
uniform vec3 ink1, ink2, cloth;

const float TAU = 6.2831853;
const vec3 PAPER = vec3(0.968, 0.951, 0.905);
const vec3 L = normalize(vec3(-0.55, -0.7, 0.9));

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p) { float a = h21(p); return vec2(a, h21(p + a + 19.19)); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= .5; } return s / .9375; }
// 1 when a feature this many units across spans a few pixels, 0 when it would only alias
float detail(float size) { return smoothstep(.8, 2.4, size * scale); }

// page units, y down, to texture coordinates (the coverage was uploaded flipped)
vec2 uvOf(vec2 p) { return vec2(p.x * scale / res.x, 1. - p.y * scale / res.y); }
// a channel blurred over about r units
vec3 blurred(vec2 p, float r) { return textureLod(cov, uvOf(p), log2(max(r * scale, 1.))).rgb; }

float spineDist(vec2 p) { return spine < 0. ? p.x : spine > 0. ? units - p.x : 1e4; }
// distance to the edges that aren't the spine
float edgeDist(vec2 p, float H) {
  float d = min(p.y, H - p.y);
  if (spine <= 0.) d = min(d, units - p.x);
  if (spine >= 0.) d = min(d, p.x);
  return d;
}

// ink as it came off the press: edges rough and spread, density uneven, specks where it didn't take
float printed(vec2 p, int c, vec2 off) {
  vec2 q = p + off;
  vec2 d = (vec2(fbm(q / .55 + seed), fbm(q / .55 + seed + 31.7)) - .5) * .28;
  float sharp = texture(cov, uvOf(q + d))[c];
  float soft = blurred(q + d, .3)[c];
  float v = mix(sharp, soft, .45);
  float n = (fbm(q / .7 + seed * .37) - .5) * .22 + (h21(floor(q * 3.1) + seed) - .5) * .06;
  float t = .4 + n;
  float aa = max(fwidth(v) * .75, .01);
  float a = smoothstep(t - aa, t + aa, v);
  // pressed to the edges of each letter, thinner in the middle of solids
  float wide = blurred(q, 1.6)[c];
  a *= 1. + .3 * clamp(sharp - wide, 0., 1.) - .12 * smoothstep(.75, 1., wide);
  a *= 1. - .2 * fbm(q / 8. + seed * 1.3);
  float speck = step(.9, vn(q / .26 + seed * 3.1)) * detail(.25) * smoothstep(.6, 1., wide);
  return clamp(a * (1. - .55 * speck), 0., 1.);
}

// hashed fibres: a short curved strand in some cells of a grid, darker or lighter than the sheet
vec2 fibres(vec2 p) {
  vec2 cell = floor(p / 3.2);
  float dark = 0., light = 0.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(i, j);
    vec2 h = h22(c + seed);
    if (h.x < .55) continue;
    vec2 o = (c + h22(c + 7.3)) * 3.2;
    float a = h.y * TAU, len = 1. + 3.5 * h21(c + 2.1);
    vec2 dir = vec2(cos(a), sin(a));
    vec2 v = p - o;
    float t = clamp(dot(v, dir), -len, len);
    vec2 n = vec2(-dir.y, dir.x);
    float bend = (h21(c + 5.7) - .5) * .5 * (1. - t * t / (len * len)) * len;
    float dist = abs(dot(v - dir * t, n) - bend);
    float w = .07 + .06 * h21(c + 9.9);
    float f = smoothstep(w + .5 / scale, w, dist);
    if (h.x > .8) light = max(light, f); else dark = max(dark, f);
  }
  return vec2(dark, light) * detail(.15);
}

// rust-brown spots, mostly near the edges: some diffuse, some with a dark core
vec2 foxing(vec2 p, float edge) {
  vec2 cell = floor(p / 14.);
  vec2 r = vec2(0.);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(i, j);
    float h = h21(c + seed * 1.7);
    float want = .975 - .12 * exp(-edge / 30.);
    if (h < want) continue;
    vec2 o = (c + h22(c + 3.1)) * 14.;
    float rad = .25 + 1.1 * pow(h21(c + 4.4), 3.);
    vec2 v = p - o;
    float wob = 1. + .35 * (vn(normalize(v + 1e-4) * 2.3 + c) - .5);
    float d = length(v) / (rad * wob);
    r.x = max(r.x, smoothstep(3., .6, d) * .4);
    r.y = max(r.y, smoothstep(1., .35, d) * step(.5, h21(c + 8.8)));
  }
  return r;
}

vec3 paper(vec2 p, float H) {
  vec3 c = PAPER;
  // formation: the cloud of fibres in the sheet
  float form = fbm(p / 9. + seed) * .65 + vn(p / 1.4 + seed) * .35 * detail(.7);
  c *= 1. + .045 * (form - .5);
  // laid lines from the wires of the mould, and the chain lines that held them
  float k = detail(1.2);
  float laid = .5 + .5 * sin((p.y + .3 * vn(p / 7.)) * TAU / 1.2);
  c *= 1. - .011 * laid * k;
  float cx = abs(fract((p.x + 9.) / 25.) - .5) * 25.;
  c *= 1. - .016 * exp(-cx * cx / 1.4);
  vec2 f = fibres(p);
  c *= 1. - .07 * f.x;
  c = mix(c, vec3(1., .99, .96), f.y * .35);
  // yellowing: more where the air reached, at the edges away from the spine
  float e = edgeDist(p, H);
  float t = .06 + .1 * fbm(p / 30. + seed * .3) + .38 * exp(-e / 10.) + .25 * exp(-e / 1.6);
  c *= mix(vec3(1.), vec3(.84, .72, .52), clamp(t, 0., 1.) * .5);
  vec2 fx = foxing(p, e);
  c *= mix(vec3(1.), vec3(.88, .76, .6), fx.x);
  c *= mix(vec3(1.), vec3(.6, .42, .26), fx.y * .8);
  return c;
}

// book cloth: a plain weave, slubs in the thread, dye that isn't quite even
float weave(vec2 p) {
  vec2 q = p / .8;
  float over = mod(floor(q.x) + floor(q.y), 2.);
  float wx = .5 + .5 * sin(fract(q.x) * 3.1416);
  float wy = .5 + .5 * sin(fract(q.y) * 3.1416);
  float t = mix(wx * (.8 + .4 * vn(vec2(q.x * .5, q.y * 6.))), wy * (.8 + .4 * vn(vec2(q.x * 6., q.y * .5))), over);
  return mix(.6, t, detail(.8));
}
vec3 clothAt(vec2 p, float H, out float thread) {
  thread = weave(p);
  vec3 c = cloth * (.82 + .3 * thread);
  c *= 1. + .12 * (fbm(p / 22. + seed) - .5);
  // rubbed at the edges and corners: the dye worn off the high points
  float e = edgeDist(p, H);
  float wear = exp(-e / 3.) * .7 + .3 * exp(-e / 12.);
  wear *= smoothstep(.35, .75, fbm(p / 2.5 + seed * 2.) + thread * .3);
  c = mix(c, c * 1.7 + vec3(.07, .06, .05), clamp(wear, 0., 1.) * .55);
  return c;
}

// light on a height field (units), from finite differences
float lit(vec2 p, int ch, float r, float depth) {
  float e = max(.6 / scale, .25);
  float hx = blurred(p + vec2(e, 0), r)[ch] - blurred(p - vec2(e, 0), r)[ch];
  float hy = blurred(p + vec2(0, e), r)[ch] - blurred(p - vec2(0, e), r)[ch];
  vec3 n = normalize(vec3(-hx * depth / (2. * e), -hy * depth / (2. * e), 1.));
  return dot(n, L) / L.z;
}

// Turkish stone marbling: drops of colour floated on size, each pushed into a stone by the next,
// swirled a little before the sheet was laid on, and veined where they met
vec3 marble(vec2 p) {
  // drops landed thicker in some places than others, so the stones vary in size
  vec2 q = p / 13.;
  q *= 1. + .5 * (fbm(p / 60. + seed) - .5);
  q += 1.3 * (vec2(fbm(q * .7 + seed), fbm(q * .7 + seed + 5.2)) - .5);
  q.x *= .75;
  vec2 cell = floor(q);
  float f1 = 9., f2 = 9.;
  vec2 id = vec2(0.);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(i, j);
    vec2 o = c + .05 + .9 * h22(c + seed);
    float d = length(q - o);
    if (d < f1) { f2 = f1; f1 = d; id = c; } else if (d < f2) f2 = d;
  }
  float h = h21(id + seed);
  vec3 col = h < .42 ? vec3(.2, .25, .4) : h < .6 ? vec3(.71, .55, .3) : h < .73 ? vec3(.5, .2, .16) : h < .9 ? vec3(.84, .79, .67) : vec3(.34, .42, .39);
  // the colour gathers in a dark rim where the next drop pushed against it, and thins, streaked,
  // toward the middle of the stone
  float e = f2 - f1;
  col *= .78 + .3 * smoothstep(.02, .3, e);
  col = mix(col, col * 1.15 + .04, smoothstep(.1, .6, f1) * .5);
  col *= .92 + .16 * fbm(vec2(q.x * 9., q.y * 3.) + id * 3.);
  float vein = smoothstep(.006, .035, e + .015 * (vn(p / 1.2) - .5));
  col = mix(vec3(.12, .1, .1), col, .15 + .85 * vein);
  // a fine spray of black over everything
  float spray = step(.96, vn(p / .7 + seed * 4.)) * detail(.5);
  return mix(col, vec3(.1, .09, .1), spray * .6);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y) / scale;
  float H = res.y / scale;
  float sd = spineDist(p);
  vec3 c;

  if (material < .5) {
    c = paper(p, H);
    // the plate mark: the copper plate pressed a shallow well into the sheet
    float plate = blurred(p, .8).b;
    c *= 1. - .035 * plate;
    c *= mix(1., lit(p, 2, .9, -1.4), .35);
    // the other side of the leaf, through the paper
    if (hasBack > .5) {
      vec2 uv = uvOf(p);
      vec3 b = textureLod(back, vec2(1. - uv.x, uv.y), log2(max(.9 * scale, 1.))).rgb;
      c *= 1. - .018 * clamp(b.r + b.g, 0., 1.);
    }
    float a1 = printed(p, 0, vec2(0.));
    float a2 = printed(p, 1, vec2(.38, -.26));
    float grain = .9 + .1 * vn(p / .9 + seed);
    c *= mix(vec3(1.), ink1, a1 * .97 * grain);
    c *= mix(vec3(1.), ink2, a2 * .94 * grain);
    // the leaf bends down into the gutter
    c *= 1. - .2 * exp(-sd / 7.) - .07 * exp(-sd / 30.);
    c *= 1. + .025 * exp(-pow((sd - 26.) / 14., 2.));
  } else if (material < 1.5) {
    float thread;
    c = clothAt(p, H, thread);
    // blind stamping: pressed in and burnished darker
    float blind = blurred(p, .45).g;
    c *= 1. - .16 * blind;
    // light on everything pressed into the board
    float shade = lit(p, 0, .5, -2.2) * .6 + lit(p, 1, .5, -2.2) * .4;
    c *= clamp(1. + (shade - 1.) * .8, .5, 1.4);
    // gilt: gold leaf that took the weave of the cloth under it
    float g = printed(p, 0, vec2(0.)) * smoothstep(.12, .45, thread + .25 * vn(p / .5 + seed));
    float gl = lit(p, 0, .35, -2.6);
    float spec = pow(clamp(gl - .55, 0., 1.) * 2.2, 3.);
    vec3 gold = mix(vec3(.45, .32, .12), vec3(.92, .76, .42), clamp(.5 + .55 * (gl - 1.), 0., 1.));
    gold = gold * (.88 + .24 * vn(p / .35 + seed)) + vec3(1., .92, .7) * spec * .5;
    c = mix(c, gold, g * .96);
    // the hinge: a groove where the board meets the spine
    c *= 1. - .35 * exp(-pow((sd - 9.) / 1.3, 2.)) + .1 * exp(-pow((sd - 11.5) / 1.2, 2.));
    c *= 1. - .25 * exp(-sd / 2.);
  } else {
    vec3 m = marble(p);
    vec3 pc = paper(p, H);
    c = m * (.9 + .1 * pc / PAPER);
    // a bookplate pasted on, with its own shadow
    float label = texture(cov, uvOf(p)).g;
    float shadow = blurred(p + vec2(.7, 1.), 1.).g;
    c *= 1. - .25 * shadow * (1. - label);
    c = mix(c, pc, label);
    float ink = printed(p, 0, vec2(0.));
    c *= mix(vec3(1.), ink1, ink * .95 * label);
    // the cloth of the cover turned in over the edges of the board
    float turn = texture(cov, uvOf(p)).b;
    float thread;
    vec3 cl = clothAt(p, H, thread);
    float lip = blurred(p, .6).b;
    c *= 1. - .3 * smoothstep(0., 1., blurred(p + vec2(0., 0.), 1.4).b) * (1. - turn);
    c = mix(c, cl * (1. + .1 * (lip - 1.)), turn);
    c *= 1. - .22 * exp(-sd / 5.);
  }

  // cockling: the sheet isn't quite flat, and the light shows it
  float hc = fbm(p / 36. + seed * .1);
  float hx = fbm((p + vec2(2., 0.)) / 36. + seed * .1) - hc;
  float hy = fbm((p + vec2(0., 2.)) / 36. + seed * .1) - hc;
  c *= 1. + (-hx * L.x - hy * L.y) * .35;

  c += (h21(gl_FragCoord.xy + seed) - .5) / 255.;
  o = vec4(c, 1.);
}`;

let shared: Press | null | undefined;

/** The press for this browser, or null without WebGL2. */
export function press(): Press | null {
  if (shared === undefined) {
    try {
      shared = new Press();
    } catch {
      shared = null;
    }
  }
  return shared;
}

class Press {
  readonly canvas = document.createElement('canvas');
  #gl: WebGL2RenderingContext;
  #uniforms: Record<string, WebGLUniformLocation | null> = {};
  #textures: [WebGLTexture, WebGLTexture];

  constructor() {
    const gl = this.canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.#gl = gl;
    const program = gl.createProgram() as WebGLProgram;
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERT],
      [gl.FRAGMENT_SHADER, FRAG],
    ] as const) {
      const shader = gl.createShader(type) as WebGLShader;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
      }
      gl.attachShader(program, shader);
    }
    gl.bindAttribLocation(program, 0, 'a');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'program');
    }
    gl.useProgram(program);
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const name = (gl.getActiveUniform(program, i) as WebGLActiveInfo).name;
      this.#uniforms[name] = gl.getUniformLocation(program, name);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.#textures = [this.#texture(), this.#texture()];
    gl.uniform1i(this.#uniforms.cov as WebGLUniformLocation, 0);
    gl.uniform1i(this.#uniforms.back as WebGLUniformLocation, 1);
  }

  #texture(): WebGLTexture {
    const gl = this.#gl;
    const texture = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  #upload(unit: number, source: HTMLCanvasElement): void {
    const gl = this.#gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.#textures[unit] as WebGLTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  /** Prints `coverage` and draws the result into `out`, which must be the same size. */
  print(coverage: HTMLCanvasElement, out: CanvasRenderingContext2D, o: PrintOptions): void {
    const gl = this.#gl;
    const { width, height } = coverage;
    this.canvas.width = width;
    this.canvas.height = height;
    gl.viewport(0, 0, width, height);
    this.#upload(0, coverage);
    if (o.back) this.#upload(1, o.back);
    const u = this.#uniforms;
    const f = (name: string, ...v: number[]) => {
      const loc = u[name] ?? null;
      if (v.length === 1) gl.uniform1f(loc, v[0] as number);
      else if (v.length === 2) gl.uniform2f(loc, v[0] as number, v[1] as number);
      else gl.uniform3f(loc, v[0] as number, v[1] as number, v[2] as number);
    };
    f('res', width, height);
    f('scale', width / o.units);
    f('units', o.units);
    f('spine', o.spine);
    f('seed', (o.seed % 97) * 1.37);
    f('material', o.material === 'paper' ? 0 : o.material === 'cloth' ? 1 : 2);
    f('hasBack', o.back ? 1 : 0);
    f('ink1', ...linear(o.ink ?? '#1c1a18'));
    f('ink2', ...linear(o.ink2 ?? '#b2381f'));
    f('cloth', ...linear(o.cloth ?? '#1e2a45'));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    out.drawImage(this.canvas, 0, 0);
  }
}

function linear(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

import { type CurlMesh, VERTEX_FLOATS } from './geometry/mesh.js';

const VERTEX_SHADER = `
attribute vec2 aPos;
attribute vec2 aTex;
attribute vec4 aCol;
uniform vec2 uView;
uniform vec2 uOrigin;
uniform float uScale;
uniform vec2 uTexSize;
uniform float uFlip;
varying vec2 vTex;
varying vec2 vPage;
varying vec4 vCol;
void main() {
  vec2 p = uOrigin + aPos * uScale;
  vPage = aTex;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
  vec2 t = aTex / uTexSize;
  vTex = vec2(mix(t.x, 1.0 - t.x, uFlip), t.y);
  vCol = aCol;
}`;

// Modes: 0 = vertex colour, 1 = texture × colour, 2 = colour × texture alpha.
const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;
uniform int uMode;
uniform vec3 uCut;
varying vec2 vTex;
varying vec2 vPage;
varying vec4 vCol;
void main() {
  if (uMode == 1 && dot(uCut.xy, vPage) > uCut.z) discard;
  if (uMode == 0) {
    gl_FragColor = vCol;
  } else {
    vec4 t = texture2D(uTex, vTex);
    gl_FragColor = uMode == 1 ? t * vCol : vCol * t.a;
  }
}`;

export interface MeshView {
  /** Top-left of the page in canvas pixels. */
  x: number;
  y: number;
  /** Canvas pixels per mesh unit (CSS px). */
  scale: number;
  /** Page size in device pixels: the range of the mesh's texture coordinates. */
  textureWidth: number;
  textureHeight: number;
  /** Sample the texture mirrored horizontally. */
  flip: boolean;
  /**
   * Leaves out the textured parts where `x * cut[0] + y * cut[1] > cut[2]`, in CSS px of the
   * page, for a part of the page that is shown some other way.
   */
  cut?: readonly [number, number, number];
}

export type Gl = WebGLRenderingContext | WebGL2RenderingContext;

/** Draws curl meshes into a canvas with premultiplied alpha. */
export class Renderer {
  readonly gl: Gl;
  readonly maxTextureSize: number;
  readonly #program: WebGLProgram;
  readonly #buffer: WebGLBuffer;
  readonly #uniforms: Record<
    'view' | 'origin' | 'scale' | 'texSize' | 'flip' | 'tex' | 'mode' | 'cut',
    WebGLUniformLocation | null
  >;

  constructor(readonly canvas: HTMLCanvasElement) {
    const attrs: WebGLContextAttributes = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    };
    const gl = (canvas.getContext('webgl2', attrs) ??
      canvas.getContext('webgl', attrs)) as Gl | null;
    if (!gl) throw new Error('pagecurl: WebGL is not available');
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const program = gl.createProgram() as WebGLProgram;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.bindAttribLocation(program, 0, 'aPos');
    gl.bindAttribLocation(program, 1, 'aTex');
    gl.bindAttribLocation(program, 2, 'aCol');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`pagecurl: ${gl.getProgramInfoLog(program)}`);
    }
    this.#program = program;
    const u = (name: string) => gl.getUniformLocation(program, name);
    this.#uniforms = {
      view: u('uView'),
      origin: u('uOrigin'),
      scale: u('uScale'),
      texSize: u('uTexSize'),
      flip: u('uFlip'),
      tex: u('uTex'),
      mode: u('uMode'),
      cut: u('uCut'),
    };
    this.#buffer = gl.createBuffer() as WebGLBuffer;
  }

  get lost(): boolean {
    return this.gl.isContextLost();
  }

  resize(width: number, height: number): void {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  clear(): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  createTexture(source: TexImageSource): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  deleteTexture(texture: WebGLTexture): void {
    this.gl.deleteTexture(texture);
  }

  draw(mesh: CurlMesh, texture: WebGLTexture, view: MeshView): void {
    const gl = this.gl;
    const u = this.#uniforms;
    gl.useProgram(this.#program);
    gl.uniform2f(u.view, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.origin, view.x, view.y);
    gl.uniform1f(u.scale, view.scale);
    gl.uniform2f(u.texSize, view.textureWidth, view.textureHeight);
    gl.uniform1f(u.flip, view.flip ? 1 : 0);
    // The shader sees page positions in device px.
    const [ca, cb, cc] = view.cut ?? [0, 0, 1];
    gl.uniform3f(u.cut, ca / view.scale, cb / view.scale, cc);
    gl.uniform1i(u.tex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STREAM_DRAW);
    const stride = VERTEX_FLOATS * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    let mode = -1;
    for (const d of mesh.draws) {
      if (d.mode !== mode) {
        mode = d.mode;
        gl.uniform1i(u.mode, mode);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, d.first, d.count);
    }
  }

  destroy(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.#buffer);
    gl.deleteProgram(this.#program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

function compile(gl: Gl, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type) as WebGLShader;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`pagecurl: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

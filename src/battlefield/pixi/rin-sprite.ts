import { Mesh, MeshGeometry, Point, Shader, Texture, UniformGroup } from 'pixi.js';
import type { DestroyOptions } from 'pixi.js';

const vertex = `
  in vec2 aPosition;
  in vec2 aUV;
  out vec2 vUV;
  uniform mat3 uProjectionMatrix;
  uniform mat3 uWorldTransformMatrix;
  uniform mat3 uTransformMatrix;
  void main() {
    vUV = aUV;
    vec3 p = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.0);
    gl_Position = vec4(p.xy, 0.0, 1.0);
  }
`;
const fragment = `
  in vec2 vUV;
  out vec4 finalColor;
  uniform sampler2D uFrom;
  uniform sampler2D uTo;
  uniform float uMix;
  uniform vec4 uColor;
  void main() {
    finalColor = mix(texture(uFrom, vUV), texture(uTo, vUV), uMix) * uColor;
  }
`;

/**
 * 两张原画在同一个四边形中混合预乘 alpha，避免普通双 Sprite 淡化时身体闪暗。
 * 不加滤镜 / 离屏画布、不生成中间贴图，每帧只改混合系数和已有纹理引用。
 * 战场已显式使用 WebGL；着色器延迟到有浏览器上下文时创建。
 */
export class RinSprite extends Mesh<MeshGeometry, Shader> {
  readonly anchor = new Point();
  private readonly blendUniforms = new UniformGroup({ uMix: { value: 0, type: 'f32' } });
  private lastWidth = -1;
  private lastHeight = -1;
  private lastAnchorX = -1;
  private lastAnchorY = -1;
  private nextTexture = Texture.EMPTY;

  constructor() {
    super({
      texture: Texture.EMPTY,
      geometry: new MeshGeometry({
        positions: new Float32Array(8),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      }),
    });
  }

  setFrames(from: Texture, to: Texture = from, mix = 0): void {
    if (!this.shader) {
      this.shader = Shader.from({
        gl: { vertex, fragment, name: 'rin-frame-blend' },
        resources: {
          uFrom: from.source,
          uTo: to.source,
          blendUniforms: this.blendUniforms,
        },
      });
    }
    this.texture = from;
    this.nextTexture = to;
    this.shader.resources.uFrom = from.source;
    this.shader.resources.uTo = to.source;
    this.blendUniforms.uniforms.uMix = mix;
    const { width, height } = from;
    if (
      width !== this.lastWidth ||
      height !== this.lastHeight ||
      this.anchor.x !== this.lastAnchorX ||
      this.anchor.y !== this.lastAnchorY
    ) {
      const x = -this.anchor.x * width;
      const y = -this.anchor.y * height;
      const p = this.geometry.positions;
      p[0] = x;
      p[1] = y;
      p[2] = x + width;
      p[3] = y;
      p[4] = x + width;
      p[5] = y + height;
      p[6] = x;
      p[7] = y + height;
      this.geometry.getBuffer('aPosition').update();
      this.lastWidth = width;
      this.lastHeight = height;
      this.lastAnchorX = this.anchor.x;
      this.lastAnchorY = this.anchor.y;
    }
  }

  copyFrames(other: RinSprite): void {
    this.setFrames(other.texture, other.nextTexture, other.blendUniforms.uniforms.uMix);
  }

  override destroy(options?: DestroyOptions): void {
    const shader = this.shader;
    const geometry = this.geometry;
    super.destroy(options);
    // 程序由 Pixi 缓存共享，不随某个分身销毁；本实例的绑定和几何独立释放。
    shader?.destroy();
    geometry.destroy();
  }
}

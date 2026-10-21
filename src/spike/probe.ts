/**
 * Phase 0 Spike —— 验证四件事，全部在最终产物（单文件、file:// 打开）里成立才算通过：
 *   1. PixiJS v8 能在 file:// 下初始化 WebGL 渲染器
 *   2. localStorage 可读可写（最高分记录依赖它）
 *   3. 画面确实渲染出了东西（截图人工确认）
 *   4. 没有任何外部资源请求（产物自包含）
 */
import { Application, Graphics } from 'pixi.js';

export interface SpikeResult {
  webgl: boolean;
  rendererType: string;
  canvasWidth: number;
  canvasHeight: number;
  localStorage: boolean;
  drawn: boolean;
  errors: string[];
  userAgent: string;
}

declare global {
  interface Window {
    __SPIKE__?: SpikeResult;
  }
}

function probeLocalStorage(errors: string[]): boolean {
  try {
    const key = '__spike_probe__';
    localStorage.setItem(key, 'ok');
    const readBack = localStorage.getItem(key);
    localStorage.removeItem(key);
    return readBack === 'ok';
  } catch (err) {
    errors.push(`localStorage: ${String(err)}`);
    return false;
  }
}

export async function runSpike(host: HTMLElement): Promise<SpikeResult> {
  const errors: string[] = [];
  const localStorageOk = probeLocalStorage(errors);

  let webgl = false;
  let rendererType = 'none';
  let drawn = false;
  let canvasWidth = 0;
  let canvasHeight = 0;

  try {
    const app = new Application();
    await app.init({
      // 显式指定 webgl：Pixi v8 默认会尝试 WebGPU，而 WebGPU 对非安全上下文更挑剔，
      // file:// 打开时必须锁死 WebGL 路径。
      preference: 'webgl',
      antialias: true,
      background: 0x0b0e18,
      width: Math.max(host.clientWidth, 320),
      height: Math.max(host.clientHeight, 200),
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });

    host.appendChild(app.canvas);
    canvasWidth = app.canvas.width;
    canvasHeight = app.canvas.height;

    const renderer = app.renderer as unknown as { type?: number; name?: string };
    // Pixi v8 的 RendererType 是数值枚举：WEBGL=1, WEBGPU=2, BOTH=3, CANVAS=4
    const RENDERER_NAMES: Record<number, string> = {
      1: 'webgl',
      2: 'webgpu',
      3: 'webgl-or-webgpu',
      4: 'canvas',
    };
    rendererType =
      typeof renderer.type === 'number'
        ? (RENDERER_NAMES[renderer.type] ?? `unknown(${renderer.type})`)
        : (renderer.name ?? 'unknown');
    webgl = rendererType === 'webgl';

    // 画一个确定性的图案：左上金圆、右上粉圆、底部轨道横条
    const g = new Graphics();
    g.circle(70, 70, 38).fill(0xffd24a);
    g.circle(160, 70, 38).fill(0xff5ecb);
    g.rect(20, 140, 200, 8).fill(0x4fd1ff);
    app.stage.addChild(g);
    app.render();

    // 确认画面不是空的：读取画布中心像素
    const scratch = document.createElement('canvas');
    scratch.width = app.canvas.width;
    scratch.height = app.canvas.height;
    const sctx = scratch.getContext('2d');
    if (sctx) {
      sctx.drawImage(app.canvas, 0, 0);
      const px = sctx.getImageData(
        Math.floor(scratch.width / 2),
        Math.floor(scratch.height / 2),
        1,
        1,
      ).data;
      drawn = (px[3] ?? 0) > 0;
    }
  } catch (err) {
    errors.push(`pixi: ${String(err)}`);
  }

  const result: SpikeResult = {
    webgl,
    rendererType,
    canvasWidth,
    canvasHeight,
    localStorage: localStorageOk,
    drawn,
    errors,
    userAgent: navigator.userAgent,
  };

  window.__SPIKE__ = result;
  return result;
}

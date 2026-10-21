/**
 * 横竖屏 / 切后台的单测。
 *
 * 对照旧实现 `source.html:500-531`（横竖屏）与 `2658-2660`（切后台）。
 */

import { describe, expect, it } from 'vitest';

import { attachOrientationWatcher, detectLandscape } from '../orientation';
import { FakeWindow } from './fakes';

describe('横竖屏判定', () => {
  it('媒体查询命中 → 横屏', () => {
    const win = new FakeWindow({ matches: true });
    expect(detectLandscape(win as unknown as Window)).toBe(true);
  });

  it('宽 > 高 → 横屏', () => {
    const win = new FakeWindow({ innerWidth: 800, innerHeight: 400 });
    expect(detectLandscape(win as unknown as Window)).toBe(true);
  });

  it('screen.orientation.type 命中 → 横屏', () => {
    const win = new FakeWindow({ innerWidth: 400, innerHeight: 800, orientationType: 'landscape-primary' });
    expect(detectLandscape(win as unknown as Window)).toBe(true);
  });

  it('三者都不命中 → 竖屏', () => {
    const win = new FakeWindow({ innerWidth: 400, innerHeight: 800 });
    expect(detectLandscape(win as unknown as Window)).toBe(false);
  });
});

describe('横竖屏监听', () => {
  it('转到竖屏 → 暂停', () => {
    const win = new FakeWindow({ innerWidth: 800, innerHeight: 400, matches: true });
    let running = true;
    let paused = 0;
    let resumed = 0;
    const detach = attachOrientationWatcher({
      isRunning: () => running,
      isPaused: () => paused > 0,
      pause: () => {
        paused += 1;
        running = false;
      },
      resume: () => {
        resumed += 1;
        running = true;
      },
      win: win as unknown as Window,
    });

    // 转竖屏
    win.innerWidth = 400;
    win.innerHeight = 800;
    win.media.setMatches(false);
    win.dispatch('resize', {});

    expect(paused).toBe(1);
    expect(resumed).toBe(0);
    detach();
  });

  it('因竖屏暂停 → 转回横屏自动恢复', () => {
    const win = new FakeWindow({ innerWidth: 800, innerHeight: 400, matches: true });
    let running = true;
    let paused = 0;
    let resumed = 0;
    const detach = attachOrientationWatcher({
      isRunning: () => running,
      isPaused: () => paused > 0 && resumed === 0,
      pause: () => {
        paused += 1;
        running = false;
      },
      resume: () => {
        resumed += 1;
        running = true;
      },
      win: win as unknown as Window,
    });

    win.innerWidth = 400;
    win.innerHeight = 800;
    win.media.setMatches(false);
    win.dispatch('resize', {});
    expect(paused).toBe(1);

    win.innerWidth = 800;
    win.innerHeight = 400;
    win.media.setMatches(true);
    win.dispatch('resize', {});

    expect(resumed).toBe(1);
    detach();
  });

  it('玩家手动暂停的，转回横屏不会被自动恢复', () => {
    const win = new FakeWindow({ innerWidth: 800, innerHeight: 400, matches: true });
    let resumed = 0;
    const detach = attachOrientationWatcher({
      isRunning: () => false,
      isPaused: () => true,
      pause: () => undefined,
      resume: () => {
        resumed += 1;
      },
      win: win as unknown as Window,
    });

    win.innerWidth = 400;
    win.innerHeight = 800;
    win.media.setMatches(false);
    win.dispatch('resize', {});
    win.innerWidth = 800;
    win.innerHeight = 400;
    win.media.setMatches(true);
    win.dispatch('resize', {});

    expect(resumed).toBe(0);
    detach();
  });

  it('切后台（visibilitychange + hidden）→ 暂停', () => {
    const win = new FakeWindow({ innerWidth: 800, innerHeight: 400, matches: true });
    let paused = 0;
    const detach = attachOrientationWatcher({
      isRunning: () => true,
      isPaused: () => false,
      pause: () => {
        paused += 1;
      },
      resume: () => undefined,
      win: win as unknown as Window,
    });

    win.hidden = true;
    win.documentTarget.dispatch('visibilitychange', {});

    expect(paused).toBe(1);
    detach();
  });
});

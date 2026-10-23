/**
 * 角色系统 —— 端到端验收。
 *
 * 覆盖：
 *   1. 主页面角色入口 / 角色屏两张卡 / 选中态
 *   2. 选凛 → 下一局 125 / 250，选择写入 localStorage，刷新后仍生效
 *   3. 燃魂：满血 250、标签「燃魂 ×2」、HUD 紫红态、持续烧血、退出回到 125
 *   4. 切回哲 → 300 / 300
 *
 * 燃魂用 `?debug` 的 `__FX_DEBUG__.burn()` 强制进入 / 退出 —— 正常局要打满
 * 25 次命中才能触发，不适合放进 e2e；规则本身的回血 / 计分时序由单测覆盖。
 */

import {
  assert,
  launchBrowser,
  openApp,
  readHud,
  readMenuRoute,
  readPhase,
  shot,
  strike,
} from './lib/harness.mjs';

const browser = await launchBrowser();
const { page, pageErrors } = await openApp(browser, { query: '?debug' });

/** 读角色选择持久化值。 */
function storedCharacter() {
  return page.evaluate(() => {
    try {
      return globalThis.localStorage.getItem('dualrail_character');
    } catch {
      return null;
    }
  });
}

/** 主页面角色入口文案。 */
function characterButtonText() {
  return page.locator('#btnCharacter').textContent();
}

await (async () => {
  try {
    // ── 1. 主页面 → 角色屏 ──────────────────────────────────
    console.log('── 1. 主页面角色入口 ──');
    assert((await readPhase(page)) === 'idle', '开机处于 idle');
    assert((await readMenuRoute(page)) === 'home', '开机停在主页面');
    assert(
      (await characterButtonText())?.includes('哲'),
      `角色入口显示当前角色哲（「${await characterButtonText()}」）`,
    );
    assert((await storedCharacter()) === null, '首次进入没有写角色存档');

    await page.locator('#btnCharacter').click();
    await page.waitForTimeout(150);
    assert((await readMenuRoute(page)) === 'characters', '进入角色屏');
    assert((await readPhase(page)) === 'idle', '角色屏不会开始游戏');
    assert((await page.locator('#characterScreen .char-row').count()) === 2, '角色屏有两张角色卡');
    assert(
      (await page
        .locator('#characterScreen .char-row[data-character="zhe"]')
        .getAttribute('aria-checked')) === 'true',
      '默认选中哲',
    );
    assert(
      (await page
        .locator('#characterScreen .char-row[data-character="zhe"] .char-weapon')
        .textContent()) === '球棒',
      '哲的武器是球棒',
    );
    assert(
      (await page
        .locator('#characterScreen .char-row[data-character="rin"] .char-weapon')
        .textContent()) === '镰刀',
      '凛的武器是镰刀',
    );

    // 键盘上下也能换人（与难度屏同一套菜单导航）。
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(120);
    assert(
      (await page
        .locator('#characterScreen .char-row[data-character="rin"]')
        .getAttribute('aria-checked')) === 'true',
      '方向键下移到凛',
    );
    assert((await storedCharacter()) === 'rin', '键盘选人同样即时保存');
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(120);
    assert(
      (await page
        .locator('#characterScreen .char-row[data-character="zhe"]')
        .getAttribute('aria-checked')) === 'true',
      '方向键上移回哲',
    );
    await shot(page, 'char-1-select.png');

    // ── 2. 选凛 → 保存并回主页面 ────────────────────────────
    console.log('── 2. 选择凛 ──');
    await page.locator('#characterScreen .char-row[data-character="rin"]').click();
    await page.waitForTimeout(200);
    assert((await readMenuRoute(page)) === 'home', '选完角色回主页面');
    assert((await characterButtonText())?.includes('凛'), '主页面入口切换到凛');
    assert((await storedCharacter()) === 'rin', '选择写入 localStorage["dualrail_character"]');

    // ── 3. 凛开局：125 / 250 ───────────────────────────────
    console.log('── 3. 凛开局 ──');
    await page.locator('#startScreen h2').click();
    await page.waitForTimeout(300);
    assert((await readPhase(page)) === 'running', '进入游戏');
    let hud = await readHud(page);
    assert(hud.hp === 125 && hud.maxHp === 250, `凛开局 125 / 250（${hud.hpText}）`);
    assert(hud.comboLabel === 'COMBO', '未燃魂时标签是 COMBO');
    await strike(page, 'top');
    await page.waitForTimeout(120);
    await shot(page, 'char-2-rin-start.png');

    // ── 4. 燃魂：满血 / 紫红 HUD / 持续烧血 / 退出 ──────────
    console.log('── 4. 燃魂 ──');
    await page.evaluate(() => globalThis.__FX_DEBUG__?.burn(true));
    await page.waitForFunction(
      () => globalThis.document.querySelector('#comboLabel')?.textContent === '燃魂 ×2',
      undefined,
      { timeout: 5_000 },
    );
    hud = await readHud(page);
    assert(hud.hp === 250 && hud.maxHp === 250, `燃魂从满血开始（${hud.hpText}）`);
    assert(
      (await page.locator('#comboLabel').getAttribute('class'))?.includes('burning'),
      '连击标签进入紫红燃魂态',
    );
    assert(
      (await page.locator('#scoreText').getAttribute('class'))?.includes('burning'),
      '分数进入紫红燃魂态',
    );
    await shot(page, 'char-3-burn.png');

    const hpAtBurnStart = hud.hp;
    await page.waitForTimeout(1200);
    hud = await readHud(page);
    assert(hud.hp < hpAtBurnStart, `燃魂持续烧血（${hpAtBurnStart} → ${hud.hpText}）`);
    assert((await readPhase(page)) === 'running', '燃魂期间游戏仍在运行');

    await page.evaluate(() => globalThis.__FX_DEBUG__?.burn(false));
    await page.waitForFunction(
      () => globalThis.document.querySelector('#comboLabel')?.textContent === 'COMBO',
      undefined,
      { timeout: 5_000 },
    );
    hud = await readHud(page);
    assert(hud.hp === 125 && hud.maxHp === 250, `退出燃魂回到下限 125（${hud.hpText}）`);
    assert(
      !(await page.locator('#comboLabel').getAttribute('class'))?.includes('burning'),
      '退出燃魂后连击标签恢复',
    );
    await shot(page, 'char-4-burn-end.png');

    // ── 5. 刷新后选择仍生效 ────────────────────────────────
    console.log('── 5. 刷新持久化 ──');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.canvas-host canvas', { timeout: 20_000 });
    await page.waitForTimeout(200);
    assert((await readMenuRoute(page)) === 'home', '刷新后回主页面');
    assert((await storedCharacter()) === 'rin', '刷新后仍是凛');
    assert((await characterButtonText())?.includes('凛'), '主页面入口仍是凛');

    await page.locator('#startScreen h2').click();
    await page.waitForTimeout(300);
    hud = await readHud(page);
    assert(hud.hp === 125 && hud.maxHp === 250, `刷新后新局仍是 125 / 250（${hud.hpText}）`);

    // ── 6. 切回哲 → 300 / 300 ─────────────────────────────
    console.log('── 6. 切回哲 ──');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.canvas-host canvas', { timeout: 20_000 });
    await page.locator('#btnCharacter').click();
    await page.waitForTimeout(150);
    await page.locator('#characterScreen .char-row[data-character="zhe"]').click();
    await page.waitForTimeout(200);
    assert((await storedCharacter()) === 'zhe', '选择写回哲');

    await page.locator('#startScreen h2').click();
    await page.waitForTimeout(300);
    hud = await readHud(page);
    assert(hud.hp === 300 && hud.maxHp === 300, `哲开局 300 / 300（${hud.hpText}）`);
    await shot(page, 'char-5-zhe-start.png');

    assert(pageErrors.length === 0, `没有页面异常（${pageErrors.join(' / ')}）`);
  } finally {
    await browser.close();
  }
})();

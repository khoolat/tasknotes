import { test, expect } from '@playwright/test';
import { launchObsidian, closeObsidian, ObsidianApp } from './obsidian';

let app: ObsidianApp;
test.beforeAll(async () => { app = await launchObsidian(); });
test.afterAll(async () => { if (app) await closeObsidian(app); });

test('timer fits narrow and short Obsidian panes without clipped controls', async () => {
  const page = app.page;
  await page.evaluate(async () => {
    const plugin = (window as any).app.plugins.plugins.tasknotes;
    await plugin.pomodoroService.stopPomodoro();
    await plugin.activatePomodoroView();
    const view = (window as any).app.workspace.getLeavesOfType('tasknotes-pomodoro-view')[0].view;
    await view.restoreLastSelectedTask();
    await view.selectTask(null);
  });
  const root = page.locator('.pomodoro-view').last();
  for (const [width, height] of [[600, 700], [420, 600], [320, 550], [240, 500], [600, 320]]) {
    await page.evaluate(({ width, height }) => {
      const view = (window as any).app.workspace.getLeavesOfType('tasknotes-pomodoro-view')[0].view;
      Object.assign(view.contentEl.style, { width: `${width}px`, maxWidth: `${width}px`, height: `${height}px`, maxHeight: `${height}px`, flex: '0 0 auto' });
      view.onResize();
    }, { width, height });
    await expect.poll(() => root.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBeLessThanOrEqual(width);
    const layout = await root.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const timer = el.querySelector('.pomodoro-view__timer-display')!;
      const range = document.createRange(); range.selectNodeContents(timer);
      return {
        overflow: el.scrollWidth - el.clientWidth,
        outerOverflow: el.parentElement!.scrollHeight - el.parentElement!.clientHeight,
        timerFits: range.getBoundingClientRect().width <= timer.getBoundingClientRect().width + 1,
        tabLabelsFit: [...el.querySelectorAll('.pomodoro-view__session-tab')].every(button => {
          const r = button.getBoundingClientRect();
          const label = button.querySelector('.pomodoro-view__button-label')!.getBoundingClientRect();
          return label.left >= r.left - 1 && label.right <= r.right + 1 && label.top >= r.top - 1 && label.bottom <= r.bottom + 1;
        }),
        controlsFit: [...el.querySelectorAll('.pomodoro-view__primary-controls button')].filter(button => getComputedStyle(button).display !== 'none').every(button => {
          const r = button.getBoundingClientRect(); return r.left >= bounds.left && r.right <= bounds.right;
        }),
      };
    });
    console.log(`${width}x${height}`, layout);
    expect.soft(layout.overflow, `${width}px horizontal overflow`).toBeLessThanOrEqual(1);
    expect.soft(layout.outerOverflow, `${width}px nested scrolling`).toBeLessThanOrEqual(1);
    expect.soft(layout.timerFits, `${width}px timer digits`).toBe(true);
    expect.soft(layout.tabLabelsFit, `${width}px mode labels`).toBe(true);
    expect.soft(layout.controlsFit, `${width}px controls`).toBe(true);
    await root.evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `test-results/pomodoro-responsive-${width}x${height}.png` });
    await root.locator('.pomodoro-view__stats-button').scrollIntoViewIfNeeded();
    await expect(root.locator('.pomodoro-view__stats-button')).toBeInViewport();
    if (width === 240) {
      const start = root.locator('.pomodoro-view__start-button');
      await start.click();
      const pause = root.locator('.pomodoro-view__pause-button');
      await expect(pause).toBeVisible();
      const pauseWidth = (await pause.boundingBox())!.width;
      await pause.click();
      expect((await start.boundingBox())!.width).toBeCloseTo(pauseWidth, 1);
      await root.locator('.pomodoro-view__task-select-button').click();
      await page.locator('.suggestion-item').first().click();
      await expect(root.locator('.pomodoro-view__task-clear-button')).toBeVisible();
      expect.soft(await root.evaluate(el => el.scrollWidth - el.clientWidth), 'selected task at 240px').toBeLessThanOrEqual(1);
      await root.locator('.pomodoro-view__stats-button').scrollIntoViewIfNeeded();
      await expect(root.locator('.pomodoro-view__stats-button')).toBeInViewport();
      await root.locator('.pomodoro-view__task-clear-button').click();
      await root.locator('.pomodoro-view__stop-button').click();
    }
  }
});

import { test, expect } from '@playwright/test';
import { launchObsidian, closeObsidian, ObsidianApp } from './obsidian';

let app: ObsidianApp;
test.beforeAll(async () => { app = await launchObsidian(); });
test.afterAll(async () => { if (app) await closeObsidian(app); });

test('tabs remain usable and aligned with a paused session and selected task', async () => {
  const page = app.page;
  await page.evaluate(async () => {
    const plugin = (window as any).app.plugins.plugins.tasknotes;
    await plugin.pomodoroService.stopPomodoro();
    await plugin.pomodoroService.saveLastSelectedTask(undefined);
    await plugin.activatePomodoroView();
  });
  const root = page.locator('.pomodoro-view').last();
  const clear = root.locator('.pomodoro-view__task-clear-button');
  if (await clear.isVisible()) await clear.click();
  const tabs = root.locator('.pomodoro-view__session-tabs');
  const topBefore = (await tabs.boundingBox())!.y;
  const timerBefore = (await root.locator('.pomodoro-view__progress-container').boundingBox())!.y;
  await root.locator('.pomodoro-view__start-button').click();
  await page.waitForTimeout(1100);
  await root.locator('.pomodoro-view__pause-button').click();
  const pausedId = await page.evaluate(() => (window as any).app.plugins.plugins.tasknotes.pomodoroService.getState().currentSession.id);
  await expect.soft(root.locator('.pomodoro-view__session-tab').nth(1)).toBeEnabled();
  const select = root.locator('.pomodoro-view__task-select-button');
  await select.click();
  await page.locator('.suggestion-item').first().click();
  await expect(clear).toBeVisible();
  expect.soft((await tabs.boundingBox())!.y).toBeCloseTo(topBefore, 0);
  expect.soft((await root.locator('.pomodoro-view__progress-container').boundingBox())!.y).toBeCloseTo(timerBefore, 0);
  const buttons = await Promise.all([select.boundingBox(), clear.boundingBox()]);
  expect.soft(buttons[0]!.height).toBeCloseTo(buttons[1]!.height, 1);
  expect.soft(buttons[0]!.width).toBeCloseTo(buttons[1]!.width, 1);
  for (const theme of ['theme-light', 'theme-dark']) {
    await page.evaluate(theme => {
      document.body.classList.remove('theme-light', 'theme-dark');
      document.body.classList.add(theme);
    }, theme);
    const head = await root.locator('[data-icon="tasknotes-long-break"] svg').evaluate(el => ({
      fill: getComputedStyle(el.querySelector('circle')!).fill,
      bodyStroke: getComputedStyle(el.querySelector('path')!).stroke,
    }));
    expect.soft(head.fill).toBe(head.bodyStroke);
    await page.screenshot({ path: `test-results/pomodoro-tabs-${theme}.png` });
  }
  {
    await root.locator('.pomodoro-view__session-tab').nth(1).click();
    await expect(root.locator('.pomodoro-view__timer-display')).toHaveText('05:00');
    await expect(root.locator('.pomodoro-view__session-tab').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(root.locator('.pomodoro-view__task-clear-button')).toBeVisible();
    const history = await page.evaluate(async id => {
      const service = (window as any).app.plugins.plugins.tasknotes.pomodoroService;
      return (await service.getSessionHistory()).find((session: any) => session.id === id);
    }, pausedId);
    expect(history).toBeDefined();
    expect(history.completed).toBe(false);
    await root.locator('.pomodoro-view__start-button').click();
    await expect(root.locator('.pomodoro-view__pause-button')).toBeVisible();
    await expect(root.locator('.pomodoro-view__session-tab').nth(2)).toBeDisabled();
    const runningId = await page.evaluate(() => (window as any).app.plugins.plugins.tasknotes.pomodoroService.getState().currentSession.id);
    await page.evaluate(async () => {
      await (window as any).app.workspace.getLeavesOfType('tasknotes-pomodoro-view')[0].view.switchSessionType('long-break');
    });
    expect(await page.evaluate(() => (window as any).app.plugins.plugins.tasknotes.pomodoroService.getState().currentSession.id)).toBe(runningId);
    await expect(root.locator('.pomodoro-view__session-tab').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await root.locator('.pomodoro-view__pause-button').click();
    await expect(root.locator('.pomodoro-view__session-tab').nth(2)).toBeEnabled();
    await root.locator('.pomodoro-view__session-tab').nth(2).click();
    await expect(root.locator('.pomodoro-view__timer-display')).toHaveText('15:00');
    await root.locator('.pomodoro-view__add-time').click();
    await root.locator('.pomodoro-view__session-tab').nth(2).click();
    await expect(root.locator('.pomodoro-view__timer-display')).toHaveText('16:00');
  }
});

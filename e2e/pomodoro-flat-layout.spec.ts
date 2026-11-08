import { test, expect } from '@playwright/test';
import { launchObsidian, closeObsidian, ObsidianApp } from './obsidian';

let app: ObsidianApp;
test.beforeAll(async () => { app = await launchObsidian(); });
test.afterAll(async () => { if (app) await closeObsidian(app); });

test('flat timer follows theme, keeps action width and opens statistics', async () => {
  const page = app.page;
  await page.evaluate(async () => {
    const plugin = (window as any).app.plugins.plugins.tasknotes;
    await plugin.pomodoroService.stopPomodoro();
    await plugin.activatePomodoroView();
  });
  const root = page.locator('.pomodoro-view').last();
  await expect(root.locator('.pomodoro-view__task-select-button [data-icon="square-plus"] svg')).toHaveCount(1);
  await expect(root.locator('.pomodoro-view__session-tab')).toHaveCount(3);
  await root.locator('.pomodoro-view__session-tab').nth(1).click();
  await expect(root.locator('.pomodoro-view__timer-display')).toHaveText('05:00');
  await root.locator('.pomodoro-view__add-time').click();
  await root.locator('.pomodoro-view__start-button').click();
  await expect(root.locator('.pomodoro-view__pause-button')).toBeVisible();
  expect(await page.evaluate(() => (window as any).app.plugins.plugins.tasknotes.pomodoroService.getState().currentSession.plannedDuration)).toBe(6);
  await root.locator('.pomodoro-view__stop-button').click();
  await expect(root.locator('.pomodoro-view__timer-display')).toHaveText('05:00');
  await root.locator('.pomodoro-view__session-tab').nth(2).click();
  await expect(root.locator('[data-icon="tasknotes-long-break"] svg')).toHaveCount(1);
  await expect(root.locator('.pomodoro-view__timer-display')).toHaveText('15:00');
  await root.locator('.pomodoro-view__session-tab').first().click();
  await root.locator('.pomodoro-view__add-time').click();
  await expect(root.locator('.pomodoro-view__timer-display')).toHaveText('26:00');
  await root.locator('.pomodoro-view__subtract-time').click();
  await root.locator('.pomodoro-view__start-button').click();
  const pause = root.locator('.pomodoro-view__pause-button');
  await expect(pause).toBeVisible();
  const pauseWidth = (await pause.boundingBox())!.width;
  await expect(root.locator('.pomodoro-view__session-tab').first()).toBeDisabled();
  await pause.click();
  const resume = root.locator('.pomodoro-view__start-button');
  await expect(resume).toBeVisible();
  expect((await resume.boundingBox())!.width).toBeCloseTo(pauseWidth, 1);
  await expect(root.locator('.pomodoro-view__start-button [data-icon="play"] svg')).toHaveCount(1);
  await resume.click();
  await expect(pause).toBeVisible();
  expect((await pause.boundingBox())!.width).toBeCloseTo(pauseWidth, 1);
  await root.locator('.pomodoro-view__stop-button').click();
  await expect(root.locator('.pomodoro-view__timer-display')).toHaveText('25:00');
  for (const theme of ['theme-light', 'theme-dark']) {
    await page.evaluate(theme => {
      document.body.classList.remove('theme-light', 'theme-dark');
      document.body.classList.add(theme);
    }, theme);
    const colors = await root.evaluate(el => {
      const timer = getComputedStyle(el.querySelector('.pomodoro-view__timer-display')!);
      const host = getComputedStyle(document.body);
      return { text: timer.color, host: host.getPropertyValue('--text-normal').trim(), animation: timer.animationName };
    });
    expect(colors.animation).toBe('none');
    const button = root.locator('.pomodoro-view__stats-button');
    await button.hover();
    const hover = await button.evaluate(el => getComputedStyle(el).backgroundColor);
    await root.locator('.pomodoro-view__task-select-button').hover();
    expect(await root.locator('.pomodoro-view__task-select-button').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(hover);
    await page.screenshot({ path: `test-results/pomodoro-flat-${theme}.png` });
  }
  await root.locator('.pomodoro-view__stats-button').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.pomodoro-stats-view').last()).toBeVisible();
});

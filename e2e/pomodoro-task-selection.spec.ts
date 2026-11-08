import { test, expect } from '@playwright/test';
import { launchObsidian, closeObsidian, ObsidianApp } from './obsidian';

let app: ObsidianApp;
test.beforeAll(async () => { app = await launchObsidian(); });
test.afterAll(async () => { if (app) await closeObsidian(app); });

test('can select, clear, cancel and reopen Pomodoro task selection', async () => {
  const page = app.page;
  page.on('pageerror', error => console.log('RENDERER ERROR:', error.message));
  await page.evaluate(async () => {
    const plugin = (window as any).app.plugins.plugins.tasknotes;
    await plugin.pomodoroService.stopPomodoro();
    await plugin.pomodoroService.startPomodoro();
    await plugin.pomodoroService.pausePomodoro();
    await plugin.activatePomodoroView();
  });
  const root = page.locator('.pomodoro-view').last();
  await root.locator('.pomodoro-view__task-select-button').click();
  await expect(page.locator('.prompt-input')).toBeVisible();
  await expect(page.locator('.suggestion-item').first()).toBeVisible();
  console.log('Step 1: selector opened', new Date().toISOString());
  await page.locator('.suggestion-item').first().click();
  await expect(page.locator('.prompt-input')).toHaveCount(0);
  await expect(root.locator('.pomodoro-view__task-clear-button')).toBeVisible();
  console.log('Step 2: task selected', new Date().toISOString());
  await root.locator('.pomodoro-view__task-clear-button').click();
  await expect(root.locator('.pomodoro-view__task-clear-button')).toBeHidden();
  console.log('Step 3: task cleared', new Date().toISOString());
  await root.locator('.pomodoro-view__task-select-button').click();
  await expect(page.locator('.prompt-input')).toBeVisible();
  console.log('Step 4: selector reopened after clear', new Date().toISOString());
  await page.keyboard.press('Escape');
  await expect(page.locator('.prompt-input')).toHaveCount(0);
  console.log('Step 5: selection cancelled', new Date().toISOString());
  await root.locator('.pomodoro-view__task-select-button').click();
  await expect(page.locator('.prompt-input')).toBeVisible();
  console.log('Step 6: selector reopened after cancellation', new Date().toISOString());
  await page.locator('.suggestion-item').first().click();
  await expect(root.locator('.pomodoro-view__task-clear-button')).toBeVisible();
  await root.locator('.pomodoro-view__task-select-button').click();
  await expect(page.locator('.prompt-input')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.prompt-input')).toHaveCount(0);
  await expect(root.locator('.pomodoro-view__task-clear-button')).toBeVisible();
});

test('recovers the observed stale picker flag when no dialog exists', async () => {
  const page = app.page;
  await page.evaluate(async () => {
    const plugin = (window as any).app.plugins.plugins.tasknotes;
    await plugin.activatePomodoroView();
    const view = (window as any).app.workspace.getLeavesOfType('tasknotes-pomodoro-view')[0].view;
    // This is the exact state observed in the user's isolated preview:
    // selector marked open, but no picker/dialog remains in the document.
    view.isTaskSelectorOpen = true;
  });
  await expect(page.locator('.prompt-input')).toHaveCount(0);
  await page.locator('.pomodoro-view__task-select-button').last().click();
  await expect(page.locator('.prompt-input')).toBeVisible();
  await page.keyboard.press('Escape');
});

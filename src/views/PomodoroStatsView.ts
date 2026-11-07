import { uiNumber, uiDuration } from "../i18n/formatters";
import { uiLocale } from "../i18n/runtime";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { ItemView, Menu, Notice, WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import TaskNotesPlugin from "../main";
import {
	POMODORO_STATS_VIEW_TYPE, PomodoroSessionHistory,
	EVENT_POMODORO_COMPLETE, EVENT_POMODORO_INTERRUPT, EVENT_TASK_UPDATED,
} from "../types";
import { showConfirmationModal } from "../modals/ConfirmationModal";
import { getTodayLocal, createUTCDateFromLocalCalendarDate } from "../utils/dateUtils";
import { getSessionDuration } from "../utils/pomodoroUtils";
import { getPomodoroSessionTaskPaths, sortPomodoroSessions } from "../utils/pomodoroStats";
import { formatPomodoroHistoryDate, getPomodoroDashboardSummary, PomodoroStatsPeriod } from "../utils/pomodoroDashboard";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";

const tasknotesLogger = createTaskNotesLogger({ tag: "Views/PomodoroStatsView" });

export class PomodoroStatsView extends ItemView {
	plugin: TaskNotesPlugin;
	private period: PomodoroStatsPeriod = "today";
	private metricsEl: HTMLElement | null = null;
	private recentSessionsEl: HTMLElement | null = null;
	private periodButtons = new Map<PomodoroStatsPeriod, HTMLButtonElement>();
	private periodTabsEl: HTMLElement | null = null;
	private periodTabsResizeObserver: ResizeObserver | null = null;
	private periodIndicatorInitialized = false;
	private refreshVersion = 0;
	private cleanupListeners: (() => void)[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: TaskNotesPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return POMODORO_STATS_VIEW_TYPE; }
	getDisplayText(): string {
		return this.t(msg({ message: "Pomodoro stats", context: "views.pomodoroStats.title" }));
	}
	getIcon(): string { return "bar-chart"; }
	private t(key: MessageDescriptor, params?: Record<string, string | number>): string {
		return this.plugin.i18n.translate(key, params);
	}

	async onOpen() {
		await this.plugin.onReady();
		await this.waitForPomodoroService();
		for (const event of [EVENT_POMODORO_COMPLETE, EVENT_POMODORO_INTERRUPT, EVENT_TASK_UPDATED] as const) {
			const ref = this.plugin.emitter.on(event, () => { void this.refreshStats(); });
			this.cleanupListeners.push(() => this.plugin.emitter.offref(ref));
		}
		await this.render();
	}

	async onClose() {
		this.refreshVersion++;
		this.cleanupListeners.forEach((cleanup) => cleanup());
		this.cleanupListeners = [];
		this.periodButtons.clear();
		this.periodTabsResizeObserver?.disconnect();
		this.periodTabsResizeObserver = null;
		this.periodTabsEl = null;
		this.metricsEl = null;
		this.recentSessionsEl = null;
		this.contentEl.empty();
	}

	async render() {
		this.periodTabsResizeObserver?.disconnect();
		this.periodIndicatorInitialized = false;
		this.contentEl.empty();
		this.contentEl.addClass("tasknotes-plugin");
		this.periodButtons.clear();
		const container = this.contentEl.createDiv({ cls: "pomodoro-stats-view" });
		const header = container.createDiv({ cls: "pomodoro-stats-view__header" });
		const tabs = header.createDiv({ cls: "pomodoro-stats-view__period-tabs", attr: {
			role: "tablist", "aria-label": this.t(msg({ message: "Pomodoro statistics", context: "views.pomodoroStats.heading" })),
		} });
		this.periodTabsEl = tabs;
		const periods: { period: PomodoroStatsPeriod; label: MessageDescriptor }[] = [
			{ period: "today", label: msg({ message: "Today", context: "views.pomodoroStats.sections.today" }) },
			{ period: "week", label: msg({ message: "Week", context: "views.pomodoroStats.period.week" }) },
			{ period: "all", label: msg({ message: "All time", context: "views.pomodoroStats.sections.allTime" }) },
		];
		periods.forEach(({ period, label }, index) => {
			const button = tabs.createEl("button", { cls: "pomodoro-stats-view__period-tab", text: this.t(label), attr: { type: "button", role: "tab" } });
			this.periodButtons.set(period, button);
			this.registerDomEvent(button, "click", () => { this.selectPeriod(period); });
			this.registerDomEvent(button, "keydown", (event: KeyboardEvent) => {
				let next: number;
				if (event.key === "ArrowRight") next = (index + 1) % periods.length;
				else if (event.key === "ArrowLeft") next = (index + periods.length - 1) % periods.length;
				else if (event.key === "Home") next = 0;
				else if (event.key === "End") next = periods.length - 1;
				else return;
				event.preventDefault();
				this.selectPeriod(periods[next].period);
				this.periodButtons.get(periods[next].period)?.focus();
			});
		});
		tabs.createSpan({ cls: "pomodoro-stats-view__period-indicator", attr: { "aria-hidden": "true" } });
		this.periodTabsResizeObserver = new ResizeObserver(() => this.updatePeriodIndicator(false));
		this.periodTabsResizeObserver.observe(tabs);
		const actions = header.createDiv({ cls: "pomodoro-stats-view__header-actions" });
		const refresh = actions.createEl("button", { cls: "pomodoro-stats-view__refresh-button", attr: { type: "button", "aria-label": this.t(msg({ message: "Refresh", context: "views.pomodoroStats.refresh" })) } });
		setIcon(refresh, "refresh-cw");
		setTooltip(refresh, this.t(msg({ message: "Refresh", context: "views.pomodoroStats.refresh" })));
		this.registerDomEvent(refresh, "click", () => { void this.refreshWithAnimation(refresh); });
		const panel = container.createDiv({ cls: "pomodoro-stats-view__panel", attr: { role: "tabpanel" } });
		this.metricsEl = panel.createDiv({ cls: "pomodoro-stats-view__metrics-grid" });
		const section = panel.createEl("section", { cls: "pomodoro-stats-view__history" });
		section.createEl("h2", { text: this.t(msg({ message: "History", context: "views.pomodoroStats.history" })) });
		this.recentSessionsEl = section.createDiv({ cls: "pomodoro-stats-view__recent-sessions" });
		this.selectPeriod(this.period);
	}

	private selectPeriod(period: PomodoroStatsPeriod): void {
		this.period = period;
		for (const [value, button] of this.periodButtons) {
			button.setAttribute("aria-selected", String(value === period));
			button.tabIndex = value === period ? 0 : -1;
		}
		this.updatePeriodIndicator();
		void this.refreshStats();
	}

	private updatePeriodIndicator(animate = true): void {
		const tabs = this.periodTabsEl;
		const button = this.periodButtons.get(this.period);
		if (!tabs || !button) return;
		const bounds = button.getBoundingClientRect();
		if (!bounds.width) return;
		const x = `${bounds.left - tabs.getBoundingClientRect().left}px`;
		const width = `${bounds.width}px`;
		if (tabs.style.getPropertyValue("--tn-pomodoro-tab-x") === x
			&& tabs.style.getPropertyValue("--tn-pomodoro-tab-width") === width) return;
		const snap = !animate || !this.periodIndicatorInitialized;
		if (snap) tabs.removeClass("pomodoro-stats-view__period-tabs--animated");
		tabs.setCssProps({
			"--tn-pomodoro-tab-x": x,
			"--tn-pomodoro-tab-width": width,
		});
		if (snap) {
			// Commit the initial/resized position before enabling movement between tabs.
			tabs.querySelector(".pomodoro-stats-view__period-indicator")?.getBoundingClientRect();
			tabs.addClass("pomodoro-stats-view__period-tabs--animated");
		}
		this.periodIndicatorInitialized = true;
	}

	private async refreshWithAnimation(button: HTMLButtonElement): Promise<void> {
		if (button.getAttribute("aria-busy") === "true") return;
		button.setAttribute("aria-busy", "true");
		try {
			const animation = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? undefined
				: button.querySelector("svg")?.animate(
					[{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
					{ duration: 450, easing: "ease-in-out" }
				);
			await Promise.all([this.refreshStats(), animation?.finished.catch(() => undefined)]);
		} finally {
			button.removeAttribute("aria-busy");
		}
	}

	private async waitForPomodoroService(): Promise<void> {
		const startedAt = Date.now();
		while (!this.plugin.pomodoroService && Date.now() - startedAt < 5000) {
			await new Promise((resolve) => window.setTimeout(resolve, 50));
		}
	}

	private async refreshStats(): Promise<void> {
		const version = ++this.refreshVersion;
		try {
			if (!this.plugin.pomodoroService || !this.metricsEl || !this.recentSessionsEl) return;
			const today = createUTCDateFromLocalCalendarDate(getTodayLocal());
			const history = await this.plugin.pomodoroService.getSessionHistory();
			if (version !== this.refreshVersion) return;
			const { sessions, focusMinutes, taskCount, completedSessions, dayStreak } = getPomodoroDashboardSummary(
				history, this.period, today, this.plugin.settings.calendarViewSettings.firstDay
			);
			this.metricsEl.empty();
			this.renderMetric(msg({ message: "Focus time", context: "views.pomodoroStats.metrics.focus" }), focusMinutes ? uiDuration(focusMinutes) : this.t(msg({ message: "No sessions", context: "views.pomodoroStats.empty.focus" })), "hourglass");
			this.renderMetric(msg({ message: "Tasks worked on", context: "views.pomodoroStats.metrics.tasks" }), taskCount ? uiNumber(taskCount) : this.t(msg({ message: "No tasks", context: "views.kanban.noTasks" })), "list-checks");
			this.renderMetric(msg({ message: "Completed sessions", context: "views.pomodoroStats.metrics.sessions" }), completedSessions ? uiNumber(completedSessions) : this.t(msg({ message: "No completed sessions", context: "views.pomodoroStats.empty.sessions" })), "timer");
			this.renderMetric(msg({ message: "Days in a row", context: "views.pomodoroStats.metrics.days" }), dayStreak ? uiNumber(dayStreak, { style: "unit", unit: "day", unitDisplay: "long" }) : this.t(msg({ message: "No streak", context: "views.pomodoroStats.empty.days" })), "zap");
			this.renderRecentSessions(this.recentSessionsEl, sessions);
		} catch (error) {
			tasknotesLogger.error("Failed to refresh stats:", { category: "stale-data", operation: "refresh-stats", error });
		}
	}

	private renderMetric(label: MessageDescriptor, value: string, icon: string): void {
		if (!this.metricsEl) return;
		const card = this.metricsEl.createEl("article", { cls: "pomodoro-stats-view__metric-card" });
		const header = card.createDiv({ cls: "pomodoro-stats-view__metric-header" });
		header.createSpan({ text: this.t(label) });
		const iconEl = header.createSpan({ cls: "pomodoro-stats-view__metric-icon", attr: { "aria-hidden": "true" } });
		setIcon(iconEl, icon);
		card.createEl("strong", { cls: "pomodoro-stats-view__metric-value", text: value });
	}

	private renderRecentSessions(container: HTMLElement, history: PomodoroSessionHistory[]) {
		const recentSessions = sortPomodoroSessions(history)
			.filter((session: PomodoroSessionHistory) => session.type === "work")
			.reverse();

		container.empty();

		if (recentSessions.length === 0) {
			container.createDiv({
				cls: "pomodoro-no-sessions pomodoro-stats-view__no-sessions",
				text: this.t(msg({ message: "No sessions recorded yet", context: "views.pomodoroStats.recents.empty" })),
			});
			return;
		}

		for (const session of recentSessions) {
			const sessionEl = container.createDiv({
				cls: "pomodoro-session-item pomodoro-stats-view__session-item",
			});
			this.registerDomEvent(sessionEl, "contextmenu", (event: MouseEvent) => {
				event.preventDefault();
				this.showSessionContextMenu(event, session);
			});

			const dateEl = sessionEl.createSpan({
				cls: "session-date pomodoro-stats-view__session-date",
			});
			const timeFormat = this.plugin.settings.calendarViewSettings.timeFormat;
			dateEl.textContent = formatPomodoroHistoryDate(
				new Date(session.startTime),
				uiLocale(),
				timeFormat
			);

			const durationEl = sessionEl.createSpan({
				cls: "session-duration pomodoro-stats-view__session-duration",
			});
			const actualDuration = getSessionDuration(session);
			durationEl.textContent = uiDuration(actualDuration);

			const statusEl = sessionEl.createSpan({
				cls: "session-status pomodoro-stats-view__session-status",
			});
			statusEl.textContent = this.t(
				session.completed
					? msg({ message: "Completed", context: "views.pomodoroStats.recents.status.completed" })
					: msg({ message: "Cancelled", context: "views.pomodoroStats.recents.status.interrupted" })
			);
			statusEl.addClass(session.completed ? "status-completed" : "status-interrupted");
			statusEl.addClass(
				session.completed
					? "pomodoro-stats-view__session-status--completed"
					: "pomodoro-stats-view__session-status--interrupted"
			);

			const taskPaths = getPomodoroSessionTaskPaths(session);
			if (taskPaths.length) {
				const taskEl = sessionEl.createSpan({
					cls: "session-task pomodoro-stats-view__session-task",
				});
				const taskNames = taskPaths.map((path) => path.split("/").pop()?.replace(/\.md$/u, "") ?? path).join(", ");
				taskEl.textContent = taskNames;
				setTooltip(taskEl, taskNames);
			}

			const deleteButton = sessionEl.createEl("button", {
				cls: "pomodoro-stats-view__session-delete-button",
				attr: {
					type: "button",
					"aria-label": this.t(msg({ message: "Delete Pomodoro session", context: "views.pomodoroStats.recents.deleteAria" })),
				},
			});
			setIcon(deleteButton, "trash-2");
			setTooltip(deleteButton, this.t(msg({ message: "Delete session", context: "views.pomodoroStats.recents.delete" })), {
				placement: "top",
			});
			this.registerDomEvent(deleteButton, "click", (event: MouseEvent) => {
				event.preventDefault();
				event.stopPropagation();
				void this.confirmDeleteSession(session);
			});
		}
	}

	private showSessionContextMenu(event: MouseEvent, session: PomodoroSessionHistory): void {
		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle(this.t(msg({ message: "Delete session", context: "views.pomodoroStats.recents.delete" })));
			item.setIcon("trash");
			item.onClick(() => {
				void this.confirmDeleteSession(session);
			});
		});
		menu.showAtMouseEvent(event);
	}

	private async confirmDeleteSession(session: PomodoroSessionHistory): Promise<void> {
		const confirmed = await showConfirmationModal(this.plugin.app, {
			title: this.t(msg({ message: "Delete Pomodoro session?", context: "views.pomodoroStats.recents.deleteConfirmTitle" })),
			message: this.t(msg({ message: "This removes the session from Pomodoro history. Existing task time entries are not changed.", context: "views.pomodoroStats.recents.deleteConfirmMessage" })),
			confirmText: this.t(msg({ message: "Delete", context: "views.pomodoroStats.recents.deleteConfirmButton" })),
			cancelText: this.t(msg({ message: "Cancel", context: "common.cancel" })),
			isDestructive: true,
		});

		if (!confirmed || !this.plugin.pomodoroService) {
			return;
		}

		const deleted = await this.plugin.pomodoroService.deleteSessionFromHistory(session);
		new Notice(
			this.t(
				deleted
					? msg({ message: "Pomodoro session deleted", context: "views.pomodoroStats.recents.deleteSuccess" })
					: msg({ message: "Pomodoro session was not found", context: "views.pomodoroStats.recents.deleteNotFound" })
			)
		);

		if (deleted) {
			await this.refreshStats();
		}
	}

}

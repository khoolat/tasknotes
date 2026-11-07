import type { PomodoroSessionHistory } from "../types";
import { formatDateForStorage } from "./dateUtils";
import { getPomodoroSessionDateKey, getPomodoroSessionTaskPaths } from "./pomodoroStats";
import { getSessionDuration } from "./pomodoroUtils";

export type PomodoroStatsPeriod = "today" | "week" | "all";

export interface PomodoroDashboardSummary {
	sessions: PomodoroSessionHistory[];
	focusMinutes: number;
	taskCount: number;
	completedSessions: number;
	dayStreak: number;
}

export function getPomodoroDashboardSummary(
	history: PomodoroSessionHistory[],
	period: PomodoroStatsPeriod,
	today: Date,
	firstDay: number
): PomodoroDashboardSummary {
	const range = getPomodoroPeriodRange(period, today, firstDay);
	const sessions = history.filter((session) => {
		const day = getPomodoroSessionDateKey(session);
		return session.type === "work" && (!range || (day >= range.start && day <= range.end));
	});
	return {
		sessions,
		focusMinutes: sessions.reduce((total, session) => total + getSessionDuration(session), 0),
		taskCount: new Set(sessions.flatMap(getPomodoroSessionTaskPaths)).size,
		completedSessions: sessions.filter((session) => session.completed).length,
		dayStreak: getPomodoroDayStreak(history, today),
	};
}

/** Compact display date; persisted timestamps retain their original precision and format. */
export function formatPomodoroHistoryDate(date: Date, locale: string, timeFormat: string): string {
	const russian = locale.toLowerCase().split("-")[0] === "ru";
	const monthStyle = russian ? "long" : "short";
	const parts = new Intl.DateTimeFormat(locale, { day: "numeric", month: monthStyle }).formatToParts(date);
	let month = parts.find((part) => part.type === "month")?.value ?? "";
	if (russian && ![4, 5, 6].includes(date.getMonth())) month = month.slice(0, 3);
	month = month.replace(/\.$/u, "");
	const day = parts.find((part) => part.type === "day")?.value ?? "";
	const time = new Intl.DateTimeFormat(locale, {
		hour: timeFormat === "12" ? "numeric" : "2-digit",
		minute: "2-digit",
		hourCycle: timeFormat === "12" ? "h12" : "h23",
	}).format(date);
	return `${day} ${month}, ${time}`;
}

/** Today is a UTC anchor for the user's local calendar day, as in PomodoroService. */
export function getPomodoroPeriodRange(
	period: PomodoroStatsPeriod,
	today: Date,
	firstDay: number
): { start: string; end: string } | null {
	if (period === "all") return null;
	const start = new Date(today);
	const end = new Date(today);
	if (period === "week") {
		const weekStart = Number.isInteger(firstDay) && firstDay >= 0 && firstDay <= 6 ? firstDay : 0;
		start.setUTCDate(start.getUTCDate() - (start.getUTCDay() - weekStart + 7) % 7);
		end.setTime(start.getTime());
		end.setUTCDate(end.getUTCDate() + 6);
	}
	return { start: formatDateForStorage(start), end: formatDateForStorage(end) };
}

/** Count completed work days, keeping yesterday's streak alive until today ends. */
export function getPomodoroDayStreak(sessions: PomodoroSessionHistory[], today: Date): number {
	const days = new Set(sessions
		.filter((session) => session.type === "work" && session.completed)
		.map(getPomodoroSessionDateKey));
	const day = new Date(today);
	if (!days.has(formatDateForStorage(day))) day.setUTCDate(day.getUTCDate() - 1);
	let streak = 0;
	while (days.has(formatDateForStorage(day))) {
		streak++;
		day.setUTCDate(day.getUTCDate() - 1);
	}
	return streak;
}

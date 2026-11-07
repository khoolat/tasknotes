import { formatPomodoroHistoryDate, getPomodoroDashboardSummary, getPomodoroDayStreak, getPomodoroPeriodRange } from "../../../src/utils/pomodoroDashboard";
import type { PomodoroSessionHistory } from "../../../src/types";

function session(day: string, completed = true, type: PomodoroSessionHistory["type"] = "work"): PomodoroSessionHistory {
	return { id: day, startTime: `${day}T09:00:00+10:00`, endTime: `${day}T09:25:00+10:00`, plannedDuration: 25, type, completed, activePeriods: [] };
}

describe("Pomodoro dashboard summary", () => {
	const today = new Date("2026-11-07T00:00:00Z");
	function work(day: string, minutes: number, completed: boolean, taskPaths: string[]): PomodoroSessionHistory {
		const item = session(day, completed);
		const endTime = new Date(new Date(item.startTime).getTime() + minutes * 60000).toISOString();
		return { ...item, endTime, taskPaths, taskPath: taskPaths[taskPaths.length - 1], activePeriods: [{ startTime: item.startTime, endTime }] };
	}

	it("includes interrupted focus time and counts each associated task once within the period", () => {
		const history = [
			work("2026-11-07", 25, true, ["a.md", "b.md"]),
			work("2026-11-07", 10, false, ["b.md", "c.md"]),
			{ ...work("2026-11-07", 15, true, ["break.md"]), type: "short-break" as const },
			work("2026-11-06", 15, true, ["a.md"]),
			work("2026-11-05", 20, true, ["z.md"]),
			work("2026-09-28", 40, true, ["old.md"]),
		];
		expect(getPomodoroDashboardSummary(history, "today", today, 1)).toMatchObject({ focusMinutes: 35, taskCount: 3, completedSessions: 1, dayStreak: 3 });
		expect(getPomodoroDashboardSummary(history, "week", today, 1)).toMatchObject({ focusMinutes: 70, taskCount: 4, completedSessions: 3, dayStreak: 3 });
		expect(getPomodoroDashboardSummary(history, "all", today, 1)).toMatchObject({ focusMinutes: 110, taskCount: 5, completedSessions: 4, dayStreak: 3 });
	});

	it("keeps a streak across the week boundary even when Today or Week filters out earlier days", () => {
		const monday = new Date("2026-11-09T00:00:00Z");
		const history = [session("2026-11-07"), session("2026-11-08"), session("2026-11-09")];
		for (const period of ["today", "week", "all"] as const) {
			expect(getPomodoroDashboardSummary(history, period, monday, 1).dayStreak).toBe(3);
		}
	});

	it("excludes pauses while retaining active time from an interrupted session", () => {
		const item = work("2026-11-07", 30, false, ["a.md"]);
		item.activePeriods = [
			{ startTime: "2026-11-07T09:00:00", endTime: "2026-11-07T09:10:00" },
			{ startTime: "2026-11-07T09:20:00", endTime: "2026-11-07T09:25:00" },
		];
		expect(getPomodoroDashboardSummary([item], "today", today, 1)).toMatchObject({ focusMinutes: 15, taskCount: 1, completedSessions: 0, dayStreak: 0 });
		expect(getPomodoroDashboardSummary([], "today", today, 1)).toEqual({ sessions: [], focusMinutes: 0, taskCount: 0, completedSessions: 0, dayStreak: 0 });
	});
});

describe("Pomodoro history dates", () => {
	it.each([
		[0, "1 янв"], [1, "2 фев"], [2, "3 мар"], [3, "4 апр"],
		[4, "5 мая"], [5, "6 июня"], [6, "7 июля"], [7, "8 авг"],
		[8, "9 сен"], [9, "10 окт"], [10, "11 ноя"], [11, "12 дек"],
	])("uses the requested Russian month form for month %i", (month, expected) => {
		const date = new Date(2026, month as number, (month as number) + 1, 16, 8);
		expect(formatPomodoroHistoryDate(date, "ru", "24")).toBe(`${expected}, 16:08`);
	});

	it("keeps midnight at 00 and respects the 12-hour preference", () => {
		expect(formatPomodoroHistoryDate(new Date(2026, 10, 7, 0, 8), "ru-RU", "24")).toBe("7 ноя, 00:08");
		expect(formatPomodoroHistoryDate(new Date(2026, 10, 7, 16, 8), "en", "12")).toMatch(/^7 Nov, 4:08.*PM$/u);
	});
});

describe("Pomodoro dashboard periods", () => {
	it("keeps today's calendar date and has no bound for all time", () => {
		const today = new Date("2026-11-07T00:00:00Z");
		expect(getPomodoroPeriodRange("today", today, 1)).toEqual({ start: "2026-11-07", end: "2026-11-07" });
		expect(getPomodoroPeriodRange("all", today, 1)).toBeNull();
	});

	it("respects the configured first weekday across year boundaries", () => {
		const today = new Date("2027-01-01T00:00:00Z");
		expect(getPomodoroPeriodRange("week", today, 1)).toEqual({ start: "2026-12-28", end: "2027-01-03" });
		expect(getPomodoroPeriodRange("week", today, 0)).toEqual({ start: "2026-12-27", end: "2027-01-02" });
		expect(today.toISOString()).toBe("2027-01-01T00:00:00.000Z");
	});

	it("falls back to Sunday for invalid weekday settings", () => {
		expect(getPomodoroPeriodRange("week", new Date("2026-11-07T00:00:00Z"), 9)).toEqual({ start: "2026-11-01", end: "2026-11-07" });
	});
});

describe("Pomodoro consecutive days", () => {
	const today = new Date("2026-11-07T00:00:00Z");
	it("counts unique completed work days, ignoring session count, breaks and interruptions", () => {
		expect(getPomodoroDayStreak([
			session("2026-11-07"), session("2026-11-07"), session("2026-11-06"),
			session("2026-11-05", false), session("2026-11-05", true, "short-break"), session("2026-11-04"),
		], today)).toBe(2);
	});
	it("keeps yesterday's streak alive, but expires it after a missed day", () => {
		expect(getPomodoroDayStreak([session("2026-11-06"), session("2026-11-05")], today)).toBe(2);
		expect(getPomodoroDayStreak([session("2026-11-05")], today)).toBe(0);
	});
	it("uses stored calendar days across a month boundary and ignores future work", () => {
		expect(getPomodoroDayStreak([session("2027-01-01"), session("2026-12-31"), session("2027-01-02")], new Date("2027-01-01T00:00:00Z"))).toBe(2);
		expect(getPomodoroDayStreak([], today)).toBe(0);
	});
});

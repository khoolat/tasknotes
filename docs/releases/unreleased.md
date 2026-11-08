# TaskNotes - Unreleased

<!--

**Added** for new features.
**Changed** for changes in existing functionality.
**Deprecated** for soon-to-be removed features.
**Removed** for now removed features.
**Fixed** for any bug fixes.
**Security** in case of vulnerabilities.

Always acknowledge contributors and those who report issues.

Example:

```
## Fixed

- Fixed low-contrast dates, durations, task names and status labels in dark Pomodoro history. Delete buttons now use theme-aware colors instead of white backgrounds in dark mode.
- (#768) Fixed calendar view appearing empty in week and day views due to invalid time configuration values
  - Added time validation in settings UI with proper error messages and debouncing
  - Prevents "Cannot read properties of null (reading 'years')" error from FullCalendar
  - Thanks to @userhandle for reporting and help debugging
```

When a change has user-facing documentation, include a canonical tasknotes.dev link:

```
## Added

- Added materialized occurrence notes for recurring tasks. See [Recurring Tasks](https://tasknotes.dev/features/recurring-tasks/#materialized-occurrence-notes) for setup and calendar behavior.
```

-->

## Changed

- The Pomodoro timer adapts to the width and height of its pane. Narrow panes stack mode labels and controls, while short panes reduce spacing and timer size; all actions remain accessible by scrolling.

- Pomodoro mode labels keep a consistent weight and width to prevent layout shifts. A subtle selection surface slides between modes, with a theme-secondary tray, 4% hover on unselected modes and 2% on the selected mode in light mode, and reduced-motion support.

- Redesigned the Pomodoro timer with theme-aware typography, session tabs, Lucide controls and a flat statistics button. Pause and Resume keep the same width; the countdown updates without animation.

- The second Pomodoro statistics card now shows completed, non-archived tasks that were associated with a work session. Each task is counted once by its completion date for Today, Week or All time, even when the Pomodoro session happened earlier.
- Renamed the English Pomodoro statistics label “Days in a row” to “Current streak”.
- Pomodoro period tabs now use a smoothly sliding underline while text changes immediately. Unselected tabs have a subtle text-only hover state; reduced-motion preferences disable the underline animation.
- Pomodoro focus time now includes interrupted work sessions. Completed sessions explicitly counts finished work sessions and shows No completed sessions when empty. The consecutive-day streak uses the full history regardless of the selected period.
- The Pomodoro consecutive-days card now spells out the day unit using the interface language's plural forms instead of an abbreviation.
- In very narrow Pomodoro statistics panes, period labels truncate on one line and the content stops shrinking at 210px. The refresh button stays to the right and clips rather than moving below the tabs.
- Empty Pomodoro summary cards now show descriptive labels instead of zero values for focus time, sessions and consecutive days.
- Pomodoro history aligns dates and durations in fixed 92px and 80px columns with 20px gaps. Session durations of an hour or longer now show hours and minutes.
- Pomodoro history now retains and shows all associated tasks when switching tasks within one session, rather than showing only the last task. Long task lists can be read in the tooltip.
- Pomodoro history uses 12px Inter text and translucent green (#48E817) and red (#FF526D) status pills at 15% opacity, with 24px height and 3px by 8px padding. Interrupted sessions are now labelled Cancelled.
- Simplified the Pomodoro statistics toolbar: removed the migration help button and added a rotating refresh icon with flat hover and pressed states. History dates now show the day before the month, with compact Russian month names, and the heading aligns with the session rows.
- Redesigned Pomodoro statistics with Today, Week and All time tabs, four summary cards and session history filtered by the selected period. The dashboard shows completed tasks associated with Pomodoro and consecutive days with completed Pomodoro sessions, and adapts to narrow panes, switching to one card per row at 480px or narrower. History rows stay on one line: long task names are shortened with an ellipsis, and very narrow panes scroll the history horizontally.
- The sidebar button for creating a task now uses the square-plus icon. TaskNotes view icons now match their sidebar buttons, the task list uses a list icon, and settings use a check-square icon.
- Reworked the task create and edit modals. Status, priority, dates, recurrence and reminders are now labelled chips that show their current value, replacing the icons with a dot. The edit modal starts with the title, **Task information** is collapsed, and **Archive** and **Delete** moved into a **More actions** (⋯) menu beside **Open note**. Empty field rows are more compact.
- Natural language input now updates the form as you type, so the **Fill form** button and the preview under the input were removed. Removing text from the input undoes what it set, and a field you changed by hand is no longer overwritten. See [Task Management](https://tasknotes.dev/features/task-management/).
- Closing the create modal with an unsaved draft now asks whether to save or discard it, as the edit modal does. **Open note** and **Archive** in the edit modal now ask before leaving unsaved changes, rather than afterwards.
- A missing title or invalid time estimate is now shown on the field itself instead of in a notice.
- (#2492) Clicking a recurring task's status indicator now follows the status cycle, as it does for other tasks, once the first completed status has a **Next status**. It moves the series through its open statuses, and reaching a completed status completes the occurrence shown on the card. Setups without that Next status keep completing the occurrence in one click, and dropping a recurring task on Done still completes it directly. In new setups, the built-in Done status now moves on to Open, so recurring tasks get this cycle, a finished series starts its next occurrence at Open, and clicking an ordinary task at Done moves it to Open instead of None. Saved statuses are not changed, but if your first completed status already has a Next status, recurring cards now take more than one click to complete. The task context menu still completes an occurrence directly. See [Recurring Tasks](https://tasknotes.dev/features/recurring-tasks/#completion-tracking).
  - Thanks to @Jomo94 for requesting this in #1370 and @martin-forge for the implementation
- Shortened the v5 and app announcement above the release notes, removed Android tester sign-up instructions, and refreshed the plugin beta link.
- (#2486) Collapsed Kanban columns now show the column's icon and title in the collapsed strip, with the title written vertically from top to bottom and long titles cut off. Previously the title was hidden, so collapsed columns could only be told apart by their colour. See [Collapsing Columns](https://tasknotes.dev/views/kanban-view/#collapsing-columns)
  - Thanks to @UniCode9696 for the suggestion

## Fixed

- Pomodoro modes can be changed while idle or paused, and are locked during the countdown; elapsed time from a paused session is retained as an interrupted session. The mode tabs keep their top position when selecting a task, task action buttons have equal dimensions, and the long-break icon follows the theme color.

- Fixed the Pomodoro task picker remaining blocked after its window was dismissed. Cancelling task selection now preserves the selected task.

- Fixed pressing the save shortcut twice in quick succession creating the task twice.
- Fixed a failed follow-up step, such as updating a dependency, leaving the create modal open so that saving again created a second task. The modal now closes and a notice explains what failed.
- Fixed text in the natural language input being dropped when the task also had a prefilled title.
- Fixed edits made after using **Fill form** being overwritten by the natural language text when saving.
- Fixed Escape doing nothing in the task modals after focus had left a markdown editor.
- Fixed "1h" in the time estimate field being saved as 1 minute. The field now accepts values such as `90`, `1:30`, `1h`, `1.5h` and `1h 30m`.
- (#2484) Fixed collapsed Kanban columns expanding again after Obsidian restarts or the view reloads. Collapsed columns are now saved in the view's `.base` configuration, like column order. See [Collapsing Columns](https://tasknotes.dev/views/kanban-view/#collapsing-columns)
  - Thanks to @UniCode9696 for reporting this
- (#2489) Fixed natural language parsing reading text inside links as task fields. Dates, tags, contexts and statuses inside wikilinks, markdown links, inline code and URLs are no longer parsed. Converting `- [ ] review [[2026-11-03 Meeting with Jane]]` no longer schedules the task for that date, and converting a line with `[[Project#Next steps]]` no longer adds a `Next` tag or cuts it out of the link. A trigger directly before a link, such as `+[[Project]]`, still applies. See [Natural Language Processing](https://tasknotes.dev/settings/features/#natural-language-processing)
  - Thanks to @Mirrimo for reporting this
- (#2481) Fixed the timeblock edit modal dropping attachments written as links without `.md` (for example `[[Tasks/Write report]]`) when saving. Existing links now keep their original text.
  - Thanks to @ac8318740 for reporting this
- (#2494, #2498) Fixed time entries in the calendar's week and day views squeezing every event on their day, even where nothing overlapped. Time entries now sit in the narrow strip on the right only where they overlap a scheduled task, timeblock or calendar event. Elsewhere, events and time entries use the full column width, as they did before 4.15.
- (#2494) The previous and next buttons in the calendar toolbar now show larger, clearer arrows.
  - Thanks to @RumiaKitinari for reporting both, and @mgreen3 for the related report

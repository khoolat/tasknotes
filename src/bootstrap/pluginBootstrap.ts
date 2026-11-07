import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { MarkdownView, Platform, setTooltip } from "obsidian";
import { EditorView } from "@codemirror/view";
import type TaskNotesPlugin from "../main";
import {
	EVENT_TASK_UPDATED,
	POMODORO_STATS_VIEW_TYPE,
	POMODORO_VIEW_TYPE,
	STATS_VIEW_TYPE,
	TaskInfo,
} from "../types";
import { RequestDeduplicator, PredictivePrefetcher } from "../utils/RequestDeduplicator";
import { DOMReconciler, UIStateManager } from "../utils/DOMReconciler";
import { FieldMapper } from "../services/FieldMapper";
import { StatusManager } from "../services/StatusManager";
import { PriorityManager } from "../services/PriorityManager";
import { TaskManager } from "../utils/TaskManager";
import { DependencyCache } from "../utils/DependencyCache";
import { TaskService } from "../services/TaskService";
import { FilterService } from "../services/FilterService";
import { TaskStatsService } from "../services/TaskStatsService";
import { ViewStateManager } from "../services/ViewStateManager";
import { ProjectSubtasksService } from "../services/ProjectSubtasksService";
import { ExpandedProjectsService } from "../services/ExpandedProjectsService";
import { AutoArchiveService } from "../services/AutoArchiveService";
import { DragDropManager } from "../utils/DragDropManager";
import { StatusBarService } from "../ui/StatusBarService";
import { NotificationService } from "../ui/NotificationService";
import { ViewPerformanceService } from "../services/ViewPerformanceService";
import { PomodoroView } from "../views/PomodoroView";
import { PomodoroStatsView } from "../views/PomodoroStatsView";
import { StatsView } from "../views/StatsView";
import { ReleaseNotesView, RELEASE_NOTES_VIEW_TYPE } from "../views/ReleaseNotesView";
import { RELEASE_NOTES_BUNDLE, CURRENT_VERSION } from "../releaseNotes";
import { createTaskLinkOverlay, dispatchTaskUpdate } from "../editor/TaskLinkOverlay";
import {
	createRelationshipsDecorations,
	setupReadingModeHandlers as setupRelationshipsReadingMode,
} from "../editor/RelationshipsDecorations";
import {
	createTaskCardNoteDecorations,
	setupReadingModeHandlers as setupTaskCardReadingMode,
} from "../editor/TaskCardNoteDecorations";
import { createReadingModeTaskLinkProcessor } from "../editor/ReadingModeTaskLinkProcessor";
import { ICSSubscriptionService } from "../services/ICSSubscriptionService";
import { ICSNoteService } from "../services/ICSNoteService";
import { OAuthService } from "../services/OAuthService";
import { GoogleCalendarService } from "../services/GoogleCalendarService";
import { MicrosoftCalendarService } from "../services/MicrosoftCalendarService";
import { CalendarProviderRegistry } from "../services/CalendarProvider";
import { PomodoroService } from "../services/PomodoroService";
import { AutoExportService } from "../services/AutoExportService";
import { TaskFileLifecycleReconciliationService } from "../services/TaskFileLifecycleReconciliationService";
import { TaskNotesAPI } from "../api/TaskNotesAPI";
import { isCalendarIntegrationDisabledOnMobile } from "../utils/calendarIntegration";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";
import { TASKNOTES_RUNTIME_LIFECYCLE_RAW_EVENTS } from "../api/runtime-api";
import { showNotice } from "../ui/notifications";
import { EVENT_USER_NOTICE, type UserNoticePayload } from "../core/userNotices";

const tasknotesLogger = createTaskNotesLogger({ tag: "Bootstrap/PluginBootstrap" });

const TASKNOTES_BASES_VIEW_TYPES = [
	"tasknotesTaskList",
	"tasknotesKanban",
	"tasknotesCalendar",
	"tasknotesMiniCalendar",
];

type EnabledBasesPlugin = {
	registrations?: Record<string, unknown>;
};

type InternalPluginManagerWithBases = {
	getEnabledPluginById?: (id: string) => EnabledBasesPlugin | null;
};

type AppWithInternalPlugins = {
	internalPlugins?: InternalPluginManagerWithBases;
};

type FileDeletedEventData = { path: string; prevCache?: unknown };
type FileUpdatedEventData = { path: string; file?: unknown; updatedTask?: TaskInfo };

type EditorWithCodeMirror = {
	cm?: unknown;
};

function getCodeMirrorEditor(editor: unknown): unknown {
	if (!editor || typeof editor !== "object") {
		return undefined;
	}

	return (editor as unknown as EditorWithCodeMirror).cm ?? null;
}

export async function initializeCoreServices(plugin: TaskNotesPlugin): Promise<void> {
	plugin.api = new TaskNotesAPI(plugin);

	plugin.fieldMapper = new FieldMapper(
		plugin.settings.fieldMapping,
		plugin.settings.userFields ?? [],
		plugin.settings.customStatuses,
		plugin.settings.customPriorities
	);
	plugin.statusManager = new StatusManager(
		plugin.settings.customStatuses,
		plugin.settings.defaultTaskStatus
	);
	plugin.priorityManager = new PriorityManager(plugin.settings.customPriorities);

	plugin.requestDeduplicator = new RequestDeduplicator();
	plugin.predictivePrefetcher = new PredictivePrefetcher(plugin.requestDeduplicator);
	plugin.domReconciler = new DOMReconciler();
	plugin.uiStateManager = new UIStateManager();

	plugin.cacheManager = new TaskManager(plugin.app, plugin.settings, plugin.fieldMapper);
	plugin.emitter = plugin.cacheManager;
	plugin.registerEvent(
		plugin.emitter.on(EVENT_USER_NOTICE, (payload: UserNoticePayload) => {
			showNotice(payload.message, payload.timeout);
		})
	);

	plugin.dependencyCache = new DependencyCache(
		plugin.app,
		plugin.settings,
		plugin.fieldMapper,
		plugin.statusManager,
		(frontmatter: unknown) => plugin.cacheManager.isTaskFile(frontmatter)
	);
	plugin.cacheManager.setDependencyCache(plugin.dependencyCache);

	plugin.taskService = new TaskService(plugin);
	plugin.filterService = new FilterService(
		plugin.cacheManager,
		plugin.statusManager,
		plugin.priorityManager,
		plugin
	);
	plugin.taskStatsService = new TaskStatsService(plugin.cacheManager, plugin.statusManager);
	plugin.viewStateManager = new ViewStateManager(plugin.app, plugin);
	plugin.projectSubtasksService = new ProjectSubtasksService(plugin);
	plugin.expandedProjectsService = new ExpandedProjectsService(plugin);
	plugin.autoArchiveService = new AutoArchiveService(plugin);

	const { TaskSelectionService } = await import("../services/TaskSelectionService");
	plugin.taskSelectionService = new TaskSelectionService(plugin);
	plugin.dragDropManager = new DragDropManager(plugin);
	plugin.statusBarService = new StatusBarService(plugin);
	plugin.notificationService = new NotificationService(plugin);
	plugin.viewPerformanceService = new ViewPerformanceService(plugin);

	const { BasesFilterConverter } = await import("../services/BasesFilterConverter");
	plugin.basesFilterConverter = new BasesFilterConverter(plugin);

	const { MdbaseSpecService } = await import("../services/MdbaseSpecService");
	plugin.mdbaseSpecService = new MdbaseSpecService(plugin);

	plugin.icsSubscriptionService = new ICSSubscriptionService(plugin);
	plugin.icsNoteService = new ICSNoteService(plugin);
	plugin.taskService.setAutoArchiveService(plugin.autoArchiveService);
}

export function registerRibbonIcons(plugin: TaskNotesPlugin): void {
	const ribbons: { element: HTMLElement; key: MessageDescriptor }[] = [];
	const addRibbon = (
		icon: string,
		key: MessageDescriptor,
		callback: (event: MouseEvent) => void | Promise<void>
	) => {
		const element = plugin.addRibbonIcon(icon, plugin.i18n.translate(key), callback);
		ribbons.push({ element, key });
	};
	const refresh = () => {
		for (const { element, key } of ribbons) {
			setTooltip(element, plugin.i18n.translate(key), { placement: "right" });
		}
	};
	const listener = plugin.i18n.on("locale-changed", refresh);
	plugin.register(() => plugin.i18n.offref(listener));

	addRibbon("calendar-days", msg({ message: "Open mini calendar view", context: "commands.openCalendarView" }), async () => {
		await plugin.activateCalendarView();
	});

	addRibbon("calendar", msg({ message: "Open calendar view", context: "commands.openAdvancedCalendarView" }), async () => {
		await plugin.openBasesFileForCommand("open-advanced-calendar-view");
	});

	addRibbon("check-square", msg({ message: "Open tasks view", context: "commands.openTasksView" }), async () => {
		await plugin.openBasesFileForCommand("open-tasks-view");
	});

	addRibbon("calendar", msg({ message: "Open agenda view", context: "commands.openAgendaView" }), async () => {
		await plugin.openBasesFileForCommand("open-agenda-view");
	});

	addRibbon("columns-3", msg({ message: "Open Kanban board", context: "commands.openKanbanView" }), async () => {
		await plugin.openBasesFileForCommand("open-kanban-view");
	});

	addRibbon("clock", msg({ message: "Open Pomodoro timer", context: "commands.openPomodoroView" }), async () => {
		await plugin.activatePomodoroView();
	});

	addRibbon("bar-chart", msg({ message: "Open Pomodoro statistics", context: "commands.openPomodoroStats" }), async () => {
		await plugin.activatePomodoroStatsView();
	});

	addRibbon("square-plus", msg({ message: "Create new task", context: "commands.createNewTask" }), () => {
		plugin.openTaskCreationModal();
	});
}

export function initializeCalendarProviders(plugin: TaskNotesPlugin): void {
	plugin.oauthService = new OAuthService(plugin, plugin.oauthSecretStore);
	plugin.googleCalendarService = new GoogleCalendarService(plugin, plugin.oauthService);
	plugin.microsoftCalendarService = new MicrosoftCalendarService(plugin, plugin.oauthService);
	plugin.calendarProviderRegistry = new CalendarProviderRegistry();
	plugin.calendarProviderRegistry.register(plugin.googleCalendarService);
	plugin.calendarProviderRegistry.register(plugin.microsoftCalendarService);
}

export async function registerBasesIntegration(plugin: TaskNotesPlugin): Promise<void> {
	if (!plugin.settings?.enableBases) {
		clearBasesRegistrationRetry(plugin);
		return;
	}

	if (plugin.basesRegistered && areTaskNotesBasesViewsRegistered(plugin)) {
		clearBasesRegistrationRetry(plugin);
		return;
	}

	plugin.basesRegistered = false;

	try {
		const { registerBasesTaskList } = await import("../bases/registration");
		const registered = await registerBasesTaskList(plugin);
		plugin.basesRegistered = registered;
		if (registered) {
			clearBasesRegistrationRetry(plugin);
			return;
		}
	} catch (error) {
		tasknotesLogger.debug("[TaskNotes][Bases] Registration failed:", {
			category: "internal",
			operation: "registration",
			error: error,
		});
	}

	scheduleBasesRegistrationRetry(plugin);
}

function getEnabledBasesPlugin(plugin: TaskNotesPlugin): EnabledBasesPlugin | null {
	return (
		(plugin.app as unknown as AppWithInternalPlugins).internalPlugins?.getEnabledPluginById?.(
			"bases"
		) ?? null
	);
}

function areTaskNotesBasesViewsRegistered(plugin: TaskNotesPlugin): boolean {
	const registrations = getEnabledBasesPlugin(plugin)?.registrations;
	return (
		!!registrations &&
		TASKNOTES_BASES_VIEW_TYPES.every((viewType) => Boolean(registrations[viewType]))
	);
}

function clearBasesRegistrationRetry(plugin: TaskNotesPlugin): void {
	if (plugin.basesRegistrationRetryIntervalId === null) {
		return;
	}

	window.clearInterval(plugin.basesRegistrationRetryIntervalId);
	plugin.basesRegistrationRetryIntervalId = null;
}

function scheduleBasesRegistrationRetry(plugin: TaskNotesPlugin): void {
	if (
		!plugin.settings?.enableBases ||
		plugin.basesRegistrationRetryIntervalId !== null ||
		areTaskNotesBasesViewsRegistered(plugin)
	) {
		return;
	}

	plugin.basesRegistrationRetryIntervalId = window.setInterval(() => {
		if (plugin.basesRegistered && areTaskNotesBasesViewsRegistered(plugin)) {
			clearBasesRegistrationRetry(plugin);
			return;
		}

		if (!getEnabledBasesPlugin(plugin)) {
			return;
		}

		void registerBasesIntegration(plugin);
	}, 5000);

	plugin.register(() => clearBasesRegistrationRetry(plugin));
}

export async function initializeHTTPAPI(plugin: TaskNotesPlugin): Promise<void> {
	if (Platform.isMobile || !plugin.settings.enableAPI) {
		return;
	}

	try {
		const { HTTPAPIService } = await import("../services/HTTPAPIService");

		plugin.apiService = new HTTPAPIService(
			plugin,
			plugin.taskService,
			plugin.filterService,
			plugin.cacheManager
		);

		plugin.taskService.setWebhookNotifier(plugin.apiService);
		plugin.pomodoroService.setWebhookNotifier(plugin.apiService);
		await plugin.apiService.start();
		showNotice(
			plugin.i18n.translate(msg({ message: "TaskNotes API started on port {port}", context: "notices.interface.apiStarted" }), {
				port: plugin.apiService.getPort(),
			})
		);
	} catch (error) {
		tasknotesLogger.error("Failed to initialize HTTP API:", {
			category: "provider",
			operation: "initialize-http-api",
			error: error,
		});
		showNotice(plugin.i18n.translate(msg({ message: "Failed to start TaskNotes API server. Check console for details.", context: "notices.interface.apiFailed" })));
	}
}

export async function initializeAfterLayoutReady(plugin: TaskNotesPlugin): Promise<void> {
	if (plugin.initializationComplete) {
		return;
	}
	plugin.initializationComplete = true;

	try {
		if (plugin.settings.autoCreateDefaultBasesFiles) {
			await plugin.ensureBasesViewFiles();
		}
		await plugin.ensureStarterNote();

		plugin.injectCustomStyles();
		registerActiveViews(plugin);
		registerEditorIntegrations(plugin);

		plugin.cacheManager.initialize();
		plugin.dependencyCache.initialize();
		plugin.filterService.initialize();
		plugin.statusBarService.initialize();
		await plugin.notificationService.initialize();
		await plugin.warmupProjectIndexes();
		await plugin.autoArchiveService.start();
		plugin.setupDateChangeDetection();
		initializeServicesLazily(plugin);
		await registerBasesIntegration(plugin);
		plugin.emitter.trigger(TASKNOTES_RUNTIME_LIFECYCLE_RAW_EVENTS["layout.ready"], {
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		tasknotesLogger.error("Error during post-layout initialization:", {
			category: "internal",
			operation: "post-layout-initialization",
			error: error,
		});
	}
}

function registerActiveViews(plugin: TaskNotesPlugin): void {
	plugin.registerView(POMODORO_VIEW_TYPE, (leaf) => new PomodoroView(leaf, plugin));
	plugin.registerView(POMODORO_STATS_VIEW_TYPE, (leaf) => new PomodoroStatsView(leaf, plugin));
	plugin.registerView(STATS_VIEW_TYPE, (leaf) => new StatsView(leaf, plugin));
	plugin.registerView(
		RELEASE_NOTES_VIEW_TYPE,
		(leaf) => new ReleaseNotesView(leaf, plugin, RELEASE_NOTES_BUNDLE, CURRENT_VERSION)
	);
}

function registerEditorIntegrations(plugin: TaskNotesPlugin): void {
	plugin.registerEditorExtension(createTaskLinkOverlay(plugin));
	plugin.registerEditorExtension(createTaskCardNoteDecorations(plugin));
	plugin.taskCardReadingModeCleanup = setupTaskCardReadingMode(plugin);
	plugin.registerEditorExtension(createRelationshipsDecorations(plugin));
	plugin.relationshipsReadingModeCleanup = setupRelationshipsReadingMode(plugin);
	plugin.registerMarkdownPostProcessor(createReadingModeTaskLinkProcessor(plugin));
}

/**
 * Runs one lazy initialization step, logging its failure so that the steps
 * after it still run.
 */
async function runLazyInitStep(
	operation: string,
	step: () => void | Promise<void>
): Promise<void> {
	try {
		await step();
	} catch (error) {
		tasknotesLogger.error("Error during lazy service initialization:", {
			category: "internal",
			operation: `lazy-service-initialization:${operation}`,
			error: error,
		});
	}
}

export function initializeServicesLazily(plugin: TaskNotesPlugin): void {
	window.setTimeout(() => {
		void (async () => {
			await runLazyInitStep("pomodoro", async () => {
				if (!plugin.pomodoroService) {
					plugin.pomodoroService = new PomodoroService(plugin);
					await plugin.pomodoroService.initialize();
				}
			});

			await runLazyInitStep("auto-export", () => {
				plugin.autoExportService = new AutoExportService(plugin);
				plugin.autoExportService.start();
			});

			if (!isCalendarIntegrationDisabledOnMobile(plugin.settings)) {
				await runLazyInitStep("ics-subscriptions", () =>
					plugin.icsSubscriptionService.initialize()
				);

				await runLazyInitStep("google-calendar", async () => {
					plugin.googleCalendarService.on("data-changed", () => {
						plugin.notifyDataChanged(undefined, false, true);
					});
					await plugin.googleCalendarService.initialize();

					plugin.taskCalendarSyncService = new (
						await import("../services/TaskCalendarSyncService")
					).TaskCalendarSyncService(plugin, plugin.googleCalendarService);
					await plugin.taskCalendarSyncService.initializeExternalFileReconciliation();
					plugin.taskCalendarSyncService.timeblocks.initialize();
					plugin.taskCalendarSyncService.timeblocks.registerVaultEvents();
					plugin.taskCalendarSyncService.startRecoveryQueueProcessor();
				});

				await runLazyInitStep("google-calendar-task-events", () => {
					plugin.registerEvent(
						plugin.emitter.on("file-updated", (data: FileUpdatedEventData) => {
							if (!plugin.taskCalendarSyncService || !data?.path) {
								return;
							}

							plugin.taskCalendarSyncService
								.handleExternalTaskFileUpdated(data.path, data.updatedTask)
								.catch((error) => {
									tasknotesLogger.warn(
										"Failed to reconcile externally updated task with Google Calendar:",
										{
											category: "provider",
											operation: "reconcile-external-task-file-update",
											error: error,
										}
									);
								});
						})
					);

					plugin.registerEvent(
						plugin.emitter.on("file-deleted", (data: FileDeletedEventData) => {
							if (!plugin.taskCalendarSyncService) {
								return;
							}

							const eventIdKey =
								plugin.fieldMapper.toUserField("googleCalendarEventId");
							const exceptionEventIdKey = plugin.fieldMapper.toUserField(
								"googleCalendarExceptionEventId"
							);
							const prevCache = data.prevCache as
								| { frontmatter?: Record<string, unknown> }
								| undefined;
							const eventId = prevCache?.frontmatter?.[eventIdKey];
							const exceptionEventId = prevCache?.frontmatter?.[exceptionEventIdKey];

							if (
								(typeof eventId === "string" && eventId.length > 0) ||
								(typeof exceptionEventId === "string" &&
									exceptionEventId.length > 0)
							) {
								plugin.taskCalendarSyncService
									.deleteTaskFromCalendarByPath(
										data.path,
										typeof eventId === "string" ? eventId : undefined,
										typeof exceptionEventId === "string"
											? exceptionEventId
											: undefined
									)
									.catch((error) => {
										tasknotesLogger.warn(
											"Failed to delete task from Google Calendar on file deletion:",
											{
												category: "provider",
												operation:
													"delete-task-google-calendar-on-file-deletion",
												error: error,
											}
										);
									});
							}
						})
					);
				});

				await runLazyInitStep("microsoft-calendar", async () => {
					plugin.microsoftCalendarService.on("data-changed", () => {
						plugin.notifyDataChanged(undefined, false, true);
					});
					await plugin.microsoftCalendarService.initialize();
				});
			}

			await runLazyInitStep("task-file-lifecycle-reconciliation", async () => {
				plugin.taskFileLifecycleReconciliationService =
					new TaskFileLifecycleReconciliationService(plugin);
				await plugin.taskFileLifecycleReconciliationService.initialize();
			});

			await runLazyInitStep("http-api", () => initializeHTTPAPI(plugin));

			await runLazyInitStep("editor-services", async () => {
				const { TaskLinkDetectionService } = await import(
					"../services/TaskLinkDetectionService"
				);
				plugin.taskLinkDetectionService = new TaskLinkDetectionService(plugin);

				const { InstantTaskConvertService } = await import(
					"../services/InstantTaskConvertService"
				);
				plugin.instantTaskConvertService = new InstantTaskConvertService(
					plugin,
					plugin.statusManager,
					plugin.priorityManager
				);

				const { createInstantConvertButtons } = await import(
					"../editor/InstantConvertButtons"
				);
				plugin.registerEditorExtension(createInstantConvertButtons(plugin));

				plugin.taskUpdateListenerForEditor = plugin.emitter.on(
					EVENT_TASK_UPDATED,
					(data: { path?: string; updatedTask?: TaskInfo }) => {
						plugin.app.workspace.iterateRootLeaves((leaf) => {
							if (leaf.view && leaf.view.getViewType() === "markdown") {
								const editor = (leaf.view as MarkdownView).editor;
								const cm = getCodeMirrorEditor(editor);
								if (cm) {
									const taskPath = data?.path || data?.updatedTask?.path;
									dispatchTaskUpdate(cm as EditorView, taskPath);
								}
							}
						});
					}
				);

				plugin.registerEvent(
					plugin.app.workspace.on("active-leaf-change", (leaf) => {
						window.setTimeout(() => {
							if (leaf && leaf.view && leaf.view.getViewType() === "markdown") {
								const editor = (leaf.view as MarkdownView).editor;
								const cm = getCodeMirrorEditor(editor);
								if (cm) {
									dispatchTaskUpdate(cm as EditorView);
								}
							}
						}, 50);
					})
				);

				plugin.registerEvent(
					plugin.app.workspace.on("layout-change", () => {
						window.setTimeout(() => {
							const activeView =
								plugin.app.workspace.getActiveViewOfType(MarkdownView);
							if (activeView) {
								const editor = activeView.editor;
								const cm = getCodeMirrorEditor(editor);
								if (cm) {
									dispatchTaskUpdate(cm as EditorView);
								}
							}
						}, 100);
					})
				);
			});

			await runLazyInitStep("event-listeners", () => {
				plugin.setupStatusBarEventListeners();
				plugin.setupTimeTrackingEventListeners();
			});

			await runLazyInitStep("version-check", async () => {
				await plugin.checkForVersionUpdate();
				void plugin.checkForNewReleaseOnStartup();
			});
		})();
	}, 10);
}

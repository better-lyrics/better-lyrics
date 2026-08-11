import {
  GENERAL_ERROR_LOG,
  LOG_PREFIX,
  LOG_PREFIX_AUTH,
  LOG_PREFIX_BACKGROUND,
  LOG_PREFIX_CONTENT,
  LOG_PREFIX_EDITOR,
  LOG_PREFIX_STORE,
} from "@constants";

export type LogSink = (...args: unknown[]) => void;

const NOOP: LogSink = () => {};

// -- Badges --------------------------

const BADGE_TEXT = "color:#fff;padding:1px 5px;border-radius:3px;font-weight:600";

const LOG_BADGES: Record<string, string> = {
  [LOG_PREFIX]: `background:#6d28d9;${BADGE_TEXT}`,
  [LOG_PREFIX_CONTENT]: `background:#0369a1;${BADGE_TEXT}`,
  [LOG_PREFIX_BACKGROUND]: `background:#475569;${BADGE_TEXT}`,
  [LOG_PREFIX_EDITOR]: `background:#b45309;${BADGE_TEXT}`,
  [LOG_PREFIX_STORE]: `background:#0f766e;${BADGE_TEXT}`,
  [LOG_PREFIX_AUTH]: `background:#b91c1c;${BADGE_TEXT}`,
  [GENERAL_ERROR_LOG]: `background:#dc2626;${BADGE_TEXT}`,
};

// -- Sinks --------------------------

export function createLogSink(prefix: string, enabled: boolean): LogSink {
  if (!enabled) return NOOP;
  return console.log.bind(console, `%c${prefix}`, LOG_BADGES[prefix] ?? `background:#475569;${BADGE_TEXT}`);
}

export let logCore: LogSink = createLogSink(LOG_PREFIX, true);
export let logContent: LogSink = createLogSink(LOG_PREFIX_CONTENT, true);
export let logBackground: LogSink = createLogSink(LOG_PREFIX_BACKGROUND, true);
export let logEditor: LogSink = createLogSink(LOG_PREFIX_EDITOR, true);
export let logStore: LogSink = createLogSink(LOG_PREFIX_STORE, true);
export let logAuth: LogSink = createLogSink(LOG_PREFIX_AUTH, true);
export let logError: LogSink = createLogSink(GENERAL_ERROR_LOG, true);

export function configureLogging(enabled: boolean): void {
  logCore = createLogSink(LOG_PREFIX, enabled);
  logContent = createLogSink(LOG_PREFIX_CONTENT, enabled);
  logBackground = createLogSink(LOG_PREFIX_BACKGROUND, enabled);
  logEditor = createLogSink(LOG_PREFIX_EDITOR, enabled);
  logStore = createLogSink(LOG_PREFIX_STORE, enabled);
  logAuth = createLogSink(LOG_PREFIX_AUTH, enabled);
  logError = createLogSink(GENERAL_ERROR_LOG, enabled);
}

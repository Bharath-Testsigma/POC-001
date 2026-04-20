var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};

// .wrangler/tmp/bundle-aVkifZ/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// node_modules/unenv/dist/runtime/_internal/utils.mjs
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
__name(PerformanceEntry, "PerformanceEntry");
var PerformanceMark = /* @__PURE__ */ __name(class PerformanceMark2 extends PerformanceEntry {
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
}, "PerformanceMark");
var PerformanceMeasure = class extends PerformanceEntry {
  entryType = "measure";
};
__name(PerformanceMeasure, "PerformanceMeasure");
var PerformanceResourceTiming = class extends PerformanceEntry {
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
__name(PerformanceResourceTiming, "PerformanceResourceTiming");
var PerformanceObserverEntryList = class {
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
__name(PerformanceObserverEntryList, "PerformanceObserverEntryList");
var Performance = class {
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
__name(Performance, "Performance");
var PerformanceObserver = class {
  __unenv__ = true;
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
__name(PerformanceObserver, "PerformanceObserver");
__publicField(PerformanceObserver, "supportedEntryTypes", []);
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
import { Socket } from "node:net";
var ReadStream = class extends Socket {
  fd;
  constructor(fd) {
    super();
    this.fd = fd;
  }
  isRaw = false;
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
  isTTY = false;
};
__name(ReadStream, "ReadStream");

// node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
import { Socket as Socket2 } from "node:net";
var WriteStream = class extends Socket2 {
  fd;
  constructor(fd) {
    super();
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  columns = 80;
  rows = 24;
  isTTY = false;
};
__name(WriteStream, "WriteStream");

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class extends EventEmitter {
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return "";
  }
  get versions() {
    return {};
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  ref() {
  }
  unref() {
  }
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: () => 0 });
  mainModule = void 0;
  domain = void 0;
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};
__name(Process, "Process");

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var { exit, platform, nextTick } = getBuiltinModule(
  "node:process"
);
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  nextTick
});
var {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  finalization,
  features,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  on,
  off,
  once,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// src/config.ts
var DEFAULT_ANTHROPIC_URL = "https://api.anthropic.com";
var DEFAULT_OPENROUTER_URL = "https://openrouter.ai/api";
function resolveConfig(env2) {
  const anthropicBaseUrl = normalizeBaseUrl(env2.UPSTREAM_ANTHROPIC_BASE_URL ?? DEFAULT_ANTHROPIC_URL, "/v1/messages");
  const openRouterBaseUrl = normalizeBaseUrl(env2.UPSTREAM_OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_URL, "/v1/chat/completions");
  const serverToolsMode = normalizeServerToolsMode(env2.SERVER_TOOLS_MODE);
  const mcpMode = normalizeMcpMode(env2.MCP_BRIDGE_MODE);
  const defaultOpenRouterVendor = (env2.OPENROUTER_DEFAULT_VENDOR?.trim() || "openai").toLowerCase();
  return {
    anthropicBaseUrl,
    openRouterBaseUrl,
    serverToolsMode,
    mcpMode,
    defaultOpenRouterVendor
  };
}
__name(resolveConfig, "resolveConfig");
function normalizeBaseUrl(value, suffix) {
  const trimmed = value.replace(/\/$/, "");
  if (trimmed.endsWith(suffix))
    return trimmed;
  return `${trimmed}${suffix}`;
}
__name(normalizeBaseUrl, "normalizeBaseUrl");
function normalizeServerToolsMode(value) {
  switch ((value ?? "").toLowerCase()) {
    case "enforceanthropic":
    case "enforce-anthropic":
      return "enforceAnthropic";
    case "emulate":
      return "emulate";
    case "error":
    default:
      return "error";
  }
}
__name(normalizeServerToolsMode, "normalizeServerToolsMode");
function normalizeMcpMode(value) {
  switch ((value ?? "").toLowerCase()) {
    case "http-sse":
      return "http-sse";
    default:
      return "off";
  }
}
__name(normalizeMcpMode, "normalizeMcpMode");

// src/errors.ts
var CastariError = class extends Error {
  status;
  type;
  retryable;
  details;
  constructor(status, type, message, options) {
    super(message);
    this.status = status;
    this.type = type;
    this.retryable = options?.retryable ?? false;
    this.details = options?.details;
  }
};
__name(CastariError, "CastariError");
function invalidRequest(message, details) {
  return new CastariError(400, "invalid_request_error", message, { details });
}
__name(invalidRequest, "invalidRequest");
function authenticationError(message = "Authentication failed") {
  return new CastariError(401, "authentication_error", message);
}
__name(authenticationError, "authenticationError");
function errorResponse(error3) {
  const encoder = JSON.stringify;
  if (error3 instanceof CastariError) {
    return new Response(
      encoder({
        type: error3.type,
        message: error3.message,
        retryable: error3.retryable,
        details: error3.details
      }),
      {
        status: error3.status,
        headers: jsonHeaders()
      }
    );
  }
  const message = error3 instanceof Error ? error3.message : "Unknown error";
  return new Response(
    encoder({ type: "api_error", message, retryable: false }),
    { status: 500, headers: jsonHeaders() }
  );
}
__name(errorResponse, "errorResponse");
function jsonHeaders() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store"
  };
}
__name(jsonHeaders, "jsonHeaders");

// src/utils.ts
function getHeader(headers, name) {
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === name.toLowerCase())
      return value;
  }
  return null;
}
__name(getHeader, "getHeader");
async function readJsonBody(request) {
  try {
    const text = await request.text();
    if (!text)
      throw invalidRequest("Request body is empty");
    return JSON.parse(text);
  } catch (error3) {
    if (error3 instanceof SyntaxError) {
      throw invalidRequest("Request body is not valid JSON");
    }
    throw error3;
  }
}
__name(readJsonBody, "readJsonBody");
function normalizeCastariHeaders(headers) {
  return {
    provider: getHeader(headers, "x-castari-provider"),
    originalModel: getHeader(headers, "x-castari-model") ?? void 0,
    wireModel: getHeader(headers, "x-castari-wire-model") ?? void 0
  };
}
__name(normalizeCastariHeaders, "normalizeCastariHeaders");
function randomId(prefix) {
  const base = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${base.replace(/-/g, "")}`;
}
__name(randomId, "randomId");

// src/provider.ts
var SERVER_TOOL_PATTERN = /(Tool_|Tool$)/i;
var WEB_SEARCH_NAMES = /* @__PURE__ */ new Set([
  "websearch",
  "websearchtool",
  "webfetch",
  "webfetchtool"
]);
var SERVER_TOOL_ALIAS = /* @__PURE__ */ new Set([
  "websearch",
  "webfetch",
  "codeexecution",
  "computeruse",
  "texteditor",
  "memorytool"
]);
function resolveProvider(headers, body, config2) {
  const originalModel = body.model;
  const provider = headers.provider ?? inferProviderFromModel(originalModel);
  if (!provider)
    throw invalidRequest(`Unable to infer provider for model ${originalModel}`);
  const wireModel = provider === "openrouter" ? resolveOpenRouterModel(headers.wireModel ?? originalModel, config2.defaultOpenRouterVendor) : originalModel;
  return { provider, wireModel, originalModel };
}
__name(resolveProvider, "resolveProvider");
function inferProviderFromModel(model) {
  const normalized = model.toLowerCase();
  if (normalized.startsWith("claude") || normalized.startsWith("anthropic/"))
    return "anthropic";
  if (normalized.startsWith("or:") || normalized.startsWith("openrouter/") || normalized.startsWith("openai/"))
    return "openrouter";
  return "anthropic";
}
__name(inferProviderFromModel, "inferProviderFromModel");
function resolveOpenRouterModel(model, defaultVendor) {
  if (model.startsWith("or:")) {
    const slug = model.slice(3);
    if (!slug)
      throw invalidRequest('OpenRouter model prefix "or:" must include a slug');
    if (slug.includes("/"))
      return slug;
    return `${defaultVendor}/${slug}`;
  }
  if (model.startsWith("openrouter/"))
    return model.substring("openrouter/".length);
  return model;
}
__name(resolveOpenRouterModel, "resolveOpenRouterModel");
function categorizeServerTools(tools) {
  if (!Array.isArray(tools))
    return [];
  const entries = [];
  for (const tool of tools) {
    if (!isServerTool(tool))
      continue;
    const label = typeof tool.type === "string" && tool.type || typeof tool.name === "string" && tool.name || "server_tool";
    entries.push({
      label,
      kind: isWebSearchTool(tool) ? "websearch" : "other"
    });
  }
  return entries;
}
__name(categorizeServerTools, "categorizeServerTools");
function isServerTool(tool) {
  if (!tool || typeof tool !== "object")
    return false;
  const type = typeof tool.type === "string" ? tool.type : void 0;
  if (type && SERVER_TOOL_PATTERN.test(type))
    return true;
  const name = typeof tool.name === "string" ? tool.name : void 0;
  if (!name)
    return false;
  if (SERVER_TOOL_PATTERN.test(name))
    return true;
  if (SERVER_TOOL_ALIAS.has(name.toLowerCase()))
    return true;
  return false;
}
__name(isServerTool, "isServerTool");
function isWebSearchTool(tool) {
  if (!tool)
    return false;
  const type = typeof tool.type === "string" ? tool.type : void 0;
  if (type && type.toLowerCase().includes("websearch"))
    return true;
  const name = typeof tool.name === "string" ? tool.name : void 0;
  if (!name)
    return false;
  const lower = name.toLowerCase();
  if (lower.includes("websearch"))
    return true;
  if (WEB_SEARCH_NAMES.has(lower))
    return true;
  return false;
}
__name(isWebSearchTool, "isWebSearchTool");

// src/translator.ts
function buildOpenRouterRequest(body, options) {
  const messages = convertMessages(body);
  const request = {
    model: options.wireModel,
    messages,
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    top_p: body.top_p,
    stop: body.stop_sequences,
    stream: body.stream ?? false
  };
  const clientTools = convertTools(body.tools);
  if (clientTools.length)
    request.tools = clientTools;
  const toolChoice = convertToolChoice(body.tool_choice);
  if (toolChoice)
    request.tool_choice = toolChoice;
  if (options.reasoning)
    request.reasoning = options.reasoning;
  if (options.webSearch) {
    request.plugins = [{ id: "web", engine: options.webSearch.engine, max_results: options.webSearch.max_results }];
    request.web_search_options = options.webSearch;
  }
  return request;
}
__name(buildOpenRouterRequest, "buildOpenRouterRequest");
function convertMessages(body) {
  const output = [];
  if (body.system) {
    output.push({ role: "system", content: stringifySystem(body.system) });
  }
  for (const message of body.messages) {
    output.push(...convertMessage(message));
  }
  return output;
}
__name(convertMessages, "convertMessages");
function stringifySystem(system) {
  if (typeof system === "string")
    return system;
  return system.map((block) => block.text).join("\n");
}
__name(stringifySystem, "stringifySystem");
function convertMessage(message) {
  const segments = Array.isArray(message.content) ? message.content : [{ type: "text", text: message.content }];
  const textSegments = [];
  const toolResults = [];
  const toolUses = [];
  for (const segment of segments) {
    if (!segment || typeof segment !== "object")
      continue;
    if (segment.type === "tool_result")
      toolResults.push(segment);
    else if (segment.type === "tool_use")
      toolUses.push(segment);
    else
      textSegments.push(segment);
  }
  const resolved = [];
  if (textSegments.length) {
    resolved.push({ role: message.role, content: convertContentParts(textSegments) });
  }
  if (message.role === "assistant" && toolUses.length) {
    resolved.push({
      role: "assistant",
      content: "",
      tool_calls: toolUses.map((item) => ({
        id: item.type === "tool_use" ? item.id : randomId("tool"),
        type: "function",
        function: {
          name: item.type === "tool_use" ? item.name : "unknown_tool",
          arguments: safeStringify(item.type === "tool_use" ? item.input : {})
        }
      }))
    });
  }
  if (toolResults.length) {
    for (const result of toolResults) {
      resolved.push({
        role: "tool",
        tool_call_id: result.tool_use_id,
        content: deriveToolResultContent(result)
      });
    }
  }
  return resolved.length ? resolved : [{ role: message.role, content: "" }];
}
__name(convertMessage, "convertMessage");
function convertContentParts(parts) {
  const results = [];
  let hasImage = false;
  for (const block of parts) {
    if (block.type === "text") {
      results.push({ type: "text", text: block.text });
    } else if (block.type === "image") {
      hasImage = true;
      if (block.source.type === "url") {
        results.push({ type: "image_url", image_url: { url: block.source.url } });
      } else {
        const dataUri = `data:${block.source.media_type};base64,${block.source.data}`;
        results.push({ type: "image_url", image_url: { url: dataUri } });
      }
    }
  }
  if (!hasImage && results.every((item) => item.type === "text")) {
    return results.map((item) => item.text).join("");
  }
  return results;
}
__name(convertContentParts, "convertContentParts");
function convertTools(tools) {
  if (!Array.isArray(tools))
    return [];
  const converted = [];
  for (const tool of tools) {
    if (isServerTool(tool))
      continue;
    if (!tool?.name || !tool.input_schema)
      continue;
    converted.push({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema
      }
    });
  }
  return converted;
}
__name(convertTools, "convertTools");
function convertToolChoice(choice) {
  if (!choice)
    return void 0;
  if (choice === "auto")
    return "auto";
  if (choice === "none")
    return "none";
  if (typeof choice === "object" && "name" in choice) {
    return { type: "function", function: { name: choice.name } };
  }
  return "auto";
}
__name(convertToolChoice, "convertToolChoice");
function deriveToolResultContent(result) {
  if (result.type !== "tool_result")
    return "";
  if (typeof result.content === "string")
    return result.content;
  if (Array.isArray(result.content)) {
    return result.content.map((block) => block.type === "text" ? block.text : "").join("\n");
  }
  return "";
}
__name(deriveToolResultContent, "deriveToolResultContent");
function safeStringify(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}
__name(safeStringify, "safeStringify");
function mapOpenRouterResponse(providerResponse, originalModel) {
  const choice = providerResponse.choices[0];
  if (!choice)
    throw invalidRequest("OpenRouter response missing choices");
  const content = [];
  if (choice.message?.content) {
    content.push(...convertOpenRouterContent(choice.message.content));
  }
  if (choice.message?.tool_calls) {
    for (const call of choice.message.tool_calls) {
      content.push({
        type: "tool_use",
        id: call.id,
        name: call.function.name,
        input: parseToolArguments(call.function.arguments)
      });
    }
  }
  const usage = providerResponse.usage ? {
    input_tokens: providerResponse.usage.prompt_tokens,
    output_tokens: providerResponse.usage.completion_tokens,
    reasoning_tokens: providerResponse.usage.reasoning_tokens
  } : void 0;
  return {
    id: providerResponse.id ?? randomId("msg"),
    type: "message",
    role: "assistant",
    model: originalModel,
    stop_reason: mapStopReason(choice.finish_reason),
    stop_sequence: null,
    content,
    usage
  };
}
__name(mapOpenRouterResponse, "mapOpenRouterResponse");
function convertOpenRouterContent(content) {
  if (!content)
    return [];
  if (typeof content === "string")
    return [{ type: "text", text: content }];
  return content.map(
    (part) => part.type === "text" ? { type: "text", text: part.text } : { type: "image", source: { type: "url", url: part.image_url.url } }
  );
}
__name(convertOpenRouterContent, "convertOpenRouterContent");
function parseToolArguments(value) {
  if (!value)
    return {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
__name(parseToolArguments, "parseToolArguments");
function mapStopReason(reason) {
  if (!reason)
    return null;
  switch (reason) {
    case "stop":
      return "end_turn";
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "content_filter";
    default:
      return reason;
  }
}
__name(mapStopReason, "mapStopReason");

// src/stream.ts
function streamOpenRouterToAnthropic(upstream, options) {
  if (!upstream.body)
    throw new Error("Upstream response has no body to stream");
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  const messageId = randomId("msg");
  const stream = new ReadableStream({
    async start(controller) {
      const send2 = /* @__PURE__ */ __name((event, payload) => {
        controller.enqueue(encoder.encode(`event: ${event}
data: ${JSON.stringify(payload)}

`));
      }, "send");
      send2("message_start", {
        type: "message_start",
        message: {
          id: messageId,
          type: "message",
          role: "assistant",
          model: options.originalModel,
          content: []
        }
      });
      let buffer = "";
      let textBlockOpen = false;
      let contentIndex = 0;
      let accumulatedStopReason = null;
      const toolBlocks = /* @__PURE__ */ new Map();
      const flushTextBlockStop = /* @__PURE__ */ __name(() => {
        if (textBlockOpen) {
          send2("content_block_stop", { type: "content_block_stop", index: 0 });
          textBlockOpen = false;
        }
      }, "flushTextBlockStop");
      const ensureTextBlock = /* @__PURE__ */ __name(() => {
        if (!textBlockOpen) {
          textBlockOpen = true;
          contentIndex = 0;
          send2("content_block_start", {
            type: "content_block_start",
            index: contentIndex,
            content_block: { type: "text", text: "" }
          });
        }
      }, "ensureTextBlock");
      const ensureToolBlock = /* @__PURE__ */ __name((call) => {
        let state = toolBlocks.get(call.id);
        if (!state) {
          const index = toolBlocks.size + 1;
          state = { index, name: call.function.name, id: call.id, buffer: "", open: false };
          toolBlocks.set(call.id, state);
        }
        if (!state.open) {
          state.open = true;
          send2("content_block_start", {
            type: "content_block_start",
            index: state.index,
            content_block: { type: "tool_use", id: state.id, name: state.name, input: {} }
          });
        }
        return state;
      }, "ensureToolBlock");
      const handleToolCalls = /* @__PURE__ */ __name((toolCalls) => {
        if (!toolCalls?.length)
          return;
        for (const call of toolCalls) {
          const state = ensureToolBlock(call);
          if (call.function.arguments) {
            state.buffer += call.function.arguments;
            send2("content_block_delta", {
              type: "content_block_delta",
              index: state.index,
              delta: { type: "input_json_delta", partial_json: call.function.arguments }
            });
          }
        }
      }, "handleToolCalls");
      const handleChunk = /* @__PURE__ */ __name((json) => {
        const choice = json?.choices?.[0];
        if (!choice)
          return;
        if (choice.delta?.content) {
          const delta = choice.delta.content;
          const text = typeof delta === "string" ? delta : Array.isArray(delta) ? delta.map((d) => d?.text ?? "").join("") : "";
          if (text) {
            ensureTextBlock();
            send2("content_block_delta", {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text }
            });
          }
        }
        handleToolCalls(choice.delta?.tool_calls);
        if (choice.finish_reason) {
          accumulatedStopReason = mapStopReason(choice.finish_reason);
        }
        if (json.usage) {
          send2("message_delta", {
            type: "message_delta",
            delta: {
              usage: {
                input_tokens: json.usage.prompt_tokens,
                output_tokens: json.usage.completion_tokens,
                reasoning_tokens: json.usage.reasoning_tokens
              }
            }
          });
        }
      }, "handleChunk");
      const finalizeToolBlocks = /* @__PURE__ */ __name(() => {
        for (const block of toolBlocks.values()) {
          if (!block.open)
            continue;
          if (block.buffer) {
            send2("content_block_delta", {
              type: "content_block_delta",
              index: block.index,
              delta: { type: "input_json_delta", partial_json: "" }
            });
          }
          send2("content_block_stop", { type: "content_block_stop", index: block.index });
          block.open = false;
        }
      }, "finalizeToolBlocks");
      while (true) {
        const { value, done } = await reader.read();
        if (done)
          break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          processEvent(rawEvent.trim());
          boundary = buffer.indexOf("\n\n");
        }
      }
      flushTextBlockStop();
      finalizeToolBlocks();
      send2("message_stop", {
        type: "message_stop",
        stop_reason: accumulatedStopReason ?? "end_turn"
      });
      controller.close();
      function processEvent(raw) {
        if (!raw || raw.startsWith(":"))
          return;
        const lines = raw.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data:"))
            continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") {
            flushTextBlockStop();
            finalizeToolBlocks();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            handleChunk(parsed);
          } catch (error3) {
          }
        }
      }
      __name(processEvent, "processEvent");
    }
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store"
    },
    status: upstream.status
  });
}
__name(streamOpenRouterToAnthropic, "streamOpenRouterToAnthropic");

// src/index.ts
var src_default = {
  async fetch(request, env2) {
    try {
      if (new URL(request.url).pathname !== "/v1/messages" || request.method !== "POST") {
        return new Response("Not found", { status: 404 });
      }
      const config2 = resolveConfig(env2);
      const headers = normalizeCastariHeaders(request.headers);
      const body = await readJsonBody(request.clone());
      const authHeader = extractApiKey(request.headers);
      const metadata = normalizeMetadata(body.metadata);
      const reasoning = metadata?.castari?.reasoning;
      let webSearch = metadata?.castari?.web_search_options;
      let { provider, wireModel, originalModel } = resolveProvider(headers, body, config2);
      const serverToolEntries = categorizeServerTools(body.tools);
      const webSearchTools = serverToolEntries.filter((entry) => entry.kind === "websearch");
      const otherServerTools = serverToolEntries.filter((entry) => entry.kind === "other");
      if (provider === "openrouter" && otherServerTools.length) {
        if (config2.serverToolsMode === "error") {
          throw invalidRequest("Server tools require Anthropic provider", {
            tools: otherServerTools.map((entry) => entry.label)
          });
        }
        if (config2.serverToolsMode === "enforceAnthropic") {
          provider = "anthropic";
          wireModel = originalModel;
        }
      }
      if (provider === "openrouter") {
        const wantsWebSearch = webSearchTools.length > 0;
        if (wantsWebSearch && !webSearch) {
          webSearch = {};
        }
      }
      if (body.mcp_servers?.length && provider === "openrouter" && env2.MCP_BRIDGE_MODE !== "http-sse") {
        throw invalidRequest("MCP servers require Anthropic routing or http-sse bridge", { mode: env2.MCP_BRIDGE_MODE ?? "off" });
      }
      if (provider === "anthropic") {
        return proxyAnthropic(body, request, authHeader.value, config2.anthropicBaseUrl);
      }
      return handleOpenRouter({
        body,
        wireModel,
        originalModel,
        apiKey: authHeader.value,
        config: config2,
        reasoning,
        webSearch
      });
    } catch (error3) {
      return errorResponse(error3);
    }
  }
};
function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object")
    return void 0;
  return metadata;
}
__name(normalizeMetadata, "normalizeMetadata");
function extractApiKey(headers) {
  const auth = headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token)
      return { value: token, type: "bearer" };
  }
  const key = headers.get("x-api-key");
  if (key)
    return { value: key, type: "x-api-key" };
  throw authenticationError("Missing API key");
}
__name(extractApiKey, "extractApiKey");
async function proxyAnthropic(body, request, apiKey, upstreamUrl) {
  const upstreamResp = await fetch(upstreamUrl, {
    method: "POST",
    headers: buildAnthropicHeaders(request.headers, apiKey),
    body: JSON.stringify(body)
  });
  if (!upstreamResp.ok) {
    const text = await upstreamResp.text();
    return new Response(text || JSON.stringify({ error: "Anthropic upstream error" }), {
      status: upstreamResp.status,
      headers: {
        "content-type": upstreamResp.headers.get("content-type") ?? "application/json"
      }
    });
  }
  return upstreamResp;
}
__name(proxyAnthropic, "proxyAnthropic");
function buildAnthropicHeaders(original, apiKey) {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("x-api-key", apiKey);
  const anthropicVersion = original.get("anthropic-version");
  if (anthropicVersion)
    headers.set("anthropic-version", anthropicVersion);
  return headers;
}
__name(buildAnthropicHeaders, "buildAnthropicHeaders");
async function handleOpenRouter(ctx) {
  const openRouterRequest = buildOpenRouterRequest(ctx.body, {
    wireModel: ctx.wireModel,
    reasoning: ctx.reasoning,
    webSearch: ctx.webSearch
  });
  const upstreamResp = await fetch(ctx.config.openRouterBaseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ctx.apiKey}`
    },
    body: JSON.stringify(openRouterRequest)
  });
  if (ctx.body.stream) {
    if (!upstreamResp.ok) {
      const payload = await upstreamResp.text();
      throw invalidRequest("OpenRouter streaming error", { status: upstreamResp.status, body: payload });
    }
    return streamOpenRouterToAnthropic(upstreamResp, { originalModel: ctx.originalModel });
  }
  const json = await upstreamResp.json();
  if (!upstreamResp.ok) {
    throw invalidRequest("OpenRouter error", { status: upstreamResp.status, body: json });
  }
  const responseBody = mapOpenRouterResponse(json, ctx.originalModel);
  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    }
  });
}
__name(handleOpenRouter, "handleOpenRouter");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env2, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env2);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env2, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env2);
  } catch (e) {
    const error3 = reduceError(e);
    return Response.json(error3, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-aVkifZ/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env2, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env2, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env2, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env2, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-aVkifZ/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env2, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env2, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env2, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env2, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env2, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env2, ctx) => {
      this.env = env2;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map

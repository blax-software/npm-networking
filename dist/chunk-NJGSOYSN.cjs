'use strict';

// src/types.ts
var browserStorage = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
    }
  }
};
var memoryStorage = () => {
  const store = /* @__PURE__ */ new Map();
  return {
    get: (key) => store.get(key) ?? null,
    set: (key, value) => {
      store.set(key, value);
    },
    remove: (key) => {
      store.delete(key);
    }
  };
};
var plainRef = (initial) => ({ value: initial });

// src/api.ts
function serializeParams(params, prefix = "") {
  const parts = [];
  for (const key in params) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
    const value = params[key];
    if (value === void 0 || value === null) continue;
    const newKey = prefix ? `${prefix}[${encodeURIComponent(key)}]` : encodeURIComponent(key);
    if (typeof value === "object" && !Array.isArray(value)) {
      parts.push(serializeParams(value, newKey));
    } else {
      parts.push(`${newKey}=${encodeURIComponent(value)}`);
    }
  }
  return parts.filter(Boolean).join("&");
}
var fetchAdapter = {
  async request(config) {
    let url = config.url;
    if (config.params) {
      const qs = serializeParams(config.params);
      if (qs) url += (url.includes("?") ? "&" : "?") + qs;
    }
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...config.headers ?? {}
    };
    const init = {
      method: config.method,
      headers,
      credentials: config.withCredentials ? "include" : "same-origin"
    };
    if (config.timeout && typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
      init.signal = AbortSignal.timeout(config.timeout);
    }
    if (config.data !== void 0 && config.method !== "GET") {
      if (typeof FormData !== "undefined" && config.data instanceof FormData) {
        init.body = config.data;
        delete init.headers["Content-Type"];
      } else {
        init.body = JSON.stringify(config.data);
      }
    }
    const res = await fetch(url, init);
    const contentType = res.headers.get("content-type") ?? "";
    let data;
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }
    if (!res.ok) {
      const error = new Error(data?.message ?? `HTTP ${res.status}`);
      error.response = { data, status: res.status, headers: {} };
      error.status = res.status;
      throw error;
    }
    const responseHeaders = {};
    res.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });
    return { data, status: res.status, headers: responseHeaders };
  }
};
var ApiClient = class {
  _config;
  _http;
  _storage;
  _notify;
  _bearerToken = "";
  /**
   * When true, `parseError` throws without showing notifications.
   * Useful during app bootstrap to suppress transient errors.
   */
  silentErrors = false;
  constructor(config) {
    this._config = {
      timeout: 1e4,
      withCredentials: true,
      apiPrefix: "api/",
      storageKey: "bearerToken",
      retryOn503: true,
      maxRetries: 2,
      ...config
    };
    this._http = config.http ?? fetchAdapter;
    this._storage = config.storage ?? (this._isServer() ? memoryStorage() : browserStorage);
    this._notify = config.notify;
  }
  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------
  /** Update configuration at runtime. */
  configure(partial) {
    Object.assign(this._config, partial);
    if (partial.http) this._http = partial.http;
    if (partial.storage) this._storage = partial.storage;
    if (partial.notify !== void 0) this._notify = partial.notify;
  }
  _isServer() {
    const s = this._config.isServer;
    return typeof s === "function" ? s() : s ?? false;
  }
  // -------------------------------------------------------------------------
  // URL helpers
  // -------------------------------------------------------------------------
  /** Resolve the current backend base URL (trailing slash guaranteed). */
  getBackendUrl() {
    const getter = this._isServer() && this._config.ssrServerUrl ? this._config.ssrServerUrl : this._config.serverUrl;
    let url = typeof getter === "function" ? getter() : getter;
    if (!url) throw new Error("[networking] serverUrl is not configured");
    if (!url.endsWith("/")) url += "/";
    return url;
  }
  /**
   * Build a full URL for a client asset served from a warehouse endpoint.
   * Override in subclass or configure a custom path if your backend differs.
   */
  clientAsset(path) {
    return this.getBackendUrl() + "warehouse/" + path + "?clientasset=true";
  }
  /**
   * Normalize a URL path:
   * - Leading `/` is stripped (treated as absolute relative to backend root).
   * - Otherwise, `apiPrefix` is prepended if absent.
   */
  cleanseUrl(url) {
    if (url.startsWith("/")) return url.substring(1);
    if (!url.startsWith(this._config.apiPrefix)) return this._config.apiPrefix + url;
    return url;
  }
  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  get bearerToken() {
    return this._bearerToken;
  }
  setBearer(token) {
    if (!token) {
      this._bearerToken = "";
      if (!this._isServer()) {
        this._storage.remove(this._config.storageKey);
      }
      return;
    }
    this._bearerToken = token;
    if (!this._isServer()) {
      this._storage.set(this._config.storageKey, token);
    }
  }
  /** Read the bearer token from storage and activate it. Returns the token or null. */
  loadBearerFromStorage() {
    if (this._isServer()) return null;
    const token = this._storage.get(this._config.storageKey);
    if (token) this._bearerToken = token;
    return token;
  }
  // -------------------------------------------------------------------------
  // Internal request plumbing
  // -------------------------------------------------------------------------
  _buildHeaders(overrides) {
    const base = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
    if (this._bearerToken) {
      base["Authorization"] = `Bearer ${this._bearerToken}`;
    }
    const defaults = this._config.defaultHeaders;
    if (defaults) {
      Object.assign(base, typeof defaults === "function" ? defaults() : defaults);
    }
    if (overrides) Object.assign(base, overrides);
    return base;
  }
  async _request(config, attempt = 0) {
    try {
      return await this._http.request(config);
    } catch (error) {
      if (this._config.retryOn503 && error?.status === 503 && attempt < this._config.maxRetries) {
        const backoffMs = (attempt + 1) * 1e3;
        await new Promise((r) => setTimeout(r, backoffMs));
        return this._request(config, attempt + 1);
      }
      throw error;
    }
  }
  // -------------------------------------------------------------------------
  // HTTP verbs
  // -------------------------------------------------------------------------
  async get(url, params) {
    return this._request({
      method: "GET",
      url: this.getBackendUrl() + this.cleanseUrl(url),
      params,
      headers: this._buildHeaders(),
      timeout: this._config.timeout,
      withCredentials: this._config.withCredentials
    });
  }
  async post(url, data, headers) {
    return this._request({
      method: "POST",
      url: this.getBackendUrl() + this.cleanseUrl(url),
      data,
      headers: this._buildHeaders(headers),
      timeout: this._config.timeout,
      withCredentials: this._config.withCredentials
    });
  }
  async put(url, data) {
    return this._request({
      method: "PUT",
      url: this.getBackendUrl() + this.cleanseUrl(url),
      data,
      headers: this._buildHeaders(),
      timeout: this._config.timeout,
      withCredentials: this._config.withCredentials
    });
  }
  async delete(url, headers) {
    return this._request({
      method: "DELETE",
      url: this.getBackendUrl() + this.cleanseUrl(url),
      headers: this._buildHeaders(headers),
      timeout: this._config.timeout,
      withCredentials: this._config.withCredentials
    });
  }
  async patch(url, data) {
    return this._request({
      method: "PATCH",
      url: this.getBackendUrl() + this.cleanseUrl(url),
      data,
      headers: this._buildHeaders(),
      timeout: this._config.timeout,
      withCredentials: this._config.withCredentials
    });
  }
  /**
   * Fetch a CSRF cookie. The default path matches Laravel Sanctum
   * but you can pass any path your backend uses.
   */
  async csrf(path = "/sanctum/csrf-cookie") {
    return this.get(path);
  }
  // -------------------------------------------------------------------------
  // Error / success handlers
  // -------------------------------------------------------------------------
  /**
   * Extract a readable error message, optionally show a notification, and re-throw.
   * Designed as a `.catch()` handler: `api.get('x').catch(api.parseError)`
   */
  parseError = (e) => {
    console.error(e);
    const text = e?.response?.data?.message ?? e?.response?.message ?? e?.message ?? e?.response?.data?.errors ?? "An unknown error occurred";
    if (this._notify && !this.silentErrors) {
      this._notify({
        text: typeof text === "string" ? text : JSON.stringify(text),
        type: "error",
        errors: e?.response?.data?.errors,
        timeout: 3e3
      });
    }
    throw e;
  };
  /**
   * Show a success notification from a response.
   * Usage: `api.post('x').then(api.parseThen)`
   */
  parseThen = (res, fallback) => {
    const msg = res?.data?.message ?? res?.message ?? fallback ?? "Success";
    if (this._notify) {
      this._notify(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
  };
};
function createApiClient(config) {
  return new ApiClient(config);
}

// src/ws.ts
var _isProtocolEvent = (event) => /[.:](?:subscribe|unsubscribe|ping|pong)$/.test(event);
function createSsrStub(createRef) {
  return {
    socket: null,
    channels: [],
    is_opened: createRef(false),
    is_setup: createRef(false),
    is_connecting_socket: createRef(false),
    is_after_lost_connection: createRef(false),
    heartbeat: null,
    last_reconnect_try: 0,
    send_queue: [],
    connect: () => Promise.resolve(),
    ensureConnected: () => Promise.resolve(),
    channel: () => Promise.resolve(void 0),
    send: () => Promise.resolve(null),
    unsubscribe: () => Promise.resolve(true),
    listen: () => () => {
    },
    listenOnce: () => Promise.resolve(null),
    setAppReady: () => {
    },
    resetConnection: () => {
    },
    configure: () => {
    },
    destroy: () => {
    }
  };
}
var WebsocketChannel = class {
  name;
  is_established = false;
  _establishPromise = null;
  _ws;
  constructor(name, ws) {
    this.name = name;
    this._ws = ws;
    ws.channels.push(this);
  }
  async establish() {
    if (this.is_established && this._ws.is_setup.value) return this;
    this._establishPromise ??= this._doEstablish();
    return this._establishPromise;
  }
  async _doEstablish() {
    try {
      await this._ws.ensureConnected();
      const authtoken = this._ws._getAuthToken();
      await this._ws.send(
        "websocket.subscribe",
        { channel: this.name, authtoken: authtoken ?? void 0 },
        null
      );
      this.is_established = true;
      this._ws.is_setup.value = true;
      return this;
    } catch (error) {
      this.is_established = false;
      this._establishPromise = null;
      throw error;
    }
  }
  async send(event, data = {}) {
    if (!_isProtocolEvent(event) && !this.is_established) await this.establish();
    return this._ws.send(event, data, _isProtocolEvent(event) ? null : this.name);
  }
  async unsubscribe() {
    if (this.is_established) {
      await this._ws.send("websocket.unsubscribe", { channel: this.name }, this.name).catch(() => {
      });
    }
    this._ws.channels = this._ws.channels.filter((c) => c !== this);
    return true;
  }
};
var WsClientImpl = class extends EventTarget {
  _config;
  _notify;
  _translate;
  socket = null;
  channels = [];
  is_opened;
  is_setup;
  is_connecting_socket;
  is_after_lost_connection;
  heartbeat = null;
  last_reconnect_try = 0;
  send_queue = [];
  // App-readiness gate
  _appReady = false;
  _appReadyResolve = null;
  _appReadyPromise;
  // Connection-ready promise
  _connectedResolve = null;
  _connectedPromise = null;
  // Connect promise coalescing
  _connectPromise = null;
  constructor(config, createRef) {
    super();
    this._config = {
      defaultChannel: "websocket",
      heartbeatInterval: 2e4,
      reconnectDelay: 3e3,
      reconnectThrottle: 3e3,
      autoReconnect: true,
      showConnectionNotifications: true,
      ...config
    };
    this._notify = config.notify;
    this._translate = config.translate;
    this.is_opened = createRef(false);
    this.is_setup = createRef(false);
    this.is_connecting_socket = createRef(false);
    this.is_after_lost_connection = createRef(false);
    this._appReadyPromise = new Promise((r) => {
      this._appReadyResolve = r;
    });
  }
  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------
  configure(partial) {
    Object.assign(this._config, partial);
    if (partial.notify !== void 0) this._notify = partial.notify;
    if (partial.translate !== void 0) this._translate = partial.translate;
  }
  /** @internal — called by channels to obtain the current auth token */
  _getAuthToken() {
    return this._config.getAuthToken?.();
  }
  _isNativePlatform() {
    const v = this._config.isNativePlatform;
    return typeof v === "function" ? v() : v ?? false;
  }
  _getUrl() {
    const u = this._config.url;
    return typeof u === "function" ? u() : u;
  }
  _t(key, fallback) {
    if (this._translate) {
      const result = this._translate(key);
      if (result) return result;
    }
    return fallback;
  }
  _shouldNotify() {
    return this._config.showConnectionNotifications !== false && !this._isNativePlatform() && !!this._notify;
  }
  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------
  ensureConnected() {
    if (this.socket?.socket_id && this.is_opened.value) return Promise.resolve();
    if (!this._connectedPromise) {
      this._connectedPromise = new Promise((r) => {
        this._connectedResolve = r;
      });
      this.connect().catch(() => {
      });
    }
    return this._connectedPromise;
  }
  setAppReady() {
    this._appReady = true;
    this._appReadyResolve?.();
  }
  resetConnection() {
    for (const ch of this.channels) {
      const c = ch;
      c.is_established = false;
      c._establishPromise = null;
    }
    this.is_setup.value = false;
  }
  async connect(force_reset = false) {
    if (force_reset && this.socket) {
      try {
        this.socket.close();
      } catch {
      }
      this.socket = null;
      this._connectPromise = null;
    }
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) return this.socket;
    if (this._connectPromise) return this._connectPromise;
    const throttle = this._config.reconnectThrottle ?? 3e3;
    if (this.last_reconnect_try && Date.now() - this.last_reconnect_try < throttle) {
      console.log("[ws] Reconnect too fast, skipping");
      return;
    }
    this.last_reconnect_try = Date.now();
    this._connectPromise = this._doConnect(force_reset);
    return this._connectPromise;
  }
  _doConnect(force_reset) {
    const hbInterval = this._config.heartbeatInterval ?? 2e4;
    if (force_reset || !this.heartbeat) {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => {
        if (this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send('{"event":"websocket.ping","data":{}}');
        }
      }, hbInterval);
    }
    if (force_reset) this.channels = [];
    const url = this._getUrl();
    console.debug("[blax-networking] Connecting to", url);
    this.socket = new WebSocket(url);
    this.is_connecting_socket.value = true;
    this._config.onConnectionStateChange?.("connecting");
    return new Promise((resolve, reject) => {
      const socket = this.socket;
      socket.addEventListener("error", () => {
        this.is_connecting_socket.value = false;
        this._connectPromise = null;
        reject(new Error("WebSocket error"));
      });
      socket.addEventListener("close", () => {
        this.channels = [];
        this.is_connecting_socket.value = false;
        this.is_opened.value = false;
        this.is_setup.value = false;
        this.socket = null;
        this._connectPromise = null;
        this._connectedPromise = null;
        this._connectedResolve = null;
        this.is_after_lost_connection.value = true;
        if (this._shouldNotify()) {
          const text = this._t("websocket.connectionlost", "Connection lost. Reconnecting\u2026");
          this._notify({ id: "websocket-connection-state", type: "info", text, timeout: 5e4 });
        }
        this._config.onConnectionStateChange?.("disconnected");
        if (this._appReady && this._config.autoReconnect !== false) {
          const delay = this._config.reconnectDelay ?? 3e3;
          this._config.onConnectionStateChange?.("reconnecting");
          setTimeout(() => this.connect().catch(() => {
          }), delay);
        }
        reject(new Error("Socket closed"));
      });
      socket.addEventListener("open", () => {
        if (this.is_after_lost_connection.value && this._shouldNotify()) {
          const text = this._t("websocket.connectionrestored", "Connection restored");
          this._notify({ id: "websocket-connection-state", type: "success", text, timeout: 1e3 });
        }
        this.is_opened.value = true;
        this._config.onConnectionStateChange?.("connected");
        socket.send('{"event":"websocket.ping","data":{}}');
        setTimeout(() => {
          if (this.socket === socket && !socket.socket_id) {
            const wsUrl = this._getUrl();
            console.error(
              '[blax-networking] WebSocket opened but server did not send "websocket.connection_established" within 5s.\nConnected to: ' + wsUrl + "\nThis usually means the app key in the URL does not match any app configured on the backend (PUSHER_APP_KEY). Check that the path segment after /app/ matches the server's PUSHER_APP_KEY."
            );
          }
        }, 5e3);
      });
      socket.addEventListener("message", (raw) => {
        const msg = JSON.parse(raw.data);
        if (msg?.event === "websocket.connection_established") {
          const data = JSON.parse(msg.data);
          if (data?.socket_id && this.socket) {
            this.socket.socket_id = data.socket_id;
            this.is_connecting_socket.value = false;
            resolve(this.socket);
            this._connectedResolve?.();
            this.channel();
            this._workSendQueue();
          }
          return;
        }
        if (msg?.data && typeof msg.data === "string") {
          try {
            msg.data = JSON.parse(msg.data);
          } catch {
          }
        }
        this.dispatchEvent(
          new CustomEvent(msg.event, {
            detail: { event: msg.event, data: msg.data, channel: msg.channel }
          })
        );
      });
    });
  }
  // -------------------------------------------------------------------------
  // Channel management
  // -------------------------------------------------------------------------
  async channel(channel_name = null) {
    channel_name ??= this._config.defaultChannel ?? "websocket";
    const existing = this.channels.find((c) => c.name === channel_name);
    return (existing ?? new WebsocketChannel(channel_name, this)).establish();
  }
  async _workSendQueue() {
    if (!this.send_queue.length) return;
    const queue = this.send_queue;
    this.send_queue = [];
    for (const payload of queue) {
      await this.channel(payload.channel);
      this.socket?.send(JSON.stringify(payload));
    }
  }
  // -------------------------------------------------------------------------
  // Send / receive
  // -------------------------------------------------------------------------
  async send(event, data = {}, channel_name = null, progress, _retryOnSubscriptionLost = true) {
    if (!this._appReady && !_isProtocolEvent(event)) {
      await this._appReadyPromise;
    }
    channel_name ??= this._config.defaultChannel ?? "websocket";
    if (!this.socket) await this.connect();
    let sendingevent;
    if (event === "websocket.subscribe") {
      sendingevent = "websocket.subscribe";
      channel_name = null;
    } else {
      sendingevent = event + "[" + Math.random().toString(36).substring(7) + "]";
    }
    const payload = { event: sendingevent, data, channel: channel_name };
    if (channel_name && !_isProtocolEvent(event)) {
      await this.channel(channel_name);
    }
    if (this.is_opened.value && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    } else {
      this.send_queue.push(payload);
    }
    await this.connect();
    if (!this.socket) throw new Error("Socket not connected");
    const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.removeEventListener(sendingevent + ":progress", handler);
        this.removeEventListener(sendingevent + ":error", handler);
        this.removeEventListener(sendingevent + ":response", handler);
      };
      const handler = (m) => {
        const msg = m.detail;
        const duration = Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTime
        );
        if (event === "websocket.subscribe" && msg?.data?.channel === channel_name || msg?.event?.includes(sendingevent + ":response")) {
          cleanup();
          console.log(`[ws] ${sendingevent} ${duration}ms`);
          resolve(msg.data);
          return;
        }
        if (msg?.event?.includes(sendingevent + ":error") || msg?.event?.includes(sendingevent + ":timeout")) {
          cleanup();
          console.log(`[ws] ${sendingevent} failed ${duration}ms`);
          reject(msg.data);
          return;
        }
        if (progress && msg?.event?.includes(sendingevent + ":progress")) {
          progress(msg.data);
        }
      };
      this.addEventListener(sendingevent + ":progress", handler);
      this.addEventListener(sendingevent + ":error", handler);
      this.addEventListener(sendingevent + ":response", handler);
    }).catch((error) => {
      if (_retryOnSubscriptionLost && error?.message === "Subscription not established") {
        const ch = this.channels.find(
          (c) => c.name === channel_name
        );
        if (ch) {
          ch.is_established = false;
          ch._establishPromise = null;
        }
        console.log("[ws] Re-establishing channel after subscription loss");
        return this.send(event, data, channel_name, progress, false);
      }
      throw error;
    });
  }
  // -------------------------------------------------------------------------
  // Event listeners (framework-agnostic — return cleanup function)
  // -------------------------------------------------------------------------
  listen(event, channel_name, callback) {
    channel_name ??= this._config.defaultChannel ?? "websocket";
    const handler = (m) => {
      if (m.detail.channel === channel_name) callback(m.detail.data);
    };
    this.addEventListener(event, handler);
    return () => this.removeEventListener(event, handler);
  }
  listenOnce(event, channel_name) {
    channel_name ??= this._config.defaultChannel ?? "websocket";
    return new Promise((resolve) => {
      const handler = (m) => {
        if (m.detail.channel === channel_name) {
          resolve(m.detail.data);
          this.removeEventListener(event, handler);
        }
      };
      this.addEventListener(event, handler);
    });
  }
  async unsubscribe(channel_name) {
    channel_name ??= this._config.defaultChannel ?? "websocket";
    const channel = this.channels.find((c) => c.name === channel_name);
    if (channel) await channel.unsubscribe();
    this.channels = this.channels.filter((c) => c.name !== channel_name);
    return true;
  }
  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  destroy() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
      }
      this.socket = null;
    }
    this.channels = [];
    this.send_queue = [];
    this.is_opened.value = false;
    this.is_setup.value = false;
    this.is_connecting_socket.value = false;
  }
};
function createWsClient(config, createRef = plainRef) {
  const isServer = typeof config.isServer === "function" ? config.isServer() : config.isServer ?? false;
  if (isServer) return createSsrStub(createRef);
  const url = typeof config.url === "function" ? config.url() : config.url;
  if (!url || url === "wss:///app/" || url === "ws:///app/") {
    console.error(
      "[blax-networking] WebSocket URL is empty or malformed: " + JSON.stringify(url) + "\nEnsure WEBS_URL and PUSHER_APP_KEY are configured. Expected format: wss://your-ws-host/app/{appKey}"
    );
  } else if (url.endsWith("/app/") || url.endsWith("/app")) {
    console.error(
      "[blax-networking] WebSocket URL is missing the app key: " + url + "\nEnsure PUSHER_APP_KEY is set. The URL must end with /app/{appKey} where {appKey} matches the PUSHER_APP_KEY on the backend."
    );
  }
  return new WsClientImpl(config, createRef);
}

exports.browserStorage = browserStorage;
exports.createApiClient = createApiClient;
exports.createWsClient = createWsClient;
exports.fetchAdapter = fetchAdapter;
exports.memoryStorage = memoryStorage;
exports.plainRef = plainRef;

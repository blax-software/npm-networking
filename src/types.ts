// ---------------------------------------------------------------------------
// Notification adapter
// ---------------------------------------------------------------------------

export interface NotifyOptions {
  id?: string | number
  text: string
  type: 'success' | 'error' | 'warning' | 'info'
  timeout?: number
  errors?: any
}

export type NotifyFn = (opts: NotifyOptions | string, type?: NotifyOptions['type']) => void
export type TranslateFn = (key: string) => string | null

// ---------------------------------------------------------------------------
// Storage adapter (replaces direct localStorage usage)
// ---------------------------------------------------------------------------

export interface StorageAdapter {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

/** Default browser localStorage adapter. Safe for SSR (returns null on failure). */
export const browserStorage: StorageAdapter = {
  get: (key) => {
    try { return localStorage.getItem(key) } catch { return null }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, value) } catch {}
  },
  remove: (key) => {
    try { localStorage.removeItem(key) } catch {}
  },
}

/** In-memory storage. Use for SSR or test environments. */
export const memoryStorage = (): StorageAdapter => {
  const store = new Map<string, string>()
  return {
    get: (key) => store.get(key) ?? null,
    set: (key, value) => { store.set(key, value) },
    remove: (key) => { store.delete(key) },
  }
}

// ---------------------------------------------------------------------------
// HTTP adapter interface (fetch or axios or anything else)
// ---------------------------------------------------------------------------

export interface HttpResponse<T = any> {
  data: T
  status: number
  headers: Record<string, string>
}

export interface HttpAdapter {
  request<T = any>(config: HttpRequestConfig): Promise<HttpResponse<T>>
}

export interface HttpRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  data?: any
  headers?: Record<string, string>
  params?: Record<string, any>
  timeout?: number
  withCredentials?: boolean
}

// ---------------------------------------------------------------------------
// API client config
// ---------------------------------------------------------------------------

export interface ApiClientConfig {
  /** Base URL for HTTP requests. String or getter for dynamic resolution. */
  serverUrl: string | (() => string)

  /**
   * Optional separate URL for server-side requests (e.g. internal Docker network).
   * Only used when `isServer` returns true.
   */
  ssrServerUrl?: string | (() => string)

  /** HTTP adapter. Defaults to built-in fetch adapter. */
  http?: HttpAdapter

  /** Notification callback for errors and success messages. */
  notify?: NotifyFn

  /** Token persistence adapter. Defaults to browserStorage. */
  storage?: StorageAdapter

  /** Key under which the bearer token is stored. Default: `'bearerToken'` */
  storageKey?: string

  /** Default request timeout in ms. Default: `10000` */
  timeout?: number

  /** Whether to include credentials (cookies). Default: `true` */
  withCredentials?: boolean

  /** Auto-retry on HTTP 503. Default: `true` */
  retryOn503?: boolean

  /** Max retry attempts on 503. Default: `2` */
  maxRetries?: number

  /**
   * Prefix prepended to relative URL paths.
   * E.g. `'api/'` turns `'users'` into `'api/users'`.
   * Default: `'api/'`
   */
  apiPrefix?: string

  /** Extra default headers merged into every request. */
  defaultHeaders?: Record<string, string> | (() => Record<string, string>)

  /**
   * Whether we are running on the server (SSR).
   * Affects URL resolution and storage.
   * Default: `false`
   */
  isServer?: boolean | (() => boolean)
}

// ---------------------------------------------------------------------------
// WebSocket client config
// ---------------------------------------------------------------------------

export interface WsClientConfig {
  /** Full WebSocket URL (e.g. `'wss://example.com/app/mykey'`). String or getter. */
  url: string | (() => string)

  /** Application key used in the WebSocket path (e.g. `/app/{appKey}`). */
  appKey?: string

  /** Called on each channel establishment to get the current auth token. */
  getAuthToken?: () => string | null | undefined

  /** Notification callback for connection state changes. */
  notify?: NotifyFn

  /** Translation function for connection state messages. */
  translate?: TranslateFn

  /** Default channel name. Default: `'websocket'` */
  defaultChannel?: string

  /** Heartbeat (ping) interval in ms. Default: `20000` */
  heartbeatInterval?: number

  /** Delay in ms before attempting reconnection. Default: `3000` */
  reconnectDelay?: number

  /** Minimum ms between reconnect attempts. Default: `3000` */
  reconnectThrottle?: number

  /** Auto-reconnect on connection loss. Default: `true` */
  autoReconnect?: boolean

  /**
   * Show connection lost/restored notifications.
   * Set to `false` on native mobile apps where a toast overlay may be unwanted.
   * Default: `true`
   */
  showConnectionNotifications?: boolean

  /**
   * Native platform check (e.g. Capacitor).
   * When true, suppresses connection-state notifications.
   */
  isNativePlatform?: boolean | (() => boolean)

  /** Whether running on the server (SSR). Returns an inert stub when true. */
  isServer?: boolean | (() => boolean)

  /** Fired when connection state changes. */
  onConnectionStateChange?: (state: 'connecting' | 'connected' | 'disconnected' | 'reconnecting') => void
}

// ---------------------------------------------------------------------------
// Reactive ref abstraction (works with Vue, React state, or plain objects)
// ---------------------------------------------------------------------------

/** Minimal reactive value container. Compatible with Vue `ref()` or a plain object. */
export interface ReactiveRef<T> {
  value: T
}

/**
 * Factory function for creating reactive refs.
 * - Vue users pass `ref` from `'vue'`
 * - React users can wrap `useState`
 * - Others use `plainRef` (default)
 */
export type CreateRefFn = <T>(initial: T) => ReactiveRef<T>

/** Non-reactive ref — plain object with a `.value` property. */
export const plainRef = <T>(initial: T): ReactiveRef<T> => ({ value: initial })

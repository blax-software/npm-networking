import type {
  WsClientConfig,
  NotifyFn,
  TranslateFn,
  ReactiveRef,
  CreateRefFn,
} from './types'
import { plainRef } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WsSocket extends WebSocket {
  socket_id?: string
}

export interface WsChannel {
  name: string
  is_established: boolean
  establish(): Promise<WsChannel>
  send(event: string, data?: any): Promise<any>
  unsubscribe(): Promise<boolean>
}

export interface WsClient {
  socket: WsSocket | null
  channels: WsChannel[]

  is_opened: ReactiveRef<boolean>
  is_setup: ReactiveRef<boolean>
  is_connecting_socket: ReactiveRef<boolean>
  is_after_lost_connection: ReactiveRef<boolean>

  heartbeat: ReturnType<typeof setInterval> | null
  last_reconnect_try: number
  send_queue: any[]

  connect(force_reset?: boolean): Promise<WsSocket | void>
  ensureConnected(): Promise<void>
  channel(channel_name?: string | null): Promise<WsChannel | undefined>
  send<T = any>(
    event: string,
    data?: object,
    channel_name?: string | null,
    progress?: (data: any) => void,
  ): Promise<T>
  unsubscribe(channel_name?: string | null): Promise<boolean>

  /**
   * Listen for a WS event. Returns an unsubscribe function.
   * Works with any framework's cleanup (React useEffect, Vue onUnmounted, etc.)
   */
  listen(event: string, channel_name: string | null | undefined, callback: (data: any) => void): () => void

  /** Resolve once when the given event fires. */
  listenOnce(event: string, channel_name?: string | null): Promise<any>

  /** Signal that app initialization is complete. Unblocks gated send() calls. */
  setAppReady(): void

  /** Force channels to re-subscribe with the current auth token on next send(). */
  resetConnection(): void

  /** Update configuration at runtime. */
  configure(partial: Partial<WsClientConfig>): void

  /** Close the connection, clear intervals, and reset all state. */
  destroy(): void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const _isProtocolEvent = (event: string): boolean =>
  /[.:](?:subscribe|unsubscribe|ping|pong)$/.test(event)

// ---------------------------------------------------------------------------
// SSR stub — safe no-op returned when isServer is true
// ---------------------------------------------------------------------------

function createSsrStub(createRef: CreateRefFn): WsClient {
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
    channel: () => Promise.resolve(undefined),
    send: () => Promise.resolve(null as any),
    unsubscribe: () => Promise.resolve(true),
    listen: () => () => {},
    listenOnce: () => Promise.resolve(null),
    setAppReady: () => {},
    resetConnection: () => {},
    configure: () => {},
    destroy: () => {},
  }
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

class WebsocketChannel implements WsChannel {
  name: string
  is_established = false
  _establishPromise: Promise<WsChannel> | null = null
  private _ws: WsClientImpl

  constructor(name: string, ws: WsClientImpl) {
    this.name = name
    this._ws = ws
    ws.channels.push(this)
  }

  async establish(): Promise<WsChannel> {
    if (this.is_established && this._ws.is_setup.value) return this
    this._establishPromise ??= this._doEstablish()
    return this._establishPromise
  }

  private async _doEstablish(): Promise<WsChannel> {
    try {
      await this._ws.ensureConnected()
      const authtoken = this._ws._getAuthToken()
      await this._ws.send(
        'websocket.subscribe',
        { channel: this.name, authtoken: authtoken ?? undefined },
        null,
      )
      this.is_established = true
      this._ws.is_setup.value = true
      return this
    } catch (error) {
      this.is_established = false
      this._establishPromise = null
      throw error
    }
  }

  async send(event: string, data: any = {}): Promise<any> {
    if (!_isProtocolEvent(event) && !this.is_established) await this.establish()
    return this._ws.send(event, data, _isProtocolEvent(event) ? null : this.name)
  }

  async unsubscribe(): Promise<boolean> {
    if (this.is_established) {
      await this._ws
        .send('websocket.unsubscribe', { channel: this.name }, this.name)
        .catch(() => {})
    }
    this._ws.channels = this._ws.channels.filter((c) => c !== this)
    return true
  }
}

// ---------------------------------------------------------------------------
// Main WS client
// ---------------------------------------------------------------------------

class WsClientImpl extends EventTarget implements WsClient {
  private _config: WsClientConfig
  private _notify: NotifyFn | undefined
  private _translate: TranslateFn | undefined

  socket: WsSocket | null = null
  channels: WsChannel[] = []

  is_opened: ReactiveRef<boolean>
  is_setup: ReactiveRef<boolean>
  is_connecting_socket: ReactiveRef<boolean>
  is_after_lost_connection: ReactiveRef<boolean>

  heartbeat: ReturnType<typeof setInterval> | null = null
  last_reconnect_try = 0
  send_queue: any[] = []

  // App-readiness gate
  _appReady = false
  private _appReadyResolve: (() => void) | null = null
  private _appReadyPromise: Promise<void>

  // Connection-ready promise
  private _connectedResolve: (() => void) | null = null
  private _connectedPromise: Promise<void> | null = null

  // Connect promise coalescing
  private _connectPromise: Promise<WsSocket | void> | null = null

  constructor(config: WsClientConfig, createRef: CreateRefFn) {
    super()
    this._config = {
      defaultChannel: 'websocket',
      heartbeatInterval: 20_000,
      reconnectDelay: 3000,
      reconnectThrottle: 3000,
      autoReconnect: true,
      showConnectionNotifications: true,
      ...config,
    }
    this._notify = config.notify
    this._translate = config.translate

    this.is_opened = createRef(false)
    this.is_setup = createRef(false)
    this.is_connecting_socket = createRef(false)
    this.is_after_lost_connection = createRef(false)

    this._appReadyPromise = new Promise<void>((r) => {
      this._appReadyResolve = r
    })
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  configure(partial: Partial<WsClientConfig>): void {
    Object.assign(this._config, partial)
    if (partial.notify !== undefined) this._notify = partial.notify
    if (partial.translate !== undefined) this._translate = partial.translate
  }

  /** @internal — called by channels to obtain the current auth token */
  _getAuthToken(): string | null | undefined {
    return this._config.getAuthToken?.()
  }

  private _isNativePlatform(): boolean {
    const v = this._config.isNativePlatform
    return typeof v === 'function' ? v() : (v ?? false)
  }

  private _getUrl(): string {
    const u = this._config.url
    return typeof u === 'function' ? u() : u
  }

  private _t(key: string, fallback: string): string {
    if (this._translate) {
      const result = this._translate(key)
      if (result) return result
    }
    return fallback
  }

  private _shouldNotify(): boolean {
    return (
      this._config.showConnectionNotifications !== false &&
      !this._isNativePlatform() &&
      !!this._notify
    )
  }

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  ensureConnected(): Promise<void> {
    if (this.socket?.socket_id && this.is_opened.value) return Promise.resolve()
    if (!this._connectedPromise) {
      this._connectedPromise = new Promise<void>((r) => {
        this._connectedResolve = r
      })
      this.connect().catch(() => {})
    }
    return this._connectedPromise
  }

  setAppReady(): void {
    this._appReady = true
    this._appReadyResolve?.()
  }

  resetConnection(): void {
    for (const ch of this.channels) {
      const c = ch as WebsocketChannel
      c.is_established = false
      c._establishPromise = null
    }
    this.is_setup.value = false
  }

  async connect(force_reset = false): Promise<WsSocket | void> {
    if (force_reset && this.socket) {
      try {
        this.socket.close()
      } catch {}
      this.socket = null
      this._connectPromise = null
    }

    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) return this.socket
    if (this._connectPromise) return this._connectPromise

    const throttle = this._config.reconnectThrottle ?? 3000
    if (this.last_reconnect_try && Date.now() - this.last_reconnect_try < throttle) {
      console.log('[ws] Reconnect too fast, skipping')
      return
    }

    this.last_reconnect_try = Date.now()
    this._connectPromise = this._doConnect(force_reset)
    return this._connectPromise
  }

  private _doConnect(force_reset: boolean): Promise<WsSocket | void> {
    const hbInterval = this._config.heartbeatInterval ?? 20_000

    if (force_reset || !this.heartbeat) {
      if (this.heartbeat) clearInterval(this.heartbeat)
      this.heartbeat = setInterval(() => {
        if (this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send('{"event":"websocket.ping","data":{}}')
        }
      }, hbInterval)
    }

    if (force_reset) this.channels = []

    const url = this._getUrl()
    this.socket = new WebSocket(url) as WsSocket
    this.is_connecting_socket.value = true
    this._config.onConnectionStateChange?.('connecting')

    return new Promise<WsSocket | void>((resolve, reject) => {
      const socket = this.socket!

      socket.addEventListener('error', () => {
        this.is_connecting_socket.value = false
        this._connectPromise = null
        reject(new Error('WebSocket error'))
      })

      socket.addEventListener('close', () => {
        this.channels = []
        this.is_connecting_socket.value = false
        this.is_opened.value = false
        this.is_setup.value = false
        this.socket = null
        this._connectPromise = null
        this._connectedPromise = null
        this._connectedResolve = null
        this.is_after_lost_connection.value = true

        if (this._shouldNotify()) {
          const text = this._t('websocket.connectionlost', 'Connection lost. Reconnecting…')
          this._notify!({ id: 'websocket-connection-state', type: 'info', text, timeout: 50_000 })
        }

        this._config.onConnectionStateChange?.('disconnected')

        if (this._appReady && this._config.autoReconnect !== false) {
          const delay = this._config.reconnectDelay ?? 3000
          this._config.onConnectionStateChange?.('reconnecting')
          setTimeout(() => this.connect().catch(() => {}), delay)
        }

        reject(new Error('Socket closed'))
      })

      socket.addEventListener('open', () => {
        if (this.is_after_lost_connection.value && this._shouldNotify()) {
          const text = this._t('websocket.connectionrestored', 'Connection restored')
          this._notify!({ id: 'websocket-connection-state', type: 'success', text, timeout: 1000 })
        }

        this.is_opened.value = true
        this._config.onConnectionStateChange?.('connected')
        // Warmup ping
        socket.send('{"event":"websocket.ping","data":{}}')
      })

      socket.addEventListener('message', (raw) => {
        const msg = JSON.parse(raw.data)

        if (msg?.event === 'websocket.connection_established') {
          const data = JSON.parse(msg.data)
          if (data?.socket_id && this.socket) {
            this.socket.socket_id = data.socket_id
            this.is_connecting_socket.value = false
            resolve(this.socket)
            this._connectedResolve?.()
            // Proactively establish the default channel
            this.channel()
            this._workSendQueue()
          }
          return
        }

        // Parse stringified data payloads
        if (msg?.data && typeof msg.data === 'string') {
          try {
            msg.data = JSON.parse(msg.data)
          } catch {}
        }

        this.dispatchEvent(
          new CustomEvent(msg.event, {
            detail: { event: msg.event, data: msg.data, channel: msg.channel },
          }),
        )
      })
    })
  }

  // -------------------------------------------------------------------------
  // Channel management
  // -------------------------------------------------------------------------

  async channel(channel_name: string | null = null): Promise<WsChannel | undefined> {
    channel_name ??= this._config.defaultChannel ?? 'websocket'
    const existing = this.channels.find((c) => c.name === channel_name)
    return (existing ?? new WebsocketChannel(channel_name, this)).establish()
  }

  private async _workSendQueue(): Promise<void> {
    if (!this.send_queue.length) return
    const queue = this.send_queue
    this.send_queue = []
    for (const payload of queue) {
      await this.channel(payload.channel)
      this.socket?.send(JSON.stringify(payload))
    }
  }

  // -------------------------------------------------------------------------
  // Send / receive
  // -------------------------------------------------------------------------

  async send<T = any>(
    event: string,
    data: object = {},
    channel_name: string | null = null,
    progress?: (data: any) => void,
    _retryOnSubscriptionLost = true,
  ): Promise<T> {
    // Gate non-protocol events until app signals readiness
    if (!this._appReady && !_isProtocolEvent(event)) {
      await this._appReadyPromise
    }

    channel_name ??= this._config.defaultChannel ?? 'websocket'
    if (!this.socket) await this.connect()

    // Build unique event suffix so the server response can be matched to this call
    let sendingevent: string
    if (event === 'websocket.subscribe') {
      sendingevent = 'websocket.subscribe'
      channel_name = null
    } else {
      sendingevent = event + '[' + Math.random().toString(36).substring(7) + ']'
    }

    const payload = { event: sendingevent, data, channel: channel_name }

    // Ensure the target channel is subscribed
    if (channel_name && !_isProtocolEvent(event)) {
      await this.channel(channel_name)
    }

    // Send or queue
    if (this.is_opened.value && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload))
    } else {
      this.send_queue.push(payload)
    }

    await this.connect()
    if (!this.socket) throw new Error('Socket not connected')

    const startTime =
      typeof performance !== 'undefined' ? performance.now() : Date.now()

    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        this.removeEventListener(sendingevent + ':progress', handler)
        this.removeEventListener(sendingevent + ':error', handler)
        this.removeEventListener(sendingevent + ':response', handler)
      }

      const handler = (m: any) => {
        const msg = m.detail
        const duration = Math.round(
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
            startTime,
        )

        // Success
        if (
          (event === 'websocket.subscribe' &&
            msg?.data?.channel === channel_name) ||
          msg?.event?.includes(sendingevent + ':response')
        ) {
          cleanup()
          console.log(`[ws] ${sendingevent} ${duration}ms`)
          resolve(msg.data)
          return
        }

        // Error / timeout
        if (
          msg?.event?.includes(sendingevent + ':error') ||
          msg?.event?.includes(sendingevent + ':timeout')
        ) {
          cleanup()
          console.log(`[ws] ${sendingevent} failed ${duration}ms`)
          reject(msg.data)
          return
        }

        // Progress
        if (progress && msg?.event?.includes(sendingevent + ':progress')) {
          progress(msg.data)
        }
      }

      this.addEventListener(sendingevent + ':progress', handler)
      this.addEventListener(sendingevent + ':error', handler)
      this.addEventListener(sendingevent + ':response', handler)
    }).catch((error: any) => {
      // If the server dropped our subscription, re-establish and retry once
      if (
        _retryOnSubscriptionLost &&
        error?.message === 'Subscription not established'
      ) {
        const ch = this.channels.find(
          (c) => c.name === channel_name,
        ) as WebsocketChannel | undefined
        if (ch) {
          ch.is_established = false
          ch._establishPromise = null
        }
        console.log('[ws] Re-establishing channel after subscription loss')
        return this.send<T>(event, data, channel_name, progress, false)
      }
      throw error
    }) as Promise<T>
  }

  // -------------------------------------------------------------------------
  // Event listeners (framework-agnostic — return cleanup function)
  // -------------------------------------------------------------------------

  listen(
    event: string,
    channel_name: string | null | undefined,
    callback: (data: any) => void,
  ): () => void {
    channel_name ??= this._config.defaultChannel ?? 'websocket'
    const handler = (m: any) => {
      if (m.detail.channel === channel_name) callback(m.detail.data)
    }
    this.addEventListener(event, handler)
    return () => this.removeEventListener(event, handler)
  }

  listenOnce(event: string, channel_name?: string | null): Promise<any> {
    channel_name ??= this._config.defaultChannel ?? 'websocket'
    return new Promise((resolve) => {
      const handler = (m: any) => {
        if (m.detail.channel === channel_name) {
          resolve(m.detail.data)
          this.removeEventListener(event, handler)
        }
      }
      this.addEventListener(event, handler)
    })
  }

  async unsubscribe(channel_name?: string | null): Promise<boolean> {
    channel_name ??= this._config.defaultChannel ?? 'websocket'
    const channel = this.channels.find((c) => c.name === channel_name)
    if (channel) await channel.unsubscribe()
    this.channels = this.channels.filter((c) => c.name !== channel_name)
    return true
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  destroy(): void {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    if (this.socket) {
      try {
        this.socket.close()
      } catch {}
      this.socket = null
    }
    this.channels = []
    this.send_queue = []
    this.is_opened.value = false
    this.is_setup.value = false
    this.is_connecting_socket.value = false
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a WebSocket client.
 *
 * @param config - Connection and behavior configuration.
 * @param createRef - Reactive ref factory. Pass `ref` from Vue for reactive state,
 *                    or omit for plain `{ value }` objects.
 */
export function createWsClient(
  config: WsClientConfig,
  createRef: CreateRefFn = plainRef,
): WsClient {
  const isServer =
    typeof config.isServer === 'function'
      ? config.isServer()
      : (config.isServer ?? false)
  if (isServer) return createSsrStub(createRef)
  return new WsClientImpl(config, createRef)
}

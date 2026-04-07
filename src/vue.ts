import { ref, onUnmounted } from 'vue'
import { createApiClient, type ApiClient } from './api'
import { createWsClient, type WsClient } from './ws'
import type {
  ApiClientConfig,
  WsClientConfig,
  CreateRefFn,
  ReactiveRef,
} from './types'

// ---------------------------------------------------------------------------
// Vue ref adapter
// ---------------------------------------------------------------------------

const vueRef: CreateRefFn = <T>(initial: T): ReactiveRef<T> => ref(initial) as ReactiveRef<T>

// ---------------------------------------------------------------------------
// VueWsClient — WsClient with Vue lifecycle-aware listener methods
// ---------------------------------------------------------------------------

/**
 * Extended WsClient whose listener methods auto-cleanup on Vue `onUnmounted`.
 *
 * - `listenWhileMounted(event, channel, cb)` — subscribe for the component's lifetime
 * - `listenOnceWhileMounted(event, channel)` — resolve once, auto-cleanup on unmount
 *
 * The underlying `listen()` / `listenOnce()` remain available for manual control.
 */
export interface VueWsClient extends WsClient {
  /** Subscribe to `event` on `channel`. Auto-unsubscribes when the calling component unmounts. */
  listenWhileMounted<T = any>(event: string, channel: string | null | undefined, callback: (data: T) => void): () => void
  /** Resolve once when `event` fires. Auto-cleans up if the component unmounts first. */
  listenOnceWhileMounted(event: string, channel?: string | null): Promise<any>
}

/**
 * Create a WsClient with Vue `ref()` for reactive state and
 * `listenWhileMounted` / `listenOnceWhileMounted` convenience methods.
 *
 * ```ts
 * const ws = createVueWsClient({ url: 'wss://…', … })
 *
 * // In any component's setup():
 * ws.listenWhileMounted('chat.message', null, (msg) => { … })
 * ```
 */
export function createVueWsClient(config: WsClientConfig): VueWsClient {
  const ws = createWsClient(config, vueRef)

  return Object.assign(ws, {
    listenWhileMounted<T = any>(
      event: string,
      channel: string | null | undefined,
      callback: (data: T) => void,
    ): () => void {
      const off = ws.listen(event, channel, callback)
      onUnmounted(off)
      return off
    },

    listenOnceWhileMounted(
      event: string,
      channel?: string | null,
    ): Promise<any> {
      let off: (() => void) | null = null
      const promise = new Promise<any>((resolve) => {
        off = ws.listen(event, channel, (data) => {
          off?.()
          off = null
          resolve(data)
        })
      })
      onUnmounted(() => { off?.() })
      return promise
    },
  }) as VueWsClient
}

// ---------------------------------------------------------------------------
// Composables
// ---------------------------------------------------------------------------

/**
 * Create (or return) an ApiClient.
 * Convenience wrapper — you can also call `createApiClient()` directly.
 */
export function useApiClient(config: ApiClientConfig): ApiClient {
  return createApiClient(config)
}

/**
 * Create a WsClient with Vue `ref()` for reactive state.
 * `ws.is_setup`, `ws.is_opened`, etc. are Vue refs.
 *
 * @deprecated Prefer `createVueWsClient()` which also provides `listenWhileMounted`.
 */
export function useWsClient(config: WsClientConfig): WsClient {
  return createWsClient(config, vueRef)
}

/**
 * Listen for a WS event with automatic cleanup on component unmount.
 * Standalone composable — use this if you prefer functions over instance methods.
 *
 * ```ts
 * useWsListener(ws, 'chat.message', null, (data) => { ... })
 * ```
 */
export function useWsListener(
  ws: WsClient,
  event: string,
  channel: string | null | undefined,
  callback: (data: any) => void,
): () => void {
  const off = ws.listen(event, channel, callback)
  onUnmounted(off)
  return off
}

/**
 * Resolve once when a WS event fires. Cleans up automatically if the component unmounts first.
 * Standalone composable — use this if you prefer functions over instance methods.
 */
export function useWsListenOnce(
  ws: WsClient,
  event: string,
  channel?: string | null,
): Promise<any> {
  let off: (() => void) | null = null

  const promise = new Promise<any>((resolve) => {
    off = ws.listen(event, channel, (data) => {
      off?.()
      off = null
      resolve(data)
    })
  })

  onUnmounted(() => {
    off?.()
  })

  return promise
}

// Re-export everything from core for convenience
export { createApiClient } from './api'
export { createWsClient } from './ws'
export { vueRef }
export type { ApiClient } from './api'
export type { WsClient, WsChannel } from './ws'

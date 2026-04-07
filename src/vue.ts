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
 */
export function useWsClient(config: WsClientConfig): WsClient {
  return createWsClient(config, vueRef)
}

/**
 * Listen for a WS event with automatic cleanup on component unmount.
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

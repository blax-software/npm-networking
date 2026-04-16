import { WsClient, ApiClient } from './index.js';
export { WsChannel, createApiClient, createWsClient } from './index.js';
import { W as WsClientConfig, A as ApiClientConfig, C as CreateRefFn } from './types-C4-WlXk8.js';

declare const vueRef: CreateRefFn;
/**
 * Extended WsClient whose listener methods auto-cleanup on Vue `onUnmounted`.
 *
 * - `listenWhileMounted(event, channel, cb)` — subscribe for the component's lifetime
 * - `listenOnceWhileMounted(event, channel)` — resolve once, auto-cleanup on unmount
 *
 * The underlying `listen()` / `listenOnce()` remain available for manual control.
 */
interface VueWsClient extends WsClient {
    /** Subscribe to `event` on `channel`. Auto-unsubscribes when the calling component unmounts. */
    listenWhileMounted<T = any>(event: string, channel: string | null | undefined, callback: (data: T) => void): () => void;
    /** Resolve once when `event` fires. Auto-cleans up if the component unmounts first. */
    listenOnceWhileMounted(event: string, channel?: string | null): Promise<any>;
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
declare function createVueWsClient(config: WsClientConfig): VueWsClient;
/**
 * Create (or return) an ApiClient.
 * Convenience wrapper — you can also call `createApiClient()` directly.
 */
declare function useApiClient(config: ApiClientConfig): ApiClient;
/**
 * Create a WsClient with Vue `ref()` for reactive state.
 * `ws.is_setup`, `ws.is_opened`, etc. are Vue refs.
 *
 * @deprecated Prefer `createVueWsClient()` which also provides `listenWhileMounted`.
 */
declare function useWsClient(config: WsClientConfig): WsClient;
/**
 * Listen for a WS event with automatic cleanup on component unmount.
 * Standalone composable — use this if you prefer functions over instance methods.
 *
 * ```ts
 * useWsListener(ws, 'chat.message', null, (data) => { ... })
 * ```
 */
declare function useWsListener(ws: WsClient, event: string, channel: string | null | undefined, callback: (data: any) => void): () => void;
/**
 * Resolve once when a WS event fires. Cleans up automatically if the component unmounts first.
 * Standalone composable — use this if you prefer functions over instance methods.
 */
declare function useWsListenOnce(ws: WsClient, event: string, channel?: string | null): Promise<any>;

export { ApiClient, type VueWsClient, WsClient, createVueWsClient, useApiClient, useWsClient, useWsListenOnce, useWsListener, vueRef };

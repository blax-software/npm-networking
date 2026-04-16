import { ApiClient, WsClient } from './index.cjs';
export { WsChannel, createApiClient, createWsClient } from './index.cjs';
import { A as ApiClientConfig, W as WsClientConfig } from './types-C4-WlXk8.cjs';

/**
 * Options for `createFromNuxtConfig()`.
 *
 * Override the runtimeConfig key names if your project uses different names.
 * All keys read from `useRuntimeConfig().public`.
 */
interface NuxtNetworkingOptions {
    /** runtimeConfig key for REST API base URL (default: `'SERVER_URL'`) */
    serverUrlKey?: string;
    /** runtimeConfig key for internal SSR URL (default: `'SERVER_URL_INTERNAL'`) */
    serverUrlInternalKey?: string;
    /** runtimeConfig key for WebSocket URL (default: `'WEBS_URL'`) */
    wsUrlKey?: string;
    /** runtimeConfig key for WS protocol — `'wss'` or `'ws'` (default: `'WS_PROTOCOL'`) */
    wsProtocolKey?: string;
    /** runtimeConfig key for the WebSocket app key (default: `'PUSHER_APP_KEY'`) */
    appKeyConfigKey?: string;
    /**
     * Pass in `useRuntimeConfig()` from the calling plugin/composable.
     * If omitted the function falls back to the Nuxt auto-import (works only
     * when Nuxt treats this file as part of the app's auto-import context).
     */
    runtimeConfig?: Record<string, any>;
    /** Additional ApiClientConfig overrides */
    apiConfig?: Partial<ApiClientConfig>;
    /** Additional WsClientConfig overrides */
    wsConfig?: Partial<WsClientConfig>;
}
/**
 * Create api + ws clients pre-wired for a Nuxt 3 app.
 *
 * Reads URLs from `useRuntimeConfig().public`, detects SSR via `import.meta.server`,
 * and uses Vue `ref()` for WS reactive state.
 *
 * ```ts
 * // plugins/networking.client.ts
 * import { createFromNuxtConfig } from '@blax-software/networking/nuxt'
 *
 * export default defineNuxtPlugin(() => {
 *   const { api, ws } = createFromNuxtConfig()
 *   return { provide: { api, ws } }
 * })
 * ```
 */
declare function createFromNuxtConfig(options?: NuxtNetworkingOptions): {
    api: ApiClient;
    ws: WsClient;
};

export { ApiClient, type NuxtNetworkingOptions, WsClient, createFromNuxtConfig };

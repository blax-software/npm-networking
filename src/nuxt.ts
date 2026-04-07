import { ref } from 'vue'
import { createApiClient, type ApiClient } from './api'
import { createWsClient, type WsClient } from './ws'
import type { ApiClientConfig, WsClientConfig, ReactiveRef } from './types'

/**
 * Options for `createFromNuxtConfig()`.
 *
 * Override the runtimeConfig key names if your project uses different names.
 * All keys read from `useRuntimeConfig().public`.
 */
export interface NuxtNetworkingOptions {
  /** runtimeConfig key for REST API base URL (default: `'SERVER_URL'`) */
  serverUrlKey?: string
  /** runtimeConfig key for internal SSR URL (default: `'SERVER_URL_INTERNAL'`) */
  serverUrlInternalKey?: string
  /** runtimeConfig key for WebSocket URL (default: `'WEBS_URL'`) */
  wsUrlKey?: string
  /** runtimeConfig key for WS protocol — `'wss'` or `'ws'` (default: `'WS_PROTOCOL'`) */
  wsProtocolKey?: string

  /** Additional ApiClientConfig overrides */
  apiConfig?: Partial<ApiClientConfig>
  /** Additional WsClientConfig overrides */
  wsConfig?: Partial<WsClientConfig>
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
export function createFromNuxtConfig(options: NuxtNetworkingOptions = {}): {
  api: ApiClient
  ws: WsClient
} {
  // Nuxt auto-imports — these are available at plugin/composable scope
  // @ts-expect-error Nuxt auto-import
  const config = useRuntimeConfig()

  const serverUrlKey = options.serverUrlKey ?? 'SERVER_URL'
  const serverUrlInternalKey = options.serverUrlInternalKey ?? 'SERVER_URL_INTERNAL'
  const wsUrlKey = options.wsUrlKey ?? 'WEBS_URL'
  const wsProtocolKey = options.wsProtocolKey ?? 'WS_PROTOCOL'

  const pub = config.public ?? config
  const serverUrl: string = pub[serverUrlKey] ?? ''
  const serverUrlInternal: string = pub[serverUrlInternalKey] ?? ''
  const wsUrl: string = pub[wsUrlKey] ?? ''
  const wsProtocol: string = pub[wsProtocolKey] ?? 'wss'

  // @ts-expect-error Nuxt/Vite global
  const isServer: boolean = import.meta.server ?? false

  // --- API Client ---
  const api = createApiClient({
    serverUrl,
    ssrServerUrl: serverUrlInternal || undefined,
    isServer: () => isServer,
    defaultHeaders: () => {
      if (!isServer) return {}
      try {
        // @ts-expect-error Nuxt auto-import
        return useRequestHeaders(['cookie', 'x-forwarded-for', 'x-real-ip']) ?? {}
      } catch {
        return {}
      }
    },
    ...options.apiConfig,
  })

  // --- WS Client ---
  // Nuxt always has Vue — use ref directly for reactive state
  const vueRef = <T>(initial: T): ReactiveRef<T> => ref(initial) as ReactiveRef<T>

  const ws = createWsClient(
    {
      url: `${wsProtocol === 'wss' ? 'wss' : 'ws'}://${wsUrl}/app/ws`,
      isServer: () => isServer,
      ...options.wsConfig,
    },
    vueRef,
  )

  return { api, ws }
}

// Re-export for convenience
export { createApiClient } from './api'
export { createWsClient } from './ws'
export type { ApiClient } from './api'
export type { WsClient, WsChannel } from './ws'

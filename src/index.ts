// Core (framework-agnostic)
export { createApiClient, fetchAdapter } from './api'
export type { ApiClient } from './api'
export { createWsClient } from './ws'
export type { WsClient, WsChannel } from './ws'

// Types & adapters
export type {
  NotifyFn,
  NotifyOptions,
  TranslateFn,
  StorageAdapter,
  HttpAdapter,
  HttpResponse,
  HttpRequestConfig,
  ApiClientConfig,
  WsClientConfig,
  ReactiveRef,
  CreateRefFn,
} from './types'
export { browserStorage, memoryStorage, plainRef } from './types'

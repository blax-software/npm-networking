# @blax-software/networking

Framework-agnostic API and WebSocket client library with optional Vue, Nuxt, and axios adapters.

## Features

- **Zero required dependencies** — core uses native `fetch` and `WebSocket`
- **Tree-shakeable** — import only what you need
- **SSR-safe** — server detection with automatic no-op stubs
- **Framework adapters** — Vue `ref()` reactivity, Nuxt auto-config, axios compatibility
- **TypeScript-first** — Full type coverage with `.d.ts` exports

## Install

```bash
npm install @blax-software/networking

# Optional peer dependencies:
npm install vue          # for /vue and /nuxt entry points
npm install axios        # for /axios adapter
```

## Quick Start

### Vanilla / React / Any framework

```typescript
import { createApiClient, createWsClient } from '@blax-software/networking'

const api = createApiClient({
  serverUrl: 'https://api.example.com',
})

const ws = createWsClient({
  url: 'wss://api.example.com/app/ws',
  getAuthToken: () => api.getBearer(),
})

// REST
const users = await api.get('users')

// WebSocket
await ws.connect()
ws.setAppReady()
const result = await ws.send('user.profile', { id: 123 })

// Listen for events — returns an unsubscribe function
const off = ws.listen('chat.message', null, (data) => {
  console.log('New message:', data)
})
// Call off() to stop listening (works with React useEffect cleanup, etc.)
```

### Vue 3

```typescript
import { useApiClient, useWsClient, useWsListener } from '@blax-software/networking/vue'

const api = useApiClient({
  serverUrl: 'https://api.example.com',
})

const ws = useWsClient({
  url: 'wss://api.example.com/app/ws',
  getAuthToken: () => api.getBearer(),
})

// ws.is_setup, ws.is_opened etc. are Vue refs
watch(ws.is_setup, (ready) => {
  if (ready) console.log('WebSocket ready')
})

// Auto-cleanup on component unmount
useWsListener(ws, 'notifications.new', null, (data) => {
  console.log('Notification:', data)
})
```

### Nuxt 3

```typescript
// plugins/networking.client.ts
import { createFromNuxtConfig } from '@blax-software/networking/nuxt'

export default defineNuxtPlugin(() => {
  const { api, ws } = createFromNuxtConfig()

  // Optional: store bearer, connect WS, etc.
  api.setBearer(localStorage.getItem('bearerToken') ?? '')
  ws.connect()
  ws.setAppReady()

  return { provide: { api, ws } }
})
```

Reads these keys from `useRuntimeConfig().public`:

| Key                   | Description                   |
|-----------------------|-------------------------------|
| `SERVER_URL`          | REST API base URL             |
| `SERVER_URL_INTERNAL` | Internal URL for SSR requests |
| `WEBS_URL`            | WebSocket hostname            |
| `WS_PROTOCOL`         | `'wss'` or `'ws'`             |

### With axios

```typescript
import { createApiClient } from '@blax-software/networking'
import { createAxiosAdapter } from '@blax-software/networking/axios'
import axios from 'axios'

const axiosInstance = axios.create({
  baseURL: 'https://api.example.com',
  withCredentials: true,
})

const api = createApiClient({
  serverUrl: 'https://api.example.com',
  http: createAxiosAdapter(axiosInstance),
})
```

## API Reference

### `createApiClient(config: ApiClientConfig): ApiClient`

| Config            | Type                       | Default          | Description                            |
|-------------------|----------------------------|------------------|----------------------------------------|
| `serverUrl`       | `string \| () => string`   | **required**     | Base URL for HTTP requests             |
| `ssrServerUrl`    | `string \| () => string`   | —                | Alternate URL for server-side requests |
| `http`            | `HttpAdapter`              | `fetchAdapter`   | HTTP adapter (fetch, axios, custom)    |
| `notify`          | `NotifyFn`                 | —                | Notification callback for errors       |
| `storage`         | `StorageAdapter`           | `browserStorage` | Token persistence adapter              |
| `storageKey`      | `string`                   | `'bearerToken'`  | Storage key for the bearer token       |
| `timeout`         | `number`                   | `10000`          | Request timeout in ms                  |
| `withCredentials` | `boolean`                  | `true`           | Include cookies in requests            |
| `retryOn503`      | `boolean`                  | `true`           | Auto-retry on HTTP 503                 |
| `apiPrefix`       | `string`                   | `'api/'`         | Prefix prepended to relative paths     |
| `isServer`        | `boolean \| () => boolean` | `false`          | Whether running on the server (SSR)    |

**ApiClient methods:**

| Method                        | Returns                 | Description                            |
|-------------------------------|-------------------------|----------------------------------------|
| `get(path, params?)`          | `Promise<HttpResponse>` | GET request                            |
| `post(path, data?, params?)`  | `Promise<HttpResponse>` | POST request                           |
| `put(path, data?, params?)`   | `Promise<HttpResponse>` | PUT request                            |
| `delete(path, params?)`       | `Promise<HttpResponse>` | DELETE request                         |
| `patch(path, data?, params?)` | `Promise<HttpResponse>` | PATCH request                          |
| `csrf(path?)`                 | `Promise<void>`         | Fetch CSRF cookie                      |
| `setBearer(token)`            | `void`                  | Set auth token                         |
| `getBearer()`                 | `string \| null`        | Get current auth token                 |
| `clearBearer()`               | `void`                  | Remove auth token                      |
| `getServerUrl()`              | `string`                | Resolve current server URL             |
| `parseError(error)`           | `never`                 | Extract error, notify, and re-throw    |
| `parseThen(response, msg?)`   | `any`                   | Show success notification, return data |
| `configure(partial)`          | `void`                  | Update config at runtime               |

### `createWsClient(config: WsClientConfig, createRef?): WsClient`

| Config              | Type                       | Default       | Description                                |
|---------------------|----------------------------|---------------|--------------------------------------------|
| `url`               | `string \| () => string`   | **required**  | Full WebSocket URL                         |
| `getAuthToken`      | `() => string \| null`     | —             | Auth token getter for channel subscription |
| `notify`            | `NotifyFn`                 | —             | Connection state notifications             |
| `translate`         | `TranslateFn`              | —             | Translation function for notification text |
| `defaultChannel`    | `string`                   | `'websocket'` | Default channel name                       |
| `heartbeatInterval` | `number`                   | `20000`       | Ping interval (ms)                         |
| `reconnectDelay`    | `number`                   | `3000`        | Delay before reconnect attempt (ms)        |
| `autoReconnect`     | `boolean`                  | `true`        | Auto-reconnect on disconnect               |
| `isServer`          | `boolean \| () => boolean` | `false`       | Returns safe no-op stub when true          |
| `isNativePlatform`  | `boolean \| () => boolean` | `false`       | Suppresses browser-only notifications      |

**WsClient methods:**

| Method                                    | Returns                      | Description                              |
|-------------------------------------------|------------------------------|------------------------------------------|
| `connect(force?)`                         | `Promise<WebSocket \| void>` | Open socket connection                   |
| `send(event, data?, channel?, progress?)` | `Promise<T>`                 | Send event, await response               |
| `listen(event, channel, callback)`        | `() => void`                 | Listen for event, returns unsubscribe fn |
| `listenOnce(event, channel?)`             | `Promise<any>`               | Resolve on next occurrence               |
| `setAppReady()`                           | `void`                       | Unblock gated `send()` calls             |
| `resetConnection()`                       | `void`                       | Force channels to re-subscribe           |
| `destroy()`                               | `void`                       | Close and clean up everything            |

**Reactive state (Vue refs when using vue/nuxt adapters, plain objects otherwise):**

| Property                   | Type                   | Description                 |
|----------------------------|------------------------|-----------------------------|
| `is_opened`                | `ReactiveRef<boolean>` | Socket is open              |
| `is_setup`                 | `ReactiveRef<boolean>` | Default channel established |
| `is_connecting_socket`     | `ReactiveRef<boolean>` | Connection in progress      |
| `is_after_lost_connection` | `ReactiveRef<boolean>` | Had a connection loss       |

## Storage Adapters

```typescript
import { browserStorage, memoryStorage } from '@blax-software/networking'

// Default — uses localStorage (safe for SSR, returns null on errors)
const api1 = createApiClient({ serverUrl: '...', storage: browserStorage })

// In-memory — for SSR, tests, or environments without localStorage
const api2 = createApiClient({ serverUrl: '...', storage: memoryStorage() })
```

## License

MIT

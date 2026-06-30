# AGENTS.md — @blax-software/networking

> Audience: AI coding agents (Claude Code, Copilot, Cursor) and human contributors.
> This is the **canonical, source-verified reference** for *how to use this library's
> WebSocket + API clients*. The README is an overview; **this file is the contract**.
> When they disagree, this file wins (and fix the README).
>
> Claims are grounded in `src/` with file\:line citations. Read the source before you
> trust — don't answer from training-data memory.

---

## 0. Mental model

This package has **no default export and no built-in singleton.** You call a **factory**
that returns a client. Pick the factory for your environment:

| Import | Factory | Use for |
|--------|---------|---------|
| `@blax-software/networking` | `createWsClient(config)` / `createApiClient(config)` | Vanilla / React / any framework (plain `{value}` refs) |
| `@blax-software/networking/vue` | `createVueWsClient(config)` | Vue 3 — **reactive** refs + `listenWhileMounted` helpers |
| `@blax-software/networking/nuxt` | `createFromNuxtConfig()` | Nuxt 3 — reads `runtimeConfig.public`, calls `setAppReady()` for you |

The app creates **one** client and exports it as *its* singleton. In the LATC frontend that is
`export const ws` in `composables/Websocket.client.ts` (built with `createVueWsClient`, Nuxt
auto-imports it — call `ws.send(...)` with no import line). **Never call a factory a second time** —
one socket per app.

The WS client **is a DOM `EventTarget`**: every inbound message is re-dispatched as a
`CustomEvent` whose `type` is the raw `msg.event` and whose `detail` is `{ event, data, channel }`.
Everything below is sugar over `addEventListener`/`removeEventListener` on that target.

---

## 1. `ws.send()` — request/response (and streaming)

```ts
send<T = any>(
  event: string,
  data?: object,                       // default {}
  channel_name?: string | null,        // default null → 'websocket'
  progress?: (data: any) => void,      // called for each ':progress' frame
): Promise<T>                          // resolves with the ':response' data
```
(`src/ws.ts:455`)

```ts
// simple call — resolves with the UNWRAPPED payload (NOT axios-shaped { data })
const key = await ws.send('app.stripekey')
const pms = await ws.send<PaymentMethod[]>('billing.paymentmethods')

// idiomatic: terse wrapper + shared error toast
export const methodSync = () => ws.send('billing.syncSubscriptions').catch(api.parseError)
```

How it works: `send()` rewrites the outgoing event to `<event>[<rand>]`, then `addEventListener`s
`<that>:response | :error | :progress` **on itself**, resolving on `:response`, rejecting on
`:error`/`:timeout`, and calling your `progress` callback on `:progress`. On settle it removes all
three listeners (`src/ws.ts:500-504` — this is the `this.removeEventListener(sendingevent + ':progress', handler)`
cleanup). **This is internal** — you never wire those listeners yourself.

### Streaming — just pass the 4th `progress` arg

This is the **only** streaming API. Listener cleanup is automatic. Do **not** hand-roll
`addEventListener('…:progress')`.

```ts
// pair with backend $this->progress(...)
const requestId = ++dataGenerateRequestId          // guard against overlapping streams
ws.send('listening.generate', {}, null, (p) => {
  if (requestId !== dataGenerateRequestId) return   // stale — a newer call superseded us
  if (p?.status === 'generating') status.value = t('...')
}).then((final) => {
  if (requestId !== dataGenerateRequestId) return
  current.value = final
}).catch((e) => { /* e is msg.data, e.g. { message }, NOT an Error */ })
```

⚠️ **Footguns:**
- **No client-side timeout.** If the backend never emits `<event>:response`/`:error`/`:timeout`,
  the Promise **hangs forever**. Make sure the handler always replies (return a value, or
  `$this->success/error`, or throw).
- **The reject value is `msg.data`**, not an `Error`. Read `e?.message || e?.error`.
- **`setAppReady()` gate** — see §3. Forget it and *every* non-protocol `send()` hangs.
- `data` must be an object. Arrays in params get comma-joined by `serializeParams`; encode
  list payloads explicitly if the backend validates strictly.

---

## 2. Listening to server-pushed events (broadcasts)

For events the **server** pushes on a bare name (no `[rand]` suffix) — `ws_broadcast()` /
`$this->broadcast()` on the backend.

| API | Returns | Cleanup |
|-----|---------|---------|
| `ws.listen(event, channel, cb)` | `() => void` (off) | you call `off()` |
| `ws.listenOnce(event, channel?)` | `Promise` (resolves once) | self-removes |
| `ws.listenWhileMounted(event, channel, cb)` *(Vue)* | `() => void` | **auto** on `onUnmounted` |
| `ws.listenOnceWhileMounted(event, channel?)` *(Vue)* | `Promise` | auto-cleanup on unmount |
| `useWsListener(ws, event, channel, cb)` *(Vue, standalone)* | `() => void` | auto on `onUnmounted` |

**Preferred in components:** `listenWhileMounted` (channel filtering + teardown for you).

```ts
// inside setup() — auto-unsubscribes on unmount
ws.listenWhileMounted<{ message: string }>('info:new_message', channelName, (data) => {
  pushMessage(data)
})

// global broadcast on the default channel
ws.listenWhileMounted('info:notification', null, (data) => { if (data?.type === '…') reload() })
```

⚠️ **Channel filter is strict equality.** `channel=null|undefined` resolves to the default
`'websocket'` channel; a server event published on a *named* channel won't fire a listener
registered with `null`. Pass the exact channel the server broadcasts on.

⚠️ `listenWhileMounted`/`useWsListener` call Vue `onUnmounted` — they **must** run synchronously
inside a component `setup()` or the cleanup never binds.

### Raw `addEventListener` (lower-level / multi-handler)

Only when you register several related handlers and want one explicit `onUnmounted` block, or you
need the channel string for manual filtering. The handler gets the **CustomEvent** — read
`m.detail.data` (and `m.detail.channel`), not `m.data`. You must keep the handler reference and
`removeEventListener` it yourself or you leak.

```ts
const handler = (m: any) => { if (m.detail.channel !== wanted) return; use(m.detail.data) }
ws.addEventListener('presence.changed', handler)
onUnmounted(() => ws.removeEventListener('presence.changed', handler))
```

> You cannot `listen()` for a specific `send()`'s response — the `[rand]` suffix is unknown to you.
> Use the Promise that `send()` returns.

---

## 3. Lifecycle — `connect()`, `setAppReady()`, reconnect

```ts
await ws.connect()      // open socket (coalesced + throttled). Usually you DON'T call this — send() auto-connects.
ws.setAppReady()        // MANDATORY: unblocks all gated non-protocol send() calls
ws.resetConnection()    // after login/logout/token change → next send() re-subscribes channels
ws.destroy()            // full teardown
```

> **`setAppReady()` is load-bearing.** Until it's called, every non-protocol `send()` awaits an
> internal `_appReadyPromise` **forever**, and auto-reconnect-on-close won't fire.
> `createFromNuxtConfig()` calls it for you. A hand-rolled `createVueWsClient` singleton **must**
> call it once at startup, **after** the bearer/auth is set but **before** any feature `send()`.
> (LATC does this in `app.vue` after `Promise.race([... ws.connect()], 4s cap)`.)

Feature code should **not** call `connect()`/`setAppReady()` — that's the app bootstrap's job, exactly once.

Reconnect/heartbeat are built in (don't reinvent): `connect()` throttles via `reconnectThrottle`
(3000ms — bypass for an immediate reconnect by setting `ws.last_reconnect_try = 0`), heartbeat ping
every `heartbeatInterval` (20000ms), auto-reconnect after `reconnectDelay` on close when app-ready.

---

## 4. Reactive state & SSR

```ts
ws.is_setup      // default channel established — safe to send app events
ws.is_opened     // socket currently OPEN
ws.is_connecting_socket
ws.is_after_lost_connection
```

Read `.value` (`ws.is_setup.value`). **Reactive only** with the `/vue` or `/nuxt` factory; the bare
core gives plain `{ value }` objects (`watch()` won't fire).

**SSR pattern** (the client is a `.client` module; `ws.send` won't resolve on the server):

```ts
if (!import.meta.server && ws.is_setup.value) {
  return ws.send('aerodrome.index', { locale, page })   // realtime on the client
} else {
  return api.get('aerodromes', { page }).then(r => r?.data?.data ?? r?.data ?? null)  // REST on the server
}
```

---

## 5. REST companion — `ApiClient`

The SSR/fallback path. Verbs return `Promise<HttpResponse<T>>` (`{ data, status, headers }`),
auto-attach `Authorization: Bearer`, prepend `apiPrefix` (`'api/'`) unless the path starts with `/`.

```ts
const api = createApiClient({ serverUrl: 'https://api.example.com' })
const users = await api.get('users')                    // GET /api/users
api.get('aerodromes', { page }).catch(api.parseError)   // parseError/parseThen are pre-bound
```

**Real public methods** (`src/api.ts`): `get(url, params?)`, `post(url, data?, headers?)`,
`put(url, data?)`, `delete(url, headers?)`, `patch(url, data?)`, `csrf(path?)`, `setBearer(token|null)`,
`get bearerToken` (getter), `loadBearerFromStorage()`, `getBackendUrl()`, `clientAsset(path)`,
`cleanseUrl(url)`, `configure(partial)`, `parseError`, `parseThen`.

> ⚠️ There is **no** `getBearer()`, `getServerUrl()`, or `clearBearer()` (older README listed these).
> Read the token via the `bearerToken` getter; resolve the base URL via `getBackendUrl()`; clear with
> `setBearer(null)`.

```ts
const ws = createWsClient({ url, getAuthToken: () => api.bearerToken })   // ✅ getter, not getBearer()
```

---

## 6. Footgun checklist (skim before wiring WS in the UI)

- [ ] Use the app's exported `ws` singleton — never call a factory twice.
- [ ] `setAppReady()` must run once at startup or every `send()` hangs.
- [ ] `send()` has **no timeout** — a non-replying backend hangs the Promise.
- [ ] `send()` resolves the **unwrapped** payload (not `{ data }`); rejects with `msg.data` (not an Error).
- [ ] Streaming = the 4th `progress` arg of `send()`. Don't hand-wire `:progress` listeners.
- [ ] In components prefer `listenWhileMounted` (auto-teardown + channel filter).
- [ ] `listen()` channel filter is strict; `null` → `'websocket'`. Match the server's channel.
- [ ] Reactive refs need the `/vue` or `/nuxt` factory; always read `.value`.
- [ ] SSR: guard with `!import.meta.server && ws.is_setup.value`, fall back to `api.get`.
- [ ] `ApiClient`: `bearerToken` getter / `getBackendUrl()` / `setBearer(null)` — not the README's old names.

---

## 7. Source map

| Concern | File |
|---------|------|
| `send` (+ progress), `listen`, `listenOnce`, EventTarget dispatch, cleanup, connect/reconnect | `src/ws.ts` |
| `createVueWsClient`, `listenWhileMounted`, `useWsListener`, reactive refs | `src/vue.ts` |
| `createFromNuxtConfig` | `src/nuxt.ts` |
| `ApiClient` verbs, bearer, `parseError/parseThen` | `src/api.ts` |
| `WsClientConfig`, `ApiClientConfig` | `src/types.ts` |

**Backend counterpart:** the server side of this protocol (who emits `:progress`/`:response`/`:error`,
`$this->progress`, `ws_broadcast`, channels) is documented in the `laravel-websockets` `AGENTS.md`.

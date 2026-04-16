# blax-npm-networking

## Overview
Plug-and-play API + WebSocket client for Vue/Nuxt apps. Framework-agnostic core with optional bindings.

## Build
- `pnpm build` — builds via tsup to `dist/`
- `dist/` is committed to the repo (required for GitHub-based `pnpm` installs)
- Always rebuild before committing changes: `pnpm build && git add dist/`
- Exports: `.` (core), `./vue`, `./nuxt`, `./axios`

## WebSocket
- `createWsClient()` takes a URL and connects via native WebSocket
- `createFromNuxtConfig()` reads `runtimeConfig.public` keys: `WEBS_URL`, `WS_PROTOCOL`, `PUSHER_APP_KEY`
- App key default: `websocket` — generic identifier, same in all environments
- URL format: `{protocol}://{host}/app/{appKey}`
- Has built-in connection diagnostics: URL validation, 5s timeout for `connection_established`

## Conventions
- TypeScript strict mode
- No environment-specific defaults — all config values should work across dev and prod

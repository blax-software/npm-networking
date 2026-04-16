'use strict';

var chunkNJGSOYSN_cjs = require('./chunk-NJGSOYSN.cjs');
var vue = require('vue');

function createFromNuxtConfig(options = {}) {
  const config = options.runtimeConfig ?? (typeof useRuntimeConfig === "function" ? useRuntimeConfig() : {});
  const serverUrlKey = options.serverUrlKey ?? "SERVER_URL";
  const serverUrlInternalKey = options.serverUrlInternalKey ?? "SERVER_URL_INTERNAL";
  const wsUrlKey = options.wsUrlKey ?? "WEBS_URL";
  const wsProtocolKey = options.wsProtocolKey ?? "WS_PROTOCOL";
  const appKeyConfigKey = options.appKeyConfigKey ?? "PUSHER_APP_KEY";
  const pub = config.public ?? config;
  const serverUrl = pub[serverUrlKey] ?? "";
  const serverUrlInternal = pub[serverUrlInternalKey] ?? "";
  const wsUrl = pub[wsUrlKey] ?? "";
  const wsProtocol = pub[wsProtocolKey] ?? "wss";
  const appKey = pub[appKeyConfigKey] ?? "websocket";
  const isServer = undefined ?? false;
  const api = chunkNJGSOYSN_cjs.createApiClient({
    serverUrl,
    ssrServerUrl: serverUrlInternal || void 0,
    isServer: () => isServer,
    defaultHeaders: () => {
      if (!isServer) return {};
      try {
        return useRequestHeaders(["cookie", "x-forwarded-for", "x-real-ip"]) ?? {};
      } catch {
        return {};
      }
    },
    ...options.apiConfig
  });
  const vueRef = (initial) => vue.ref(initial);
  if (!wsUrl) {
    console.error(
      `[blax-networking] Missing WebSocket URL. Set runtimeConfig.public.${wsUrlKey} or the NUXT_PUBLIC_${wsUrlKey} environment variable.`
    );
  }
  if (!appKey) {
    console.error(
      `[blax-networking] Missing WebSocket app key. Set runtimeConfig.public.${appKeyConfigKey} or the NUXT_PUBLIC_${appKeyConfigKey} environment variable. This must match PUSHER_APP_KEY on the backend.`
    );
  }
  const ws = chunkNJGSOYSN_cjs.createWsClient(
    {
      url: `${wsProtocol === "wss" ? "wss" : "ws"}://${wsUrl}/app/${appKey}`,
      appKey,
      isServer: () => isServer,
      ...options.wsConfig
    },
    vueRef
  );
  return { api, ws };
}

Object.defineProperty(exports, "createApiClient", {
  enumerable: true,
  get: function () { return chunkNJGSOYSN_cjs.createApiClient; }
});
Object.defineProperty(exports, "createWsClient", {
  enumerable: true,
  get: function () { return chunkNJGSOYSN_cjs.createWsClient; }
});
exports.createFromNuxtConfig = createFromNuxtConfig;

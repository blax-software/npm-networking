import { createWsClient, createApiClient } from './chunk-TGWHEE6S.js';
export { createApiClient, createWsClient } from './chunk-TGWHEE6S.js';
import { ref, onUnmounted } from 'vue';

var vueRef = (initial) => ref(initial);
function createVueWsClient(config) {
  const ws = createWsClient(config, vueRef);
  return Object.assign(ws, {
    listenWhileMounted(event, channel, callback) {
      const off = ws.listen(event, channel, callback);
      onUnmounted(off);
      return off;
    },
    listenOnceWhileMounted(event, channel) {
      let off = null;
      const promise = new Promise((resolve) => {
        off = ws.listen(event, channel, (data) => {
          off?.();
          off = null;
          resolve(data);
        });
      });
      onUnmounted(() => {
        off?.();
      });
      return promise;
    }
  });
}
function useApiClient(config) {
  return createApiClient(config);
}
function useWsClient(config) {
  return createWsClient(config, vueRef);
}
function useWsListener(ws, event, channel, callback) {
  const off = ws.listen(event, channel, callback);
  onUnmounted(off);
  return off;
}
function useWsListenOnce(ws, event, channel) {
  let off = null;
  const promise = new Promise((resolve) => {
    off = ws.listen(event, channel, (data) => {
      off?.();
      off = null;
      resolve(data);
    });
  });
  onUnmounted(() => {
    off?.();
  });
  return promise;
}

export { createVueWsClient, useApiClient, useWsClient, useWsListenOnce, useWsListener, vueRef };

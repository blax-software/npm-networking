'use strict';

var chunkNJGSOYSN_cjs = require('./chunk-NJGSOYSN.cjs');
var vue = require('vue');

var vueRef = (initial) => vue.ref(initial);
function createVueWsClient(config) {
  const ws = chunkNJGSOYSN_cjs.createWsClient(config, vueRef);
  return Object.assign(ws, {
    listenWhileMounted(event, channel, callback) {
      const off = ws.listen(event, channel, callback);
      vue.onUnmounted(off);
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
      vue.onUnmounted(() => {
        off?.();
      });
      return promise;
    }
  });
}
function useApiClient(config) {
  return chunkNJGSOYSN_cjs.createApiClient(config);
}
function useWsClient(config) {
  return chunkNJGSOYSN_cjs.createWsClient(config, vueRef);
}
function useWsListener(ws, event, channel, callback) {
  const off = ws.listen(event, channel, callback);
  vue.onUnmounted(off);
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
  vue.onUnmounted(() => {
    off?.();
  });
  return promise;
}

Object.defineProperty(exports, "createApiClient", {
  enumerable: true,
  get: function () { return chunkNJGSOYSN_cjs.createApiClient; }
});
Object.defineProperty(exports, "createWsClient", {
  enumerable: true,
  get: function () { return chunkNJGSOYSN_cjs.createWsClient; }
});
exports.createVueWsClient = createVueWsClient;
exports.useApiClient = useApiClient;
exports.useWsClient = useWsClient;
exports.useWsListenOnce = useWsListenOnce;
exports.useWsListener = useWsListener;
exports.vueRef = vueRef;

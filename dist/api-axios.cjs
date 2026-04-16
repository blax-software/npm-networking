'use strict';

// src/api-axios.ts
function createAxiosAdapter(axiosInstance) {
  return {
    async request(config) {
      const res = await axiosInstance.request({
        method: config.method,
        url: config.url,
        data: config.data,
        headers: config.headers,
        params: config.params,
        timeout: config.timeout,
        withCredentials: config.withCredentials
      });
      return {
        data: res.data,
        status: res.status,
        headers: res.headers ?? {}
      };
    }
  };
}

exports.createAxiosAdapter = createAxiosAdapter;

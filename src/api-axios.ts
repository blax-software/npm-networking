import type { HttpAdapter, HttpResponse, HttpRequestConfig } from './types'

/**
 * Creates an HTTP adapter backed by an axios instance.
 *
 * @example
 * ```ts
 * import axios from 'axios'
 * import { createApiClient } from '@blax-software/networking'
 * import { createAxiosAdapter } from '@blax-software/networking/axios'
 *
 * const api = createApiClient({
 *   serverUrl: 'https://api.example.com',
 *   http: createAxiosAdapter(axios.create({ withCredentials: true })),
 * })
 * ```
 */
export function createAxiosAdapter(axiosInstance: any): HttpAdapter {
  return {
    async request<T>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
      const res = await axiosInstance.request({
        method: config.method,
        url: config.url,
        data: config.data,
        headers: config.headers,
        params: config.params,
        timeout: config.timeout,
        withCredentials: config.withCredentials,
      })

      return {
        data: res.data,
        status: res.status,
        headers: res.headers ?? {},
      }
    },
  }
}

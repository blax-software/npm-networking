import { H as HttpAdapter } from './types-C4-WlXk8.js';

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
declare function createAxiosAdapter(axiosInstance: any): HttpAdapter;

export { createAxiosAdapter };

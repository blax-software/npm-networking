import type {
  ApiClientConfig,
  HttpAdapter,
  HttpResponse,
  HttpRequestConfig,
  NotifyFn,
  StorageAdapter,
} from './types'
import { browserStorage, memoryStorage } from './types'

// ---------------------------------------------------------------------------
// Built-in fetch adapter
// ---------------------------------------------------------------------------

function serializeParams(params: any, prefix = ''): string {
  const parts: string[] = []
  for (const key in params) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) continue
    const value = params[key]
    if (value === undefined || value === null) continue
    const newKey = prefix
      ? `${prefix}[${encodeURIComponent(key)}]`
      : encodeURIComponent(key)
    if (typeof value === 'object' && !Array.isArray(value)) {
      parts.push(serializeParams(value, newKey))
    } else {
      parts.push(`${newKey}=${encodeURIComponent(value)}`)
    }
  }
  return parts.filter(Boolean).join('&')
}

export const fetchAdapter: HttpAdapter = {
  async request<T>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    let url = config.url
    if (config.params) {
      const qs = serializeParams(config.params)
      if (qs) url += (url.includes('?') ? '&' : '?') + qs
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(config.headers ?? {}),
    }

    const init: RequestInit = {
      method: config.method,
      headers,
      credentials: config.withCredentials ? 'include' : 'same-origin',
    }

    // Timeout via AbortSignal when available
    if (config.timeout && typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
      init.signal = AbortSignal.timeout(config.timeout)
    }

    if (config.data !== undefined && config.method !== 'GET') {
      if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
        init.body = config.data
        // Let the browser set Content-Type with boundary
        delete (init.headers as Record<string, string>)['Content-Type']
      } else {
        init.body = JSON.stringify(config.data)
      }
    }

    const res = await fetch(url, init)
    const contentType = res.headers.get('content-type') ?? ''
    let data: any
    if (contentType.includes('application/json')) {
      data = await res.json()
    } else {
      data = await res.text()
    }

    if (!res.ok) {
      const error: any = new Error(data?.message ?? `HTTP ${res.status}`)
      error.response = { data, status: res.status, headers: {} }
      error.status = res.status
      throw error
    }

    const responseHeaders: Record<string, string> = {}
    res.headers.forEach((v, k) => { responseHeaders[k] = v })

    return { data, status: res.status, headers: responseHeaders }
  },
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

export class ApiClient {
  private _config: Required<
    Pick<ApiClientConfig, 'timeout' | 'withCredentials' | 'apiPrefix' | 'storageKey' | 'maxRetries'>
  > &
    ApiClientConfig
  private _http: HttpAdapter
  private _storage: StorageAdapter
  private _notify: NotifyFn | undefined
  private _bearerToken: string = ''

  /**
   * When true, `parseError` throws without showing notifications.
   * Useful during app bootstrap to suppress transient errors.
   */
  silentErrors = false

  constructor(config: ApiClientConfig) {
    this._config = {
      timeout: 10000,
      withCredentials: true,
      apiPrefix: 'api/',
      storageKey: 'bearerToken',
      retryOn503: true,
      maxRetries: 2,
      ...config,
    }
    this._http = config.http ?? fetchAdapter
    this._storage = config.storage ?? (this._isServer() ? memoryStorage() : browserStorage)
    this._notify = config.notify
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /** Update configuration at runtime. */
  configure(partial: Partial<ApiClientConfig>): void {
    Object.assign(this._config, partial)
    if (partial.http) this._http = partial.http
    if (partial.storage) this._storage = partial.storage
    if (partial.notify !== undefined) this._notify = partial.notify
  }

  private _isServer(): boolean {
    const s = this._config.isServer
    return typeof s === 'function' ? s() : (s ?? false)
  }

  // -------------------------------------------------------------------------
  // URL helpers
  // -------------------------------------------------------------------------

  /** Resolve the current backend base URL (trailing slash guaranteed). */
  getBackendUrl(): string {
    const getter =
      this._isServer() && this._config.ssrServerUrl
        ? this._config.ssrServerUrl
        : this._config.serverUrl

    let url = typeof getter === 'function' ? getter() : getter
    if (!url) throw new Error('[networking] serverUrl is not configured')
    if (!url.endsWith('/')) url += '/'
    return url
  }

  /**
   * Build a full URL for a client asset served from a warehouse endpoint.
   * Override in subclass or configure a custom path if your backend differs.
   */
  clientAsset(path: string): string {
    return this.getBackendUrl() + 'warehouse/' + path + '?clientasset=true'
  }

  /**
   * Normalize a URL path:
   * - Leading `/` is stripped (treated as absolute relative to backend root).
   * - Otherwise, `apiPrefix` is prepended if absent.
   */
  cleanseUrl(url: string): string {
    if (url.startsWith('/')) return url.substring(1)
    if (!url.startsWith(this._config.apiPrefix!)) return this._config.apiPrefix + url
    return url
  }

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  get bearerToken(): string {
    return this._bearerToken
  }

  setBearer(token: string | null): void {
    if (!token) {
      this._bearerToken = ''
      if (!this._isServer()) {
        this._storage.remove(this._config.storageKey!)
      }
      return
    }
    this._bearerToken = token
    if (!this._isServer()) {
      this._storage.set(this._config.storageKey!, token)
    }
  }

  /** Read the bearer token from storage and activate it. Returns the token or null. */
  loadBearerFromStorage(): string | null {
    if (this._isServer()) return null
    const token = this._storage.get(this._config.storageKey!)
    if (token) this._bearerToken = token
    return token
  }

  // -------------------------------------------------------------------------
  // Internal request plumbing
  // -------------------------------------------------------------------------

  private _buildHeaders(overrides?: Record<string, string>): Record<string, string> {
    const base: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }
    if (this._bearerToken) {
      base['Authorization'] = `Bearer ${this._bearerToken}`
    }

    const defaults = this._config.defaultHeaders
    if (defaults) {
      Object.assign(base, typeof defaults === 'function' ? defaults() : defaults)
    }

    if (overrides) Object.assign(base, overrides)
    return base
  }

  private async _request<T>(config: HttpRequestConfig, attempt = 0): Promise<HttpResponse<T>> {
    try {
      return await this._http.request<T>(config)
    } catch (error: any) {
      if (
        this._config.retryOn503 &&
        error?.status === 503 &&
        attempt < this._config.maxRetries
      ) {
        const backoffMs = (attempt + 1) * 1000
        await new Promise((r) => setTimeout(r, backoffMs))
        return this._request<T>(config, attempt + 1)
      }
      throw error
    }
  }

  // -------------------------------------------------------------------------
  // HTTP verbs
  // -------------------------------------------------------------------------

  async get<T = any>(url: string, params?: any): Promise<HttpResponse<T>> {
    return this._request<T>({
      method: 'GET',
      url: this.getBackendUrl() + this.cleanseUrl(url),
      params,
      headers: this._buildHeaders(),
      timeout: this._config.timeout,
      withCredentials: this._config.withCredentials,
    })
  }

  async post<T = any>(url: string, data?: any, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this._request<T>({
      method: 'POST',
      url: this.getBackendUrl() + this.cleanseUrl(url),
      data,
      headers: this._buildHeaders(headers),
      timeout: this._config.timeout,
      withCredentials: this._config.withCredentials,
    })
  }

  async put<T = any>(url: string, data?: any): Promise<HttpResponse<T>> {
    return this._request<T>({
      method: 'PUT',
      url: this.getBackendUrl() + this.cleanseUrl(url),
      data,
      headers: this._buildHeaders(),
      timeout: this._config.timeout,
      withCredentials: this._config.withCredentials,
    })
  }

  async delete<T = any>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this._request<T>({
      method: 'DELETE',
      url: this.getBackendUrl() + this.cleanseUrl(url),
      headers: this._buildHeaders(headers),
      timeout: this._config.timeout,
      withCredentials: this._config.withCredentials,
    })
  }

  async patch<T = any>(url: string, data?: any): Promise<HttpResponse<T>> {
    return this._request<T>({
      method: 'PATCH',
      url: this.getBackendUrl() + this.cleanseUrl(url),
      data,
      headers: this._buildHeaders(),
      timeout: this._config.timeout,
      withCredentials: this._config.withCredentials,
    })
  }

  /**
   * Fetch a CSRF cookie. The default path matches Laravel Sanctum
   * but you can pass any path your backend uses.
   */
  async csrf(path = '/sanctum/csrf-cookie'): Promise<HttpResponse<any>> {
    return this.get(path)
  }

  // -------------------------------------------------------------------------
  // Error / success handlers
  // -------------------------------------------------------------------------

  /**
   * Extract a readable error message, optionally show a notification, and re-throw.
   * Designed as a `.catch()` handler: `api.get('x').catch(api.parseError)`
   */
  parseError = (e: any): never => {
    console.error(e)

    const text =
      e?.response?.data?.message ??
      e?.response?.message ??
      e?.message ??
      e?.response?.data?.errors ??
      'An unknown error occurred'

    if (this._notify && !this.silentErrors) {
      this._notify({
        text: typeof text === 'string' ? text : JSON.stringify(text),
        type: 'error',
        errors: e?.response?.data?.errors,
        timeout: 3000,
      })
    }

    throw e
  }

  /**
   * Show a success notification from a response.
   * Usage: `api.post('x').then(api.parseThen)`
   */
  parseThen = (res: any, fallback?: string): void => {
    const msg = res?.data?.message ?? res?.message ?? fallback ?? 'Success'
    if (this._notify) {
      this._notify(typeof msg === 'string' ? msg : JSON.stringify(msg))
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config)
}

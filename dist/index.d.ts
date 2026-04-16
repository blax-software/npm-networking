import { A as ApiClientConfig, a as HttpResponse, H as HttpAdapter, R as ReactiveRef, W as WsClientConfig, C as CreateRefFn } from './types-C4-WlXk8.js';
export { b as HttpRequestConfig, N as NotifyFn, c as NotifyOptions, S as StorageAdapter, T as TranslateFn, d as browserStorage, m as memoryStorage, p as plainRef } from './types-C4-WlXk8.js';

declare const fetchAdapter: HttpAdapter;
declare class ApiClient {
    private _config;
    private _http;
    private _storage;
    private _notify;
    private _bearerToken;
    /**
     * When true, `parseError` throws without showing notifications.
     * Useful during app bootstrap to suppress transient errors.
     */
    silentErrors: boolean;
    constructor(config: ApiClientConfig);
    /** Update configuration at runtime. */
    configure(partial: Partial<ApiClientConfig>): void;
    private _isServer;
    /** Resolve the current backend base URL (trailing slash guaranteed). */
    getBackendUrl(): string;
    /**
     * Build a full URL for a client asset served from a warehouse endpoint.
     * Override in subclass or configure a custom path if your backend differs.
     */
    clientAsset(path: string): string;
    /**
     * Normalize a URL path:
     * - Leading `/` is stripped (treated as absolute relative to backend root).
     * - Otherwise, `apiPrefix` is prepended if absent.
     */
    cleanseUrl(url: string): string;
    get bearerToken(): string;
    setBearer(token: string | null): void;
    /** Read the bearer token from storage and activate it. Returns the token or null. */
    loadBearerFromStorage(): string | null;
    private _buildHeaders;
    private _request;
    get<T = any>(url: string, params?: any): Promise<HttpResponse<T>>;
    post<T = any>(url: string, data?: any, headers?: Record<string, string>): Promise<HttpResponse<T>>;
    put<T = any>(url: string, data?: any): Promise<HttpResponse<T>>;
    delete<T = any>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>>;
    patch<T = any>(url: string, data?: any): Promise<HttpResponse<T>>;
    /**
     * Fetch a CSRF cookie. The default path matches Laravel Sanctum
     * but you can pass any path your backend uses.
     */
    csrf(path?: string): Promise<HttpResponse<any>>;
    /**
     * Extract a readable error message, optionally show a notification, and re-throw.
     * Designed as a `.catch()` handler: `api.get('x').catch(api.parseError)`
     */
    parseError: (e: any) => never;
    /**
     * Show a success notification from a response.
     * Usage: `api.post('x').then(api.parseThen)`
     */
    parseThen: (res: any, fallback?: string) => void;
}
declare function createApiClient(config: ApiClientConfig): ApiClient;

interface WsSocket extends WebSocket {
    socket_id?: string;
}
interface WsChannel {
    name: string;
    is_established: boolean;
    establish(): Promise<WsChannel>;
    send(event: string, data?: any): Promise<any>;
    unsubscribe(): Promise<boolean>;
}
interface WsClient {
    socket: WsSocket | null;
    channels: WsChannel[];
    is_opened: ReactiveRef<boolean>;
    is_setup: ReactiveRef<boolean>;
    is_connecting_socket: ReactiveRef<boolean>;
    is_after_lost_connection: ReactiveRef<boolean>;
    heartbeat: ReturnType<typeof setInterval> | null;
    last_reconnect_try: number;
    send_queue: any[];
    connect(force_reset?: boolean): Promise<WsSocket | void>;
    ensureConnected(): Promise<void>;
    channel(channel_name?: string | null): Promise<WsChannel | undefined>;
    send<T = any>(event: string, data?: object, channel_name?: string | null, progress?: (data: any) => void): Promise<T>;
    unsubscribe(channel_name?: string | null): Promise<boolean>;
    /**
     * Listen for a WS event. Returns an unsubscribe function.
     * Works with any framework's cleanup (React useEffect, Vue onUnmounted, etc.)
     */
    listen(event: string, channel_name: string | null | undefined, callback: (data: any) => void): () => void;
    /** Resolve once when the given event fires. */
    listenOnce(event: string, channel_name?: string | null): Promise<any>;
    /** Signal that app initialization is complete. Unblocks gated send() calls. */
    setAppReady(): void;
    /** Force channels to re-subscribe with the current auth token on next send(). */
    resetConnection(): void;
    /** Update configuration at runtime. */
    configure(partial: Partial<WsClientConfig>): void;
    /** Close the connection, clear intervals, and reset all state. */
    destroy(): void;
}
/**
 * Create a WebSocket client.
 *
 * @param config - Connection and behavior configuration.
 * @param createRef - Reactive ref factory. Pass `ref` from Vue for reactive state,
 *                    or omit for plain `{ value }` objects.
 */
declare function createWsClient(config: WsClientConfig, createRef?: CreateRefFn): WsClient;

export { ApiClient, ApiClientConfig, CreateRefFn, HttpAdapter, HttpResponse, ReactiveRef, type WsChannel, type WsClient, WsClientConfig, createApiClient, createWsClient, fetchAdapter };

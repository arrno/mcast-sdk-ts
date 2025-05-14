/**
 * Configuration options for the McastClient
 */
export interface McastOptions {
    /**
     * Authentication token for the client
     */
    authToken: string;

    /**
     * The channel to connect to
     */
    channel: string;

    /**
     * Optionally, root topics subscribed to filtered on server
     */
    topics?: Array<string>;

    /**
     * Additional headers to include in requests
     */
    headers?: Record<string, string>;

    /**
     * Whether to automatically reconnect on connection loss
     * @default true
     */
    autoReconnect?: boolean;

    /**
     * Maximum reconnection attempts before giving up
     * @default 5
     */
    maxReconnectAttempts?: number;

    /**
     * Delay between reconnection attempts (in milliseconds)
     * @default 3000
     */
    reconnectDelay?: number;

    /**
     * Whether to log debug information to the console
     * @default false
     */
    debug?: boolean;
}

/**
 * Message object for publishing and receiving
 */
export interface Message {
    /**
     * Topic of the message
     */
    topic: string;

    /**
     * Payload of the message
     */
    payload: Record<string, any>;
}

/**
 * Serialized message format used internally
 */
export interface SerializedMessage {
    /**
     * Topic of the message
     */
    topic: string;

    /**
     * Serialized payload of the message
     */
    payload: string;
}

/**
 * Connection states for WebSocket connections
 */
export enum ConnectionState {
    DISCONNECTED = "disconnected",
    CONNECTING = "connecting",
    CONNECTED = "connected",
    RECONNECTING = "reconnecting",
    ERROR = "error",
}

/**
 * Constant representing all topics
 */
export const TOPIC_ALL: string = "_ALL_";

/**
 * Response from the server to the client
 */
export interface StandardResponse {
    success: boolean;
    message?: string;
    error?: string;
    data?: any;
}

/**
 * Account focused response from the server to the client
 */
export interface AccountResponse {
    clientId: string;
    channel?: string;
    token?: string;
    tokenExpiresAt?: Date;
    clientName?: string;
    clientGroup?: string;
}

/**
 * Callback type for message subscription
 */
export type MessageCallback = (
    topic: string,
    message: Record<string, any>
) => void;

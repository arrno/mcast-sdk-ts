import {
    AccountResponse,
    McastOptions,
    ConnectionState,
    Message,
    MessageCallback,
    SerializedMessage,
    StandardResponse,
    TOPIC_ALL,
} from "./types";

// Import WebSocket for Node.js environments
import * as ws from "ws";

// Use the appropriate WebSocket implementation depending on the environment
const WebSocketImpl =
    typeof WebSocket !== "undefined" ? WebSocket : ws.WebSocket;

/**
 * Mcast WebSocket Client
 *
 * Manages WebSocket connections to a Mcast server for real-time messaging
 */
export class McastClient {
    private baseUrl: string = "https://chanban-112482603531.us-east4.run.app";
    private authToken: string;
    private channel: string;
    private headers: Record<string, string>;
    private autoReconnect: boolean;
    private maxReconnectAttempts: number;
    private reconnectDelay: number;
    private debug: boolean;
    private rootTopics: Array<string>;

    // WebSocket connections
    private pubSocket: any | null = null;
    private subSocket: any | null = null;

    // Connection state tracking
    private pubState: ConnectionState = ConnectionState.DISCONNECTED;
    private subState: ConnectionState = ConnectionState.DISCONNECTED;

    // Reconnection tracking
    private pubReconnectAttempts: number = 0;
    private subReconnectAttempts: number = 0;

    // Topic subscriptions
    private listeners: {
        [key: string]: Array<MessageCallback>;
    } = {};

    // Connection state change listeners
    private stateChangeListeners: Array<
        (
            state: ConnectionState,
            connectionType: "publisher" | "subscriber"
        ) => void
    > = [];

    /**
     * Creates a new instance of the McastClient
     *
     * @param options Configuration options for the client
     */
    constructor(options: McastOptions) {
        this.authToken = options.authToken;
        this.channel = options.channel;

        this.rootTopics = options.topics ?? [];
        if (this.rootTopics.includes(TOPIC_ALL)) {
            this.rootTopics = [TOPIC_ALL];
        }

        // Create headers with Authorization token
        // The server expects 'Authorization: Bearer <token>' or just the raw token
        this.headers = { ...options.headers };

        // Only add Authorization if it's not already present
        if (!this.headers["Authorization"]) {
            // Add Bearer prefix if not already included
            if (!this.authToken.startsWith("Bearer ")) {
                this.headers["Authorization"] = `Bearer ${this.authToken}`;
            } else {
                this.headers["Authorization"] = this.authToken;
            }
        }

        this.autoReconnect = options.autoReconnect ?? true;
        this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5;
        this.reconnectDelay = options.reconnectDelay ?? 3000;
        this.debug = options.debug ?? false;

        this.logDebug(
            "Initialized with options:",
            JSON.stringify({
                baseUrl: this.baseUrl,
                channel: this.channel,
                autoReconnect: this.autoReconnect,
                maxReconnectAttempts: this.maxReconnectAttempts,
                reconnectDelay: this.reconnectDelay,
                debug: this.debug,
            })
        );
    }

    /**
     * Handling storing the new auth token and updating headers
     *
     * @param token The new auth token
     */
    private updateAuthToken(token: string): void {
        this.authToken = token;
        // Add Bearer prefix if not already included
        if (this.authToken.startsWith("Bearer ")) {
            this.headers["Authorization"] = this.authToken;
        } else {
            this.headers["Authorization"] = `Bearer ${this.authToken}`;
        }
    }

    /**
     * Rotates the account token via HTTP POST
     *
     * @returns Promise that resolves with the server response
     */
    async rotateToken(): Promise<AccountResponse> {
        const response = await fetch(`${this.baseUrl}/rotate-token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...this.headers,
            },
            body: `{}`,
        });

        if (!response.ok) {
            throw new Error(
                `HTTP error: ${response.status} ${response.statusText}`
            );
        }

        // Update auth token/headers
        const accountInfo = (await response.json()) as AccountResponse;
        if (accountInfo.token) {
            this.updateAuthToken(accountInfo.token);
        }
        return accountInfo;
    }

    /**
     * Sets up a WebSocket connection for publishing messages
     *
     * @returns Promise that resolves when the connection is established
     */
    private async connectPublisher(): Promise<void> {
        if (this.isSocketConnected(this.pubSocket)) {
            return;
        }

        this.updatePublisherState(ConnectionState.CONNECTING);

        // Build the query parameters from headers
        const queryParams = Object.entries(this.headers)
            .map(
                ([key, value]) =>
                    `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
            )
            .join("&");

        // Create the WebSocket connection
        // Note: The server expects a POST method for WebSocket upgrade
        // Standard WebSocket creates a GET request, so we need to ensure our URL is precisely what the server expects
        const url = `${this.getWebSocketBaseUrl()}/pub-ws?channel=${encodeURIComponent(
            this.channel
        )}&${queryParams}`;

        // In both browser and Node.js environments, we need to use standard WebSocket initialization
        // The server has been modified to accept both GET and POST for WebSocket upgrades
        this.pubSocket = new WebSocketImpl(url);

        // Log connection attempt
        this.logDebug(`Attempting to connect publisher to ${url}`);

        return new Promise<void>((resolve, reject) => {
            if (!this.pubSocket) {
                this.updatePublisherState(ConnectionState.ERROR);
                reject(new Error("Failed to create publisher WebSocket"));
                return;
            }

            // Set up event handlers
            this.pubSocket.onopen = () => {
                this.updatePublisherState(ConnectionState.CONNECTED);
                this.pubReconnectAttempts = 0;
                this.logDebug("Publisher connected");
                resolve();
            };

            this.pubSocket.onclose = (event: any) => {
                const wasConnected =
                    this.pubState === ConnectionState.CONNECTED;
                this.updatePublisherState(ConnectionState.DISCONNECTED);
                this.logDebug(
                    `Publisher disconnected: ${event?.code} ${event?.reason}`
                );

                // Handle reconnection
                if (wasConnected && this.autoReconnect) {
                    this.attemptReconnectPublisher();
                }
                if (!wasConnected) {
                    reject(
                        new Error(
                            `WebSocket error: ${event?.message || "Denied"}`
                        )
                    );
                }
            };

            this.pubSocket.onerror = (event: any) => {
                this.updatePublisherState(ConnectionState.ERROR);
                this.logDebug(
                    `Publisher error: ${event?.message || "Unknown error"}`
                );
                reject(
                    new Error(
                        `WebSocket error: ${event?.message || "Unknown error"}`
                    )
                );
            };
        });
    }

    /**
     * Sets up a WebSocket connection for subscribing to messages
     *
     * @returns Promise that resolves when the connection is established
     */
    private async connectSubscriber(): Promise<void> {
        if (this.isSocketConnected(this.subSocket)) {
            return;
        }

        this.updateSubscriberState(ConnectionState.CONNECTING);

        // Build the query parameters from headers
        let queryParams = Object.entries(this.headers)
            .map(
                ([key, value]) =>
                    `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
            )
            .join("&");

        // Optionally topics filtered on server
        if (this.rootTopics.length > 0) {
            queryParams += `&topics=${this.rootTopics
                .map((topic) => encodeURIComponent(topic))
                .join(",")}`;
        }

        // Create the WebSocket connection
        // Note: The server expects a POST method for WebSocket upgrade
        // Standard WebSocket creates a GET request, so we need to ensure our URL is precisely what the server expects
        const url = `${this.getWebSocketBaseUrl()}/sub?channel=${encodeURIComponent(
            this.channel
        )}&${queryParams}`;

        // In both browser and Node.js environments, we need to use standard WebSocket initialization
        // The server has been modified to accept both GET and POST for WebSocket upgrades
        this.subSocket = new WebSocketImpl(url);

        // Log connection attempt
        this.logDebug(`Attempting to connect subscriber to ${url}`);

        return new Promise<void>((resolve, reject) => {
            if (!this.subSocket) {
                this.updateSubscriberState(ConnectionState.ERROR);
                reject(new Error("Failed to create subscriber WebSocket"));
                return;
            }

            // Set up event handlers
            this.subSocket.onopen = () => {
                this.updateSubscriberState(ConnectionState.CONNECTED);
                this.subReconnectAttempts = 0;
                this.logDebug("Subscriber connected");
                resolve();
            };

            this.subSocket.onclose = (event: any) => {
                const wasConnected =
                    this.subState === ConnectionState.CONNECTED;
                this.updateSubscriberState(ConnectionState.DISCONNECTED);
                this.logDebug(
                    `Subscriber disconnected: ${event?.code} ${event?.reason}`
                );

                // Handle reconnection
                if (wasConnected && this.autoReconnect) {
                    this.attemptReconnectSubscriber();
                }

                if (!wasConnected) {
                    reject(
                        new Error(
                            `WebSocket error: ${event?.message || "Denied"}`
                        )
                    );
                }
            };

            this.subSocket.onerror = (event: any) => {
                this.updateSubscriberState(ConnectionState.ERROR);
                this.logDebug(
                    `Subscriber error: ${event?.message || "Unknown error"}`
                );
                reject(
                    new Error(
                        `WebSocket error: ${event?.message || "Unknown error"}`
                    )
                );
            };

            // Set up message handler
            this.subSocket.onmessage = (event: any) => {
                try {
                    const message: SerializedMessage = JSON.parse(
                        event.data.toString()
                    );

                    const listeners: Array<MessageCallback> = [
                        ...(this.listeners[message.topic] ?? []),
                        ...(this.listeners[TOPIC_ALL] ?? []),
                    ];

                    if (listeners && listeners.length > 0) {
                        let parsedPayload: Record<string, any>;
                        try {
                            parsedPayload = JSON.parse(message.payload);
                        } catch (error) {
                            this.logDebug(
                                `Failed to parse message payload: ${error}`
                            );
                            return;
                        }

                        listeners.forEach((callback) => {
                            try {
                                callback(message.topic, parsedPayload);
                            } catch (error) {
                                this.logDebug(
                                    `Error in message callback: ${error}`
                                );
                            }
                        });
                    }
                } catch (error) {
                    this.logDebug(
                        `Error processing WebSocket message: ${error}`
                    );
                }
            };
        });
    }

    /**
     * Attempts to reconnect the publisher socket
     */
    private attemptReconnectPublisher(): void {
        if (this.pubReconnectAttempts >= this.maxReconnectAttempts) {
            this.logDebug(
                `Max publisher reconnect attempts (${this.maxReconnectAttempts}) reached, giving up`
            );
            return;
        }

        this.updatePublisherState(ConnectionState.RECONNECTING);
        this.pubReconnectAttempts++;

        this.logDebug(
            `Attempting to reconnect publisher (attempt ${this.pubReconnectAttempts}/${this.maxReconnectAttempts})...`
        );

        setTimeout(() => {
            this.connectPublisher().catch((err) => {
                this.logDebug(`Failed to reconnect publisher: ${err.message}`);
                this.attemptReconnectPublisher();
            });
        }, this.reconnectDelay);
    }

    /**
     * Attempts to reconnect the subscriber socket
     */
    private attemptReconnectSubscriber(): void {
        if (this.subReconnectAttempts >= this.maxReconnectAttempts) {
            this.logDebug(
                `Max subscriber reconnect attempts (${this.maxReconnectAttempts}) reached, giving up`
            );
            return;
        }

        this.updateSubscriberState(ConnectionState.RECONNECTING);
        this.subReconnectAttempts++;

        this.logDebug(
            `Attempting to reconnect subscriber (attempt ${this.subReconnectAttempts}/${this.maxReconnectAttempts})...`
        );

        setTimeout(() => {
            this.connectSubscriber().catch((err) => {
                this.logDebug(`Failed to reconnect subscriber: ${err.message}`);
                this.attemptReconnectSubscriber();
            });
        }, this.reconnectDelay);
    }

    /**
     * Updates the publisher connection state and notifies listeners
     *
     * @param state New connection state
     */
    private updatePublisherState(state: ConnectionState): void {
        this.pubState = state;
        this.notifyStateChangeListeners(state, "publisher");
    }

    /**
     * Updates the subscriber connection state and notifies listeners
     *
     * @param state New connection state
     */
    private updateSubscriberState(state: ConnectionState): void {
        this.subState = state;
        this.notifyStateChangeListeners(state, "subscriber");
    }

    /**
     * Notifies all state change listeners of a state change
     *
     * @param state New connection state
     * @param connectionType Type of connection that changed state
     */
    private notifyStateChangeListeners(
        state: ConnectionState,
        connectionType: "publisher" | "subscriber"
    ): void {
        this.stateChangeListeners.forEach((listener) => {
            try {
                listener(state, connectionType);
            } catch (error) {
                this.logDebug(`Error in state change listener: ${error}`);
            }
        });
    }

    /**
     * Publishes a message to a topic
     *
     * @param topic Topic to publish to
     * @param payload Message payload to publish
     * @returns Promise that resolves when the message is published
     */
    async publish(topic: string, payload: Record<string, any>): Promise<void> {
        // Ensure the publisher is connected
        await this.connectPublisher();

        // Create the message
        const message: SerializedMessage = {
            topic,
            payload: JSON.stringify(payload),
        };

        // Send the message
        this.pubSocket?.send(JSON.stringify(message));
    }

    /**
     * Publishes a message via HTTP POST instead of WebSocket
     *
     * @param topic Topic to publish to
     * @param payload Message payload to publish
     * @returns Promise that resolves with the server response
     */
    async publishHttp(
        topic: string,
        payload: Record<string, any>
    ): Promise<StandardResponse> {
        const message: SerializedMessage = {
            topic,
            payload: JSON.stringify(payload),
        };

        const response = await fetch(
            `${this.baseUrl}/pub?channel=${encodeURIComponent(this.channel)}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...this.headers,
                },
                body: JSON.stringify(message),
            }
        );

        if (!response.ok) {
            throw new Error(
                `HTTP error: ${response.status} ${response.statusText}`
            );
        }

        return await response.json();
    }

    /**
     * Subscribes to one or more topics
     *
     * @param callback Callback function to call when a message is received
     * @param topics Optional topic or topics to subscribe to filtered on client
     * @returns Promise that resolves when the subscription is established
     */
    async subscribe(
        callback: MessageCallback,
        topics?: string | string[]
    ): Promise<void> {
        topics = topics ?? TOPIC_ALL;
        // Ensure array of topics
        let topicArray = Array.isArray(topics) ? topics : [topics];
        if (topicArray.includes(TOPIC_ALL)) {
            topicArray = [TOPIC_ALL];
        }

        // Ensure the subscriber is connected
        await this.connectSubscriber();

        // Add the callback for each topic
        topicArray.forEach((topic) => {
            if (!this.listeners[topic]) {
                this.listeners[topic] = [];
            }
            this.listeners[topic].push(callback);
        });
    }

    /**
     * Unsubscribes from a topic
     *
     * @param topic Topic to unsubscribe from
     * @param callback Optional callback function to remove. If not provided, all callbacks for the topic will be removed.
     */
    unsubscribe(topic: string, callback?: MessageCallback): void {
        if (!this.listeners[topic]) {
            return;
        }

        if (callback) {
            // Remove the specific callback
            this.listeners[topic] = this.listeners[topic].filter(
                (cb) => cb !== callback
            );

            // Clean up if no more callbacks
            if (this.listeners[topic].length === 0) {
                delete this.listeners[topic];
            }
        } else {
            // Remove all callbacks for this topic
            delete this.listeners[topic];
        }
    }

    /**
     * Disconnects from the server
     */
    disconnect(): void {
        // Close publisher socket
        if (this.pubSocket) {
            this.updatePublisherState(ConnectionState.DISCONNECTED);
            this.pubSocket.close();
            this.pubSocket = null;
        }

        // Close subscriber socket
        if (this.subSocket) {
            this.updateSubscriberState(ConnectionState.DISCONNECTED);
            this.subSocket.close();
            this.subSocket = null;
        }

        this.logDebug("Disconnected from server");
    }

    /**
     * Adds a listener for connection state changes
     *
     * @param listener Function to call when the connection state changes
     * @returns Function to remove the listener
     */
    onStateChange(
        listener: (
            state: ConnectionState,
            connectionType: "publisher" | "subscriber"
        ) => void
    ): () => void {
        this.stateChangeListeners.push(listener);

        // Return a function to remove the listener
        return () => {
            this.stateChangeListeners = this.stateChangeListeners.filter(
                (l) => l !== listener
            );
        };
    }

    /**
     * Gets the current connection state for the publisher
     */
    getPublisherState(): ConnectionState {
        return this.pubState;
    }

    /**
     * Gets the current connection state for the subscriber
     */
    getSubscriberState(): ConnectionState {
        return this.subState;
    }

    /**
     * Checks if a socket is connected
     *
     * @param socket WebSocket to check
     * @returns True if the socket is connected
     */
    private isSocketConnected(socket: any): boolean {
        if (!socket) return false;
        // WebSocket.OPEN is 1 in both browser and Node.js WebSocket implementations
        return socket.readyState === 1;
    }

    /**
     * Gets the WebSocket base URL (ws:// or wss://) from the HTTP base URL
     *
     * @returns WebSocket base URL
     */
    private getWebSocketBaseUrl(): string {
        if (this.baseUrl.startsWith("https://")) {
            return this.baseUrl.replace("https://", "wss://");
        } else if (this.baseUrl.startsWith("http://")) {
            return this.baseUrl.replace("http://", "ws://");
        } else {
            // Assume HTTP if no protocol specified
            return `ws://${this.baseUrl}`;
        }
    }

    /**
     * Logs a debug message if debug mode is enabled
     *
     * @param message Message to log
     * @param args Additional arguments to log
     */
    private logDebug(message: string, ...args: any[]): void {
        if (this.debug) {
            if (args.length > 0) {
                console.debug(`[McastClient] ${message}`, ...args);
            } else {
                console.debug(`[McastClient] ${message}`);
            }
        }
    }
}

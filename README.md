# Mcast Client

A TypeScript client for interacting with the Mcast WebSocket API for real-time messaging.

## Installation

```bash
npm install mcast-client
```

## Usage

The client provides a clean interface for subscribing to topics and publishing messages using WebSockets.

### Basic Example

```typescript
import { McastClient, ConnectionState } from "mcast-client";

// Initialize the client
const client = new McastClient({
    authToken: "your-auth-token",
    channel: "your-channel-name",
    debug: true, // Optional: enables debug logging
});

// Listen for connection state changes
client.onStateChange((state, connectionType) => {
    console.log(`${connectionType} connection state: ${state}`);
});

// Subscribe to topics
await client.subscribe(
    (topic, message) => {
        console.log(`Received message on topic '${topic}':`, message);
    },
    ["updates", "notifications"]
);

// Publish a message
await client.publish("updates", {
    id: "msg-123",
    text: "Hello world!",
    timestamp: new Date().toISOString(),
});

// When done, clean up
await client.disconnect();
```

### Features

-   WebSocket-based real-time messaging
-   Auto-reconnection on connection loss
-   Connection state tracking and events
-   Topic-based publish/subscribe
-   HTTP fallback for publishing
-   Browser and Node.js support
-   Thread-safe with race condition protection
-   Reliable clean disconnection

## API Reference

### McastClient

The main class that handles WebSocket connections for publishing and subscribing.

#### Constructor

```typescript
constructor(options: McastOptions)
```

Parameters:

-   `options`: Configuration options
    -   `authToken` (required): Authentication token
    -   `channel` (required): Channel to connect to
    -   `topics` (optional): Topics to subscribe to filtered on server (default: all)
    -   `headers` (optional): Additional headers to include in requests
    -   `autoReconnect` (optional): Whether to automatically reconnect (default: true)
    -   `maxReconnectAttempts` (optional): Maximum reconnection attempts before giving up (default: 5)
    -   `reconnectDelay` (optional): Delay between reconnection attempts in ms (default: 3000)
    -   `debug` (optional): Whether to log debug information (default: false)

#### Methods

##### publish(topic, payload)

Publishes a message to a specific topic via WebSocket.

```typescript
async publish(topic: string, payload: Record<string, any>): Promise<void>
```

Parameters:

-   `topic`: Topic name to publish to
-   `payload`: Message content as a JSON object

##### publishHttp(topic, payload)

Publishes a message to a specific topic via HTTP POST (useful as a fallback).

```typescript
async publishHttp(topic: string, payload: Record<string, any>): Promise<StandardResponse>
```

Parameters:

-   `topic`: Topic name to publish to
-   `payload`: Message content as a JSON object

##### subscribe(callback, topics)

Subscribes to one or more topics and registers a callback function for messages.

```typescript
async subscribe(callback: MessageCallback, topics?: string | string[]): Promise<void>
```

Parameters:

-   `callback`: Function called with each received message
-   `topics` (optional): Topic name or array of topic names to subscribe to (default: all)

##### unsubscribe(topic, callback?)

Unsubscribes from a specific topic.

```typescript
unsubscribe(topic: string, callback?: MessageCallback): void
```

Parameters:

-   `topic`: Topic name to unsubscribe from
-   `callback` (optional): Specific callback to remove. If not provided, all callbacks for this topic are removed.

##### disconnect()

Closes all WebSocket connections and ensures proper cleanup. Returns a promise that resolves when disconnection is complete.

```typescript
async disconnect(): Promise<void>
```

##### onStateChange(listener)

Registers a listener function for connection state changes.

```typescript
onStateChange(listener: (state: ConnectionState, connectionType: 'publisher' | 'subscriber') => void): () => void
```

Parameters:

-   `listener`: Function to call when connection state changes

Returns:

-   A function that can be called to remove the listener

##### getPublisherState()

Gets the current state of the publisher connection.

```typescript
getPublisherState(): ConnectionState
```

##### getSubscriberState()

Gets the current state of the subscriber connection.

```typescript
getSubscriberState(): ConnectionState
```

##### rotateToken()

Rotates the authentication token of the caller.

```typescript
async rotateToken(): Promise<AccountResponse>
```

### Types

#### ALL constant

A special constant for subscribing to ALL topics on a channel

```typescript
const TOPIC_ALL: string = "_ALL_";
```

#### ConnectionState

An enum representing the possible connection states:

```typescript
enum ConnectionState {
    DISCONNECTING = "disconnecting",
    DISCONNECTED = "disconnected",
    CONNECTING = "connecting",
    CONNECTED = "connected",
    RECONNECTING = "reconnecting",
    ERROR = "error",
}
```

#### Message

Interface representing a message:

```typescript
interface Message {
    topic: string;
    payload: Record<string, any>;
}
```

#### StandardResponse

Interface representing a standardized server response:

```typescript
interface StandardResponse {
    success: boolean;
    message?: string;
    error?: string;
    data?: any;
}
```

#### AccountResponse

Interface representing an account focused server response:

```typescript
export interface AccountResponse {
    clientId: string;
    channel?: string;
    token?: string;
    tokenExpiresAt?: Date;
    clientName?: string;
    clientGroup?: string;
}
```

## Error Handling

The client methods that establish connections (`subscribe`, `publish`) are async functions that throw errors when connection fails. You should wrap calls in try/catch blocks to handle potential errors.

## Multi-threading Safety

The client is designed to be safe for use with multiple concurrent async operations. It uses internal locks to prevent race conditions when multiple processes attempt to connect, publish, or subscribe simultaneously.

## Cleanup and Disconnection

The `disconnect()` method now returns a Promise that resolves when all connections are properly closed. This ensures that sockets are properly cleaned up, especially important when dealing with error scenarios.

```typescript
try {
    // Use the client...
} catch (error) {
    console.error("Error:", error);
} finally {
    // Wait for proper cleanup
    await client.disconnect();
}
```

## Environment Variables

The client provides a helper function to load configuration from environment variables:

```typescript
import { McastClient, loadFromEnv } from "mcast-client";

// Load configuration from environment variables
const config = loadFromEnv();
const client = new McastClient(config);
```

Supported environment variables:

| Variable                     | Description                              | Required | Default |
| ---------------------------- | ---------------------------------------- | -------- | ------- |
| MCAST_AUTH_TOKEN             | Authentication token                     | Yes      | -       |
| MCAST_CHANNEL                | Channel name                             | Yes      | -       |
| MCAST_DEBUG                  | Enable debug logging                     | No       | false   |
| MCAST_AUTO_RECONNECT         | Auto reconnect on disconnect             | No       | true    |
| MCAST_MAX_RECONNECT_ATTEMPTS | Maximum reconnection attempts            | No       | 5       |
| MCAST_RECONNECT_DELAY        | Delay between reconnection attempts (ms) | No       | 3000    |

## Browser Support

The client automatically detects the environment and uses the appropriate WebSocket implementation.

## License

MIT

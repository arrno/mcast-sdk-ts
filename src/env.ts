import { McastOptions } from "./types";

/**
 * Load client configuration from environment variables
 *
 * @returns Client options loaded from environment variables
 * @throws Error if required environment variables are missing
 */
export function loadFromEnv(): McastOptions {
    // Required configuration
    const authToken = process.env.MCAST_AUTH_TOKEN;
    const channel = process.env.MCAST_CHANNEL;

    if (!authToken) {
        throw new Error("MCAST_AUTH_TOKEN environment variable is required");
    }

    if (!channel) {
        throw new Error("MCAST_CHANNEL environment variable is required");
    }

    // Optional configuration
    const debug = process.env.MCAST_DEBUG === "true";
    const autoReconnect = process.env.MCAST_AUTO_RECONNECT !== "false"; // Default to true
    const maxReconnectAttempts = parseInt(
        process.env.MCAST_MAX_RECONNECT_ATTEMPTS || "5",
        10
    );
    const reconnectDelay = parseInt(
        process.env.MCAST_RECONNECT_DELAY || "3000",
        10
    );

    return {
        authToken,
        channel,
        debug,
        autoReconnect,
        maxReconnectAttempts,
        reconnectDelay,
    };
}

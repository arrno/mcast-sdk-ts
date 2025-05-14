import { McastClient, ConnectionState } from "./index";

async function main() {
    // Initialize the client with your credentials
    const client = new McastClient({
        authToken: "your-auth-token",
        channel: "test-channel",
        debug: true,
    });

    // Listen for connection state changes
    const unsubscribe = client.onStateChange((state, connectionType) => {
        console.log(`${connectionType} connection state changed to: ${state}`);
    });

    try {
        // Subscribe to multiple topics
        console.log("Subscribing to topics...");
        await client.subscribe(
            (topic, message) => {
                console.log(`Received message on topic '${topic}':`, message);
            },
            ["updates", "notifications"]
        );

        // Publish a message
        console.log("Publishing message...");
        await client.publish("updates", {
            id: "msg-1",
            text: "Hello from Mcast client!",
            timestamp: new Date().toISOString(),
        });

        // Keep the connection open for a while to receive messages
        console.log("Waiting for messages...");
        await new Promise((resolve) => setTimeout(resolve, 30000));

        // Unsubscribe from state change events
        unsubscribe();

        // Unsubscribe from a topic
        client.unsubscribe("notifications");

        // Publish using HTTP fallback
        console.log("Publishing message via HTTP...");
        const response = await client.publishHttp("updates", {
            id: "msg-2",
            text: "Hello via HTTP!",
            timestamp: new Date().toISOString(),
        });
        console.log("HTTP publish response:", response);
    } catch (error) {
        console.error("Error:", error);
    } finally {
        // Clean up
        client.disconnect();
        console.log("Disconnected");
    }
}

// Run the example
main().catch(console.error);

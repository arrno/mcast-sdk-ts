import { McastClient, loadFromEnv } from "./index";

// Try to load configuration from environment variables
async function main() {
    try {
        // Load configuration from environment variables
        const config = loadFromEnv();
        console.log("Configuration loaded from environment:", config);

        // Initialize the SDK with the loaded configuration
        const client = new McastClient(config);

        // Subscribe to a topic
        await client.subscribe((topic, message) => {
            console.log(`Received message on topic '${topic}':`, message);
        }, "updates");

        // Publish a message
        await client.publish("updates", {
            id: `msg-${Date.now()}`,
            text: "This message was sent using environment-based configuration",
            timestamp: new Date().toISOString(),
        });

        // Keep the connection open for a while
        console.log("Waiting for messages...");
        await new Promise((resolve) => setTimeout(resolve, 10000));

        // Clean up
        client.disconnect();
        console.log("Disconnected");
    } catch (error) {
        console.error("Error:", error);
    }
}

// Run the example
main().catch(console.error);

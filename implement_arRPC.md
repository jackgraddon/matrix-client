To implement `setPresence` using [arRPC](), you need to create a bridge that translates the Discord-style "Activity" JSON into the Matrix "Presence" format.

Since you are using the [matrix-js-sdk](), here is a concrete implementation guide.

### 1. Connect to the arRPC WebSocket

The local `arRPC` server (which you run via `npx arrpc`) exposes a WebSocket that broadcasts activity updates. You need to connect to this in your client.

```javascript
// Connect to the local arRPC server
const rpcSocket = new WebSocket("ws://127.0.0.1:1337");

rpcSocket.onopen = () => {
    console.log("Connected to arRPC bridge");
};

rpcSocket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    // arRPC sends activity updates via 'SET_ACTIVITY'
    if (msg.cmd === "SET_ACTIVITY" && msg.args) {
        handleActivityUpdate(msg.args.activity);
    }
};

```

### 2. Map Activity to `setPresence`

The [matrix-js-sdk]() uses a simple `status_msg` string. Discord's activity is much more detailed (state, details, assets), so you'll want to format it into a single line.

```javascript
async function handleActivityUpdate(activity) {
    if (!activity) {
        // If activity is null/empty, clear the status
        await client.setPresence({
            presence: "online",
            status_msg: ""
        });
        return;
    }

    // Format the Discord Activity into a Matrix Status Message
    // Example: "Playing Elden Ring: Exploring Limgrave"
    let statusText = activity.name;
    if (activity.details) statusText += `: ${activity.details}`;
    if (activity.state) statusText += ` (${activity.state})`;

    try {
        await client.setPresence({
            presence: "online",
            status_msg: statusText
        });
        console.log("Updated Matrix status:", statusText);
    } catch (err) {
        console.error("Failed to set Matrix presence:", err);
    }
}

```

### 3. Handling the "Offline" Case

Since you want the status to clear when you go offline, you should ensure that when the WebSocket closes (e.g., you close the game or stop arRPC), you reset the Matrix presence.

```javascript
rpcSocket.onclose = () => {
    console.warn("arRPC disconnected. Clearing status.");
    client.setPresence({
        presence: "online",
        status_msg: ""
    });
};

// Also clear on PWA/Tab close
window.addEventListener("beforeunload", () => {
    client.setPresence({
        presence: "offline",
        status_msg: ""
    });
});

```

### Summary of the Bridge

1. **Transport:** You are using a local WebSocket to talk to [arRPC]().
2. **Mapping:** You are concatenating `activity.name`, `activity.details`, and `activity.state`.
3. **Persistence:** By using [setPresence](), the status will only last as long as the session and will naturally clear or time out based on your server's presence configuration.

**Note:** Ensure your Synapse `homeserver.yaml` has `presence: enabled: true`, as some high-traffic servers disable this to save resources. If it's disabled, the `setPresence` call will succeed but other users won't see the text.
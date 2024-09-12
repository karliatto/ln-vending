const path = require("path");
const express = require("express");
const ws = require("ws");
const http = require("http");

const { SerialPort } = require("serialport");

const MdbClient = require("./mdbClient");

const app = express();
const port = 3000;

const devicePath = "/dev/ttyAMA0";

const mdbPort = new SerialPort({
  path: devicePath,
  baudRate: 115200,
});

const mdbClient = new MdbClient(mdbPort);

app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);
const wss = new ws.Server({ noServer: true });

let externalWsClient;
const externalWebSocketUrl = "wss://bitcoincactus.com";
const reconnectInterval = 1000;

function connectToExternalWebSocket() {
  console.log("Connecting to external Websocket server");
  externalWsClient = new ws(externalWebSocketUrl);

  externalWsClient.on("open", () => {
    console.log("Connected to external WebSocket server");
  });

  externalWsClient.on("message", (data) => {
    console.log("Message from external server:", data);
    // Handle incoming messages from the external WebSocket server
  });

  externalWsClient.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  externalWsClient.on("close", () => {
    console.log("Disconnected from external WebSocket server");
    console.log("Attempting to reconnect ...");
    setTimeout(connectToExternalWebSocket, reconnectInterval);
  });
}

connectToExternalWebSocket();

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("error", console.error);

  ws.on("pong", function () {
    ws.isAlive = true;
    // TODO: Update the last seen time of the device.
  });

  ws.on("message", (message) => {
    console.log("message", message);
    try {
      const parsedMessage = JSON.parse(message);
      console.log("parsedMessage", parsedMessage);
      const { type, data } = parsedMessage;
      console.log("type", type);
      console.log("data", data);

      switch (type) {
        case "handShakeVending":
          console.log("Handshake with vending machine initiated.");
          mdbClient.handshake();
          break;
        case "startVendingCycle":
          console.log("Vending cycle started.");
          mdbClient.startVendingCycle();
          break;
        case "completeVendingCycle":
          console.log("Vending cycle completed.");
          console.log("Amount entered:", data.amount);
          mdbClient.completeVendingCycle(data.amount);
          break;
        case "cancelVendingCycle":
          console.log("Vending cycle canceled.");
          mdbClient.cancelVendingCycle();
          break;
        case "command":
          console.log("command");
          mdbClient.sendCommand(data.command);
          break;
        default:
          console.log("Unknown button clicked.");
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

// TODO: make this .env
// const pingInterval = 30 * 1000;
const pingInterval = 5 * 1000;
const intervals = {
  ping: setInterval(() => {
    // console.log("interval");
    // console.log("wss.client");
    wss.clients.forEach((ws) => {
      // console.log("client");
      // console.log("ws.isAlive", ws.isAlive);
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping(() => {}); // noop
    });
  }, pingInterval),
};

wss.once("close", function () {
  Object.values(intervals).forEach((interval) => {
    clearInterval(interval);
  });
});

// Upgrade the server to handle WebSocket connections
server.on("upgrade", (request, socket, head) => {
  console.log("A client has connected.");
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

app.get("/client", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.get("/debug", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "debug.html"));
});

server.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

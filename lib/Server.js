require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const ws = require("ws");

const { SerialPort } = require("serialport");

const { MdbClient } = require("./mdbClient");
const { createPaymentClient } = require("./paymentClient");

const app = express();
const port = Number(process.env.LN_VENDING_SERVER_PORT) || 3000;

const devicePath = process.env.LN_VENDING_DEVICE_PATH || "/dev/ttyAMA0";
console.log("devicePath", devicePath);

const mdbPort = new SerialPort({
  path: devicePath,
  baudRate: 115200,
});

const mdbClient = new MdbClient(mdbPort);

app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);
const wss = new ws.Server({ noServer: true });
let frontEndDevice;

wss.on("connection", (ws) => {
  frontEndDevice = { ws };
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
        case "command":
          console.log("command");
          mdbClient.sendCommand(data.command);
          break;
        default:
          console.log("Unknown message type coming from front-end.");
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

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.get("/debug", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "debug.html"));
});

server.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

mdbClient.on("mdb/debug", (debugEvent) => {
  console.log("debugEvent", debugEvent);
  if (!frontEndDevice || !frontEndDevice.ws) {
    console.error("There is no client connected");
    return;
  }
  if (debugEvent) {
    frontEndDevice.ws.send(
      JSON.stringify({
        type: "debug",
        data: debugEvent,
      })
    );
  }
});

mdbClient.on("mdb/statusVEND", (statusVendEvent) => {
  console.log("mdb/statusVEND");
  console.log("statusVendEvent", statusVendEvent);
  const { data } = statusVendEvent;
  if (!data) return;
  const { amount, itemNumber } = data;
  if (!amount || !itemNumber) return;
  function handlePaymentRequest({ lnurl, qrcode, msat, sat }) {
    console.log("Handling payment completion for LNURL:", lnurl);
    // Add your logic for what to do after payment is completed

    if (frontEndDevice && frontEndDevice.ws) {
      // TODO: once we get info form vending with item and amount we request to server for payment request.
      // The price is in fiat so the server needs to convert it to sats.
      frontEndDevice.ws.send(
        JSON.stringify({
          type: "statusVEND",
          data: {
            fiatAmount: amount,
            itemNumber,
            msat,
            sat,
            qrCodeBase64: qrcode,
          },
        })
      );
    } else {
      console.error(
        "There was an item request but there is no client connected."
      );
    }
  }

  const onPaymentCompleted = () => {
    if (frontEndDevice && frontEndDevice.ws) {
      // TODO: once we get info form vending with item and amount we request to server for payment request.
      // The price is in fiat so the server needs to convert it to sats.
      frontEndDevice.ws.send(
        JSON.stringify({
          type: "successVEND",
          data: {
            // item
          },
        })
      );
      console.log("calling completeVendingCycle in mdbClient");
      console.log("amount", amount);
      const completeRequestString = `C,VEND,${amount}`;
      console.log("completeRequestString", completeRequestString);
      mdbClient.sendCommand(completeRequestString);
    }
  };

  // Start the payment client when a payment request is created
  // TODO: cancel ws client when payment is completed. ???
  const paymentClient = createPaymentClient(
    amount,
    handlePaymentRequest,
    onPaymentCompleted
  );
});

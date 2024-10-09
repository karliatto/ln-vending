require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const ws = require("ws");
const BigNumber = require("bignumber.js");

const { SerialPort } = require("serialport");

const { MdbClient } = require("./mdbClient");
const { createPaymentClient } = require("./paymentClient");
const { log } = require("./logger");

const app = express();
const port = Number(process.env.LN_VENDING_SERVER_PORT) || 3000;

const devicePath = process.env.LN_VENDING_DEVICE_PATH || "/dev/ttyAMA0";
log.info("devicePath", devicePath);

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

  ws.on("pong", () => {
    ws.isAlive = true;
    // TODO: Update the last seen time of the device.
  });

  ws.on("message", (message) => {
    log.info("message", message);
    try {
      const parsedMessage = JSON.parse(message);
      log.info("parsedMessage", parsedMessage);
      const { type, data } = parsedMessage;
      log.info("type", type);
      log.info("data", data);

      switch (type) {
        case "command":
          log.info("command");
          mdbClient.sendCommand(data.command);
          break;
        default:
          log.info("Unknown message type coming from front-end.");
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  });

  ws.on("close", () => {
    log.info("Client disconnected");
  });
});

// TODO: make this .env
// const pingInterval = 30 * 1000;
const pingInterval = 5 * 1000;
const intervals = {
  ping: setInterval(() => {
    // log.info("interval");
    // log.info("wss.client");
    wss.clients.forEach((ws) => {
      // log.info("client");
      // log.info("ws.isAlive", ws.isAlive);
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
  log.info("A client has connected.");
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
  log.info(`Example app listening on port ${port}`);
});

mdbClient.on("mdb/debug", (debugEvent) => {
  log.info("debugEvent", debugEvent);
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
  log.info("mdb/statusVEND");
  log.info("statusVendEvent", statusVendEvent);
  const { data } = statusVendEvent;
  if (!data) return;
  const { amount, itemNumber } = data;
  if (!amount || !itemNumber) return;
  function handlePaymentRequest({ lnurl, qrcode, msat, sat }) {
    log.info("Handling payment completion for LNURL:", lnurl);

    const satDisplay = BigNumber(sat).toFormat();
    if (frontEndDevice && frontEndDevice.ws) {
      frontEndDevice.ws.send(
        JSON.stringify({
          type: "statusVEND",
          data: {
            fiatAmount: amount,
            itemNumber,
            msat,
            sat,
            satDisplay,
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
      frontEndDevice.ws.send(
        JSON.stringify({
          type: "successVEND",
          data: {
            // item
          },
        })
      );
      log.info("calling completeVendingCycle in mdbClient");
      log.info("amount", amount);
      const completeRequestString = `C,VEND,${amount}`;
      log.info("completeRequestString", completeRequestString);
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

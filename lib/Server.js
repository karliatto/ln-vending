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

const { createMachine, createActor } = require("xstate");

// Finite State Machine
const vendingMachine = createMachine(
  {
    id: "vending",
    initial: "idle",
    states: {
      idle: {
        entry: ["displayStart"],
        // This is when the display shows the "START" button.
        on: {
          "idle.start": {
            target: "instructions",
            actions: async () => {
              log.info("Display instructions to user and prepare VMC.");
              await mdbClient.enableCashlessPeripheral();
              log.info("After enabling cashless peripheral");
              await new Promise((resolve) => setTimeout(resolve, 5_000));
              await mdbClient.startVendingCycle();
              log.info("After starting vending cycle");
              frontEndDevice.ws.send(
                JSON.stringify({ type: "display-instructions" }),
              );
            },
          },
        },
      },
      instructions: {
        // Here we display instructions and wait for user to select item so
        // we receive some message like `c,STATUS,VEND,99.20,18` from vending.
        on: {
          "instructions.payment": {
            target: "payment",
            actions: (context) => {
              const paymentData = context.event.payload;
              log.info("Display payment request to user.");
              log.info("paymentData", paymentData);
              if (paymentData) {
                log.info("Received payment data:", paymentData);
                if (frontEndDevice && frontEndDevice.ws) {
                  frontEndDevice.ws.send(
                    JSON.stringify({
                      type: "display-payrequest",
                      data: paymentData,
                    }),
                  );
                } else {
                  log.error(
                    "There was an item request but there is no client connected.",
                  );
                }
              }
              return { paymentData: context.event.payload };
            },
          },
        },
      },
      payment: {
        // Here we display QR code for payment and wait for action server
        // to confirmed the payment and release the product.
        on: {
          "payment.timeout": {
            target: "instructions",
            actions: ["cancelPayment"],
          },
          "payment.cancel": {
            target: "instructions",
            actions: ["cancelPayment"],
          },
          "payment.success": {
            target: "success",
            actions: ["paymentSuccess"],
          },
        },
      },
      success: {
        entry: ["displaySuccess"],
        // On success we display success screen and release the product,
        // wait a while and get back to `instructions`.
        on: {
          "success.timeout": "instructions",
        },
      },
    },
  },
  {
    actions: {
      displayStart: () => {
        if (frontEndDevice && frontEndDevice.ws) {
          frontEndDevice.ws.send(
            JSON.stringify({
              type: "display-start",
              data: {},
            }),
          );
        }
      },
      displayInstructions: () => {
        if (frontEndDevice && frontEndDevice.ws) {
          frontEndDevice.ws.send(
            JSON.stringify({ type: "display-instructions" }),
          );
        }
      },
      paymentSuccess: async (context) => {
        const { amount } = context.event.payload;
        log.info(
          `Payment was successful for amount ${amount}, now release item.`,
        );
        if (frontEndDevice && frontEndDevice.ws) {
          frontEndDevice.ws.send(
            JSON.stringify({
              type: "display-success",
              data: {},
            }),
          );
          log.info("amount", amount);
          await mdbClient.completeVendingCycle(amount);
        }
      },
      displaySuccess: async () => {
        log.info("displaySuccess");
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        await mdbClient.disableCashlessPeripheral();
        await mdbClient.enableCashlessPeripheral();
        await mdbClient.startVendingCycle();
        log.info("After starting vending cycle");
        actor.send({ type: "success.timeout" });
        frontEndDevice.ws.send(
          JSON.stringify({ type: "display-instructions" }),
        );
      },
      cancelVendBeforePaymentRequest: async () => {
        log.info("Cancel cycle before requesting credit.");
        await mdbClient.cancelVendBeforePaymentRequest();
        await mdbClient.disableCashlessPeripheral();
        await mdbClient.enableCashlessPeripheral();
        await mdbClient.startVendingCycle();
        frontEndDevice.ws.send(
          JSON.stringify({ type: "display-instructions" }),
        );

      },
      cancelPayment: async () => {
        log.info("Cancel cycle after requesting credit.");
        await mdbClient.denyCreditRequest();
        await mdbClient.disableCashlessPeripheral();
        await mdbClient.enableCashlessPeripheral();
        await mdbClient.startVendingCycle();
        frontEndDevice.ws.send(
          JSON.stringify({ type: "display-instructions" }),
        );
      },
    },
  },
);

const actor = createActor(vendingMachine);

actor.subscribe(async (state) => {
  log.info("state.value changed", state.value);
});

actor.start();

wss.on("connection", (ws) => {
  frontEndDevice = { ws };
  ws.isAlive = true;
  ws.on("error", console.error);

  ws.on("pong", () => {
    ws.isAlive = true;
    // TODO: Update the last seen time of the device.
  });

  ws.on("message", (message) => {
    log.info("Message from UI:", message);
    try {
      const parsedMessage = JSON.parse(message);
      const { type, data } = parsedMessage;
      log.info("type", type);
      log.info("data", data);

      switch (type) {
        case "command":
          log.info("command");
          mdbClient.sendCommand(data.command);
          break;
        case "ui-action":
          log.info("ui-action", data);
          const { action } = data;
          if (action === "startButton") {
            actor.send({ type: "idle.start" });
          } else if (action === "cancelPaymentRequest") {
            actor.send({ type: "payment.cancel" });
          }
          break;
        default:
          log.info("Unknown message type coming from front-end.");
      }
    } catch (error) {
      log.error("Error parsing message:", error);
    }
  });

  ws.on("close", () => {
    log.info("Client disconnected");
  });
});

const pingInterval = 5 * 1000;
const intervals = {
  ping: setInterval(() => {
    wss.clients.forEach((ws) => {
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
      }),
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
  // TODO: this is hacky but for some reason when using CZK the VMC gives us 18.99 instead of 1899 CZK
  // below we have to back use 18.99 so the VMC gets the expected amount
  const fiatAmount = Math.round(amount * 100);
  console.log("fiatAmount", fiatAmount);
  function handlePaymentRequest({ lnurl, qrcode, msat, sat }) {
    log.info("Handling payment completion for LNURL:", lnurl);
    const satDisplay = BigNumber(sat).toFormat();
    actor.send({
      type: "instructions.payment",
      payload: {
        fiatAmount,
        itemNumber,
        msat,
        sat,
        satDisplay,
        qrCodeBase64: qrcode,
      },
    });
  }

  const onPaymentCompleted = () => {
    log.info("Payment successfully completed, releasing product");
    actor.send({
      type: "payment.success",
      // TODO: this is hacky but since the VMC gives us values like 18.99 instead of 1899 CZK
      // we have to transform it back when confirming it to the VMC so it receives the amount it is expecting.
      payload: { amount: fiatAmount / 100 },
    });
  };

  // Start the payment client when a payment request is created
  const paymentClient = createPaymentClient(
    fiatAmount,
    handlePaymentRequest,
    onPaymentCompleted,
  );
});

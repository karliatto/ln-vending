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

const { createMachine, createActor, assign } = require("xstate");

// Finite State Machine
const vendingMachine = createMachine({
  id: "vending",
  initial: "idle",
  states: {
    idle: {
      // This is when the display shows the "START" button.
      on: {
        START: {
          target: "instructions",
          actions: async () => {
            log.info("instructions in actor subscriber.");
            await mdbClient.enableCashlessPeripheral();
            log.info('After enabling cashless peripheral');
            await mdbClient.startVendingCycle();
            log.info('Afgter starting vending cycle');
            frontEndDevice.ws.send(JSON.stringify({ type: "display-instructions" }));      
          }
        },
      },
    },
    instructions: {
      // Here we display instructions and wait for user to select item so
      // we receive some message like `c,STATUS,VEND,99.20,18` from vending.
      on: {
        PAYMENT: {
          target: "payment",
          actions: (context, event) => {
            const paymentData = context.event.payload;
            // log.info("paymentData", paymentData);
            if (paymentData) {
              // log.info("Received payment data:", paymentData);
              if (frontEndDevice && frontEndDevice.ws) {
                frontEndDevice.ws.send(
                  JSON.stringify({
                    type: "display-payrequest",
                    data: paymentData,
                  }),
                );
              } else {
                console.error(
                  "There was an item request but there is no client connected.",
                );
              }
            }
            return { paymentData: context.event.payload };
          }
        },
        TIME_OUT: "idle",
      },
    },
    payment: {
      // Here we display QR code for payment and wait for action server
      // to confirmed the payment and release the product.
      on: {
        TIME_OUT: "idle",
        CANCELED: "idle",
        SUCCESS:  {
          target: "success",
          actions: ['paymentSuccess'],
        },
      },
    },
    success: {
      entry: ['displaySuccess'],
      // On success we display success screen and release the product,
      // wait a while and get back to `idle`.
      on: {
        SUCCESS_TIMEOUT: "idle",
      },
    },
  },
},
{
  actions: {
    paymentSuccess: async (context) => {
      log.info('actions in success USIN ACTIONS NEW');
      const { amount } = context.event.payload;
      if (frontEndDevice && frontEndDevice.ws) {
        frontEndDevice.ws.send(
          JSON.stringify({
            type: "display-success",
            data: {},
          }),
        );
        log.info("calling completeVendingCycle in mdbClient");
        log.info("amount", amount);
        const completeRequestString = `C,VEND,${amount}`;
        log.info("completeRequestString", completeRequestString);
        
        // TODO: probably use .cmd() with a expected response here as well,
        // await for it and then chewck if the cycle has to be completed and then 
        // refresh the page.
        // mdbClient.sendCommand(completeRequestString);
        await mdbClient.completeVendingCycle(amount);
        actor.send({ type: "success" });
      }
    },
    displaySuccess: async (context) => {
      log.info('displaySuccess');
      await new Promise(resolve =>
        setTimeout(resolve, 5_000)
      );
      await mdbClient.disableCashlessPeripheral();
      actor.send({ type: "SUCCESS_TIMEOUT" });
      frontEndDevice.ws.send(JSON.stringify({ type: "display-start" }));
    },
    
  }
});

const actor = createActor(vendingMachine);

actor.subscribe(async (state) => {
  // log.info("state", state);
  log.info("state.value", state.value);
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
        case "ui-action":
          log.info("ui-action", data);
          const { action } = data;
          if (action === "startButton") {
            actor.send({ type: "START" });
          } else if (action === "cancelPaymentRequest") {
            actor.send({ type: "CANCELED" });
          }
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
  function handlePaymentRequest({ lnurl, qrcode, msat, sat }) {
    log.info("Handling payment completion for LNURL:", lnurl);
    const satDisplay = BigNumber(sat).toFormat();
    actor.send({
      type: "PAYMENT",
      payload: {
        fiatAmount: amount,
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
    actor.send({ type: "SUCCESS", payload: { amount } });
  };

  // Start the payment client when a payment request is created
  // TODO: cancel ws client when payment is completed. ???
  const paymentClient = createPaymentClient(
    amount,
    handlePaymentRequest,
    onPaymentCompleted,
  );
});

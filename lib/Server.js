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
            console.log("instructions in actor subscriber.");
            await mdbClient.enableCashlessPeripheral();
            console.log('After enabling cashless peripheral');
            await mdbClient.startVendingCycle();
            console.log('Afgter starting vending cycle');
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
            console.log('context', context);
            const paymentData = context.event.payload;
            console.log("paymentData", paymentData);
            if (paymentData) {
              console.log("Received payment data:", paymentData);
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
          actions: (context) => {
            console.log('actions in success');
            console.log('context', context);
            const { amount } = context.event.payload;
            if (frontEndDevice && frontEndDevice.ws) {
              frontEndDevice.ws.send(
                JSON.stringify({
                  type: "display-success",
                  data: {},
                }),
              );
              console.log("calling completeVendingCycle in mdbClient");
              console.log("amount", amount);
              const completeRequestString = `C,VEND,${amount}`;
              console.log("completeRequestString", completeRequestString);
              mdbClient.sendCommand(completeRequestString);
            }
          }
        }
      },
    },
    success: {
      // On success we display success screen and release the product,
      // wait a while and get back to `idle`.
      on: {
        TIME_OUT: "idle",
      },
    },
  },
});

const actor = createActor(vendingMachine);

actor.subscribe(async (state) => {
  // console.log("state", state);
  console.log("state.value", state.value);

  switch (state.value) {
    case "instructions":
      // console.log("instructions in actor subscriber.");
      // await mdbClient.enableCashlessPeripheral();
      // console.log('After enabling cashless peripheral');
      // await mdbClient.startVendingCycle();
      // console.log('Afgter starting vending cycle');
      // frontEndDevice.ws.send(JSON.stringify({ type: "display-instructions" }));
      // break;
    case "payment":
      // Access the payment data from the context
      // const paymentData = state.context.paymentData;
      // console.log("paymentData", paymentData);
      // if (paymentData) {
      //   console.log("Received payment data:", paymentData);
      //   if (frontEndDevice && frontEndDevice.ws) {
      //     frontEndDevice.ws.send(
      //       JSON.stringify({
      //         type: "display-payrequest",
      //         data: paymentData,
      //       }),
      //     );
      //   } else {
      //     console.error(
      //       "There was an item request but there is no client connected.",
      //     );
      //   }
      // }
      // break;
    case "success":
      // if (frontEndDevice && frontEndDevice.ws) {
      //   frontEndDevice.ws.send(
      //     JSON.stringify({
      //       type: "display-success",
      //       data: {},
      //     }),
      //   );
      //   console.log("calling completeVendingCycle in mdbClient");
      //   console.log("amount", amount);
      //   const completeRequestString = `C,VEND,${amount}`;
      //   console.log("completeRequestString", completeRequestString);
      //   mdbClient.sendCommand(completeRequestString);
      // }
    default:
      log.error("Unknown state value.");
  }
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
        case "ui-action":
          console.log("ui-action", data);
          const { action } = data;
          if (action === "startButton") {
            actor.send({ type: "START" });
          } else if (action === "cancelPaymentRequest") {
            actor.send({ type: "CANCELED" });
          }
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
      }),
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
    console.log("Payment successfully completed, releasing product");
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

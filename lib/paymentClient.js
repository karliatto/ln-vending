const WebSocket = require("ws");
const QRCode = require("qrcode");

const { log } = require("./logger");

function createPaymentClient(fiatAmount, onPaymentRequest, onPaymentCompleted) {
  const serverUrl =
    process.env.LN_VENDING_ACTION_SERVER_URL || "https://bitcoincactus.com";
  // TODO: fix it.
  // if (!serverUrl || serverUrl === "") {
  //   throw new Error("Missing LN_VENDING_ACTION_SERVER_URL env variable.");
  // }
  const ws = new WebSocket(serverUrl);

  ws.on("open", () => {
    log.info("Connected to the server");
    log.info("Real fiatAmount:", fiatAmount);
    const testingFiatAmount = process.env.LN_VENDING_TEST_FAKE_FIAT_AMOUNT;
    console.log("testingFiatAmount");
    log.info("Testing fiatAmount", testingFiatAmount);
    ws.send(
      JSON.stringify({
        type: "pay-for-action-request",
        data: {
          // fiatAmount: testingFiatAmount ? testingFiatAmount : fiatAmount
          fiatAmount: 0.01,
          fiatCurrency: "CZK",
        },
      }),
    );
  });

  ws.on("message", (data) => {
    const response = JSON.parse(data);
    log.info("response from payment server", response);

    // Check if the response is of type "lnurl"
    if (response.type === "payment-request") {
      const { lnurl, sat, msat } = response.data;
      log.info("lnurl", lnurl);
      log.info("sat", sat);
      log.info("msat", msat);
      return QRCode.toDataURL(lnurl, { errorCorrectionLevel: "H" }).then(
        (qrcode) => {
          // Return the QR code as a Base64 image
          onPaymentRequest({ lnurl, qrcode, sat, msat }); // Call the callback function
          // Close the WebSocket connection, when payment is done.
          //   ws.close();
        },
      );
    } else if (response.type === "action") {
      // The payment was success.
      onPaymentCompleted();
    }
  });

  ws.on("error", (error) => {
    log.error("WebSocket error:", error);
  });

  ws.on("close", () => {
    log.info("Disconnected from the payment for action server");
  });

  return ws; // Return the WebSocket instance if needed
}

module.exports = { createPaymentClient };

const WebSocket = require("ws");
const QRCode = require("qrcode");

function createPaymentClient(fiatAmount, onPaymentRequest, onPaymentCompleted) {
  const serverUrl =
    "wss://bbc1-2a00-11b1-100c-6d61-a727-3a77-37bf-a495.ngrok-free.app";
  const ws = new WebSocket(serverUrl);

  ws.on("open", () => {
    console.log("Connected to the server");

    ws.send(
      JSON.stringify({
        type: "pay-for-action-request",
        data: {
          fiatAmount,
          fiatCurrency: "EUR",
        },
      })
    );
  });

  ws.on("message", (data) => {
    const response = JSON.parse(data);
    console.log("response", response);

    // Check if the response is of type "lnurl"
    if (response.type === "payment-request") {
      const { lnurl, sat, msat } = response.data;
      console.log("lnurl", lnurl);
      console.log("sat", sat);
      console.log("msat", msat);
      return QRCode.toDataURL(lnurl, { errorCorrectionLevel: "H" }).then(
        (qrcode) => {
          // Return the QR code as a Base64 image
          onPaymentRequest({ lnurl, qrcode, sat, msat }); // Call the callback function
          // Close the WebSocket connection, when payment is done.
          //   ws.close();
        }
      );
    } else if (response.type === "action") {
      // The payment was success.
      onPaymentCompleted();
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  ws.on("close", () => {
    console.log("Disconnected from the server");
  });

  return ws; // Return the WebSocket instance if needed
}

module.exports = { createPaymentClient };

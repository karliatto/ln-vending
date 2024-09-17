const ws = new WebSocket("ws://" + window.location.host);

let itWasOnceConnected = false;

ws.onerror = (error) => {
  console.error(error);
};

ws.onopen = () => {
  appendMessage("Connected to WebSocket server");
  if (!itWasOnceConnected) {
    itWasOnceConnected = true;
    setScreenInstructions();
  }
};

ws.onmessage = (event) => {
  appendMessage("Message from server: " + event.data);
  const { data } = event;
  try {
    const parsedData = JSON.parse(data);
    if (parsedData.type === "statusVEND") {
      const { fiatAmount, itemNumber, qrCodeBase64, sat, msat } =
        parsedData.data;
      console.log("fiatAmount", fiatAmount);
      console.log("itemNumber", itemNumber);
      console.log("sat", sat);
      console.log("msat", msat);
      setScreenPaymentRequest(qrCodeBase64, fiatAmount, sat, itemNumber);
    } else if (parsedData.type === "successVEND") {
      console.log("success!!");
      setScreenSuccess();
      // After some time clear success screen and go to initial screen.
      setTimeout(() => {
        initializeUi();
        // TODO: make it a config.
      }, 10 * 1000);
    } else if (parsedData.type === "debug") {
      appendMessage(parsedData.data);
    }
  } catch (error) {
    console.error(error);
  }
};

ws.onclose = () => {
  appendMessage("Disconnected from WebSocket server");
};

const requestInitializeVendCycle = () => {
  ws.send(
    JSON.stringify({
      type: "command",
      data: { command: "C,START,0" },
    })
  );
};

const appendMessage = (message) => {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message";
  messageDiv.textContent = message;
  output.appendChild(messageDiv);
};

function insertQRCode(base64String, placeholderSelector) {
  const img = document.createElement("img");
  img.src = base64String;

  const qrCodePlaceholder = document.querySelector(placeholderSelector);

  qrCodePlaceholder.innerHTML = "";
  qrCodePlaceholder.appendChild(img);
}

function toggleVisibleClass(className, isVisible) {
  const element = document.querySelector(`.${className}`);
  if (element) {
    if (isVisible) {
      element.classList.add("visible");
    } else {
      element.classList.remove("visible");
    }
  }
}

const setScreenInstructions = () => {
  setTimeout(() => {
    requestInitializeVendCycle();
  }, 1000);
  document.getElementById("item-price-fiat").textContent = "-";
  document.getElementById("item-price-sat").textContent = "-";
  document.getElementById("item-model").textContent = "-";
  toggleVisibleClass("container-instructions", true);
  toggleVisibleClass("container-payment-request", false);
  toggleVisibleClass("container-success", false);
  toggleVisibleClass("container-connecting", false);
};

const setScreenPaymentRequest = (qrCodeBase64, fiatAmount, sat, itemNumber) => {
  document.getElementById("item-price-fiat").textContent = fiatAmount;
  document.getElementById("item-price-sat").textContent = sat;
  document.getElementById("item-model").textContent = itemNumber;
  insertQRCode(qrCodeBase64, ".qr-code");

  toggleVisibleClass("container-payment-request", true);
  toggleVisibleClass("container-instructions", false);
  toggleVisibleClass("container-success", false);
  toggleVisibleClass("container-connecting", false);
};

const setScreenSuccess = () => {
  toggleVisibleClass("container-success", true);
  toggleVisibleClass("container-instructions", false);
  toggleVisibleClass("container-payment-request", false);
  toggleVisibleClass("container-connecting", false);
};

const setScreenConnecting = () => {
  toggleVisibleClass("container-connecting", true);
  toggleVisibleClass("container-success", false);
  toggleVisibleClass("container-instructions", false);
  toggleVisibleClass("container-payment-request", false);
};

setScreenConnecting();

const buttons = document.querySelectorAll("button");
buttons.forEach((button) => {
  button.addEventListener("click", (event) => {
    switch (event.target.id) {
      case "cancelPaymentRequest":
        console.log("cancelPaymentRequest");
        ws.send(
          JSON.stringify({
            type: "command",
            data: { command: "C,STOP" },
          })
        );
        setScreenInstructions();
        break;
      case "cancelCommand":
        console.log("cancelCommand");
        ws.send(
          JSON.stringify({
            type: "command",
            data: { command: "C,STOP" },
          })
        );
        break;
      case "disableCommand":
        console.log("disableCommand");
        ws.send(
          JSON.stringify({
            type: "command",
            data: { command: "C,0" },
          })
        );
        break;
      case "enablePeripheralCommand":
        console.log("enablePeripheralCommand");
        ws.send(
          JSON.stringify({
            type: "command",
            data: { command: "C,1" },
          })
        );
        break;
      case "startCommand":
        console.log("startCommand");
        ws.send(
          JSON.stringify({
            type: "command",
            data: { command: "C,START,0" },
          })
        );
        break;
      case "command":
        const command = document.getElementById("commandValue").value;
        console.log("Sending command", command);
        ws.send(
          JSON.stringify({
            type: "command",
            data: { command },
          })
        );
        break;
      default:
        console.log("Unknown button clicked.");
    }
  });
});

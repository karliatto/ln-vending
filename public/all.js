const ws = new WebSocket("ws://" + window.location.host);

let itWasOnceConnected = false;
let currentScreen;

const SCREENS = {
  START: "start",
  INSTRUCTIONS: "instructions",
  PAYMENT_REQUEST: "payment-request",
  SUCCESS: "success",
  CONNECTING: "connecting",
};

const classNames = Object.values(SCREENS).map(
  (screenName) => `container-${screenName}`,
);

ws.onerror = (error) => {
  console.error(error);
};

ws.onopen = () => {
  appendMessage("Connected to WebSocket server");
  if (!itWasOnceConnected) {
    itWasOnceConnected = true;
    setScreenStart();
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
        setScreenStart();
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
    }),
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

const setVisibleClass = (visibleClassName) => {
  classNames.forEach((className) => {
    toggleVisibleClass(className, className === visibleClassName);
  });
};

const setCurrentScreen = (newScreen) => {
  currentScreen = newScreen;
  console.log("Changed screen to:", currentScreen);
};

const setScreenStart = () => {
  setCurrentScreen(SCREENS.START);
  setVisibleClass("container-start");
};

const setScreenInstructions = () => {
  setCurrentScreen(SCREENS.INSTRUCTIONS);
  document.getElementById("item-price-fiat").textContent = "-";
  document.getElementById("item-price-sat").textContent = "-";
  document.getElementById("item-model").textContent = "-";
  setVisibleClass("container-instructions");
};

const setScreenPaymentRequest = (qrCodeBase64, fiatAmount, sat, itemNumber) => {
  setCurrentScreen(SCREENS.PAYMENT_REQUEST);
  document.getElementById("item-price-fiat").textContent = fiatAmount;
  document.getElementById("item-price-sat").textContent = sat;
  document.getElementById("item-model").textContent = itemNumber;
  insertQRCode(qrCodeBase64, ".qr-code");

  setVisibleClass("container-payment-request");
};

const setScreenSuccess = () => {
  setCurrentScreen(SCREENS.SUCCESS);
  setVisibleClass("container-success");
};

const setScreenConnecting = () => {
  setCurrentScreen(SCREENS.CONNECTING);
  setVisibleClass("container-connecting");
};

setScreenConnecting();

const buttons = document.querySelectorAll("button");
buttons.forEach((button) => {
  button.addEventListener("click", (event) => {
    console.log("event.target.id", event.target.id);
    switch (event.target.id) {
      case "startButton":
        ws.send(
          JSON.stringify({
            type: "command",
            data: { command: "C,START,0" },
          }),
        );
        setScreenInstructions();
        break;
      case "cancelPaymentRequest":
        console.log("cancelPaymentRequest");
        ws.send(
          JSON.stringify({
            type: "command",
            data: { command: "C,STOP" },
          }),
        );
        setScreenStart();
        break;
      case "cancelCommand":
        console.log("cancelCommand");
        ws.send(
          JSON.stringify({
            type: "command",
            data: { command: "C,STOP" },
          }),
        );
        break;
      case "disableCommand":
        console.log("disableCommand");
        ws.send(
          JSON.stringify({
            type: "command",
            data: { command: "C,0" },
          }),
        );
        break;
      case "enablePeripheralCommand":
        console.log("enablePeripheralCommand");
        ws.send(
          JSON.stringify({
            type: "command",
            data: { command: "C,1" },
          }),
        );
        break;
      case "startCommand":
        console.log("startCommand");
        ws.send(
          JSON.stringify({
            type: "command",
            data: { command: "C,START,0" },
          }),
        );
        break;
      case "command":
        const command = document.getElementById("commandValue").value;
        console.log("Sending command", command);
        ws.send(
          JSON.stringify({
            type: "command",
            data: { command },
          }),
        );
        break;
      default:
        console.log("Unknown button clicked.");
    }
  });
});

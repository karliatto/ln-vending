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

const initializeUi = () => {
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

initializeUi();

const ws = new WebSocket("ws://" + window.location.host);

ws.onerror = (error) => {
  console.error(error);
};

ws.onopen = () => {
  console.log("open");
  console.log("Connected to WebSocket server");
};

ws.onmessage = (event) => {
  console.log("event", event);
  console.log("Message from server: " + event.data);
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
    }
  } catch (error) {
    console.error(error);
  }
};

ws.onclose = () => {
  console.log("Disconnected from WebSocket server");
  clearTimeout(pingTimeout);
};

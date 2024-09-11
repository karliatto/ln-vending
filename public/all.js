function addVisibleClass(className) {
  const element = document.querySelector(`.${className}`);
  if (element) {
    element.classList.add("visible");
  }
}

function removeVisibleClass(className) {
  const element = document.querySelector(`.${className}`);
  if (element) {
    element.classList.remove("visible");
  }
}

addVisibleClass("container-instructions");

const appendMessage = (message) => {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message";
  messageDiv.textContent = message;
  output.appendChild(messageDiv);
};

let pingTimeout;

const ws = new WebSocket("ws://" + window.location.host);

// `heartbeat` checks if connection is alive, otherwise it terminates it.
const heartbeat = () => {
  clearTimeout(pingTimeout);

  // Use `WebSocket#terminate()`, which immediately destroys the connection,
  // instead of `WebSocket#close()`, which waits for the close timer.
  // Delay should be equal to the interval at which your server
  // sends out pings plus a conservative assumption of the latency.
  pingTimeout = setTimeout(() => {
    // ws.terminate();
  }, 30 * 1000);
};

ws.onerror = (error) => {
  console.error(error);
};

ws.onopen = () => {
  console.log("open");
  heartbeat();
  appendMessage("Connected to WebSocket server");
};

ws.on("ping", () => {
  console.log("ping!!!!");
  heartbeat();
});

ws.onmessage = (event) => {
  console.log("event", event);
  appendMessage("Message from server: " + event.data);
  //   const { data } = event;
  //   try {
  //     const parsedData = JSON.parse(data);
  //     if (parsedData.type === "lnurl") {
  //       const qrCodeContainer = document.getElementById("qrCodeContainer");
  //       qrCodeContainer.innerHTML = ""; // Clear previous QR code.
  //       const qrCodeElement = createQR(parsedData.data.lnurl);
  //       // Append the QR code to the selected element
  //       qrCodeContainer.appendChild(qrCodeElement);
  //     }
  //   } catch (error) {
  //     console.error(error);
  //   }
};

ws.onclose = () => {
  appendMessage("Disconnected from WebSocket server");
  clearTimeout(pingTimeout);
};

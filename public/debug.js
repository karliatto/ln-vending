console.log("We are debugging.");

const appendMessage = (message) => {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message";
  messageDiv.textContent = message;
  output.appendChild(messageDiv);
};

const ws = new WebSocket("ws://" + window.location.host);

ws.onerror = (error) => {
  console.error(error);
};

ws.onopen = () => {
  console.log("open");
  appendMessage("Connected to WebSocket server");
};

ws.onmessage = (event) => {
  console.log("event", event);
  appendMessage("Message from server: " + event.data);
};

ws.onclose = () => {
  appendMessage("Disconnected from WebSocket server");
  clearTimeout(pingTimeout);
};

const buttons = document.querySelectorAll("button");

buttons.forEach((button) => {
  button.addEventListener("click", (event) => {
    console.log(`Button clicked: ${event.target.id}`);

    switch (event.target.id) {
      case "handShakeVending":
        console.log("Handshake with vending machine initiated.");
        ws.send(JSON.stringify({ type: "handShakeVending" }));
        break;
      case "startVendingCycle":
        console.log("Vending cycle started.");
        ws.send(JSON.stringify({ type: "startVendingCycle" }));
        break;
      case "completeVendingCycle":
        console.log("Vending cycle completed.");
        const amount = document.getElementById("inputValue").value;
        const numericAmount = parseFloat(amount);

        console.log("Amount entered:", numericAmount);
        ws.send(
          JSON.stringify({
            type: "completeVendingCycle",
            data: { amount: numericAmount },
          })
        );
        break;
      case "cancelVendingCycle":
        console.log("Vending cycle canceled.");
        ws.send(JSON.stringify({ type: "cancelVendingCycle" }));
        break;
      case "command":
        console.log("command");
        const command = document.getElementById("commandValue").value;

        console.log("command entered:", command);

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

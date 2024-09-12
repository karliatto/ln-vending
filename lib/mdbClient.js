const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

// https://docs.qibixx.com/mdb-products/api-cashless-slave
const MDB_SEND_METHODS = {
  // Enable the cashless peripheral
  CLIENT_ENABLE: "C,1", // WE SHOULD RECEIVE "c,1" - Notice the small case when receiving!
  // Disable the cashless peripheral
  CLIENT_DISABLE: "C,0",
  // Start a session (Vending Cycle).
  CLIENT_START_VENDING_CYCLE: "C,START,0", // Start a session with 0 amount.
  // Approve a vending request / Give Credit.
  CLIENT_APPROVE_VENDING_REQUEST: "C,VEND,<amount>",
  // An Inactive Vend Session means that it was initiated by the Peripheral
  // (only occurs in Idle/Authorization First mode) but was not followed up by the VMC,
  // meaning that the credit was still not requested from the Cashless Peripheral.
  CLIENT_STOP_INACTIVE_SESSION: "C,STOP",
  // An active vend session means that the Credit has already been requested by the Master,
  // but not confirmed by the peripheral.
  CLIENT_STOP_ACTIVE_SESSION: "C,VEND,-1 ",
  // Some vending machines, allow connected Cashless Devices to send display requests to them, in response to polling.
  CLIENT_DISPLAY_MESSAGE: "C,DISPLAY,<message (max 32 characters)>",
};

const MDB_RECEIVED_METHODS = {
  VEND_CLIENT_ENABLE_RESPONSE: "c,1",
  VEND_CLIENT_START_VENDING_CYCLE_RESPONSE: "c,STATUS,IDLE,0",
  // Finished Successful Vending Cycle.
  VEND_CLIENT_APPROVE_VENDING_RESPONSE: "c,VEND,SUCCESS",
  VEND_ACK: "r,ACK",
  // Device has started the session and is waiting for VMC request (therefore it's idle).
  VEND_IDLE: "c,STATUS,IDLE",
  // The device is enabled and a vend cycle can now be started.
  VEND_ENABLED: "c,STATUS,ENABLED",
};

class MdbClient {
  parser;
  port;
  options;
  // TODO: make this an option.
  timeoutDuration = 60 * 1000;
  constructor(port, options) {
    console.log("port instanceof SerialPort", port instanceof SerialPort);
    // Check if port is a number
    if (!(port instanceof SerialPort)) {
      throw new TypeError("Expected port to be instance of SerialPort");
    }

    this.port = port;
    this.options = options;
    this.parser = port.pipe(new ReadlineParser());
    this.parser.on("data", (data) => {
      console.log("data form parser", data);
    });

    this.port.on("open", () => {
      console.log("Serial Port Opened");
    });

    this.port.on("error", (err) => {
      console.error(`Error: ${err.message}`);
    });

    this.port.open((err) => {
      if (err) {
        return console.log("Error opening port: ", err.message);
      }
      console.log("Port Opened !!!");
    });
  }

  cmd(method, methodResponse) {
    return new Promise((resolve, reject) => {
      const handleCompletion = (error, result) => {
        console.log("Operation completed");
        console.log("Error:", error);
        console.log("Result:", result);
        clearTimeout(timeout);
        this.parser.removeListener("data", handleData);
        if (error) return reject(error);
        resolve(result);
      };
      const timeout = setTimeout(() => {
        handleCompletion(
          new Error("Timed-out while waiting for MDB response.")
        );
      }, this.timeoutDuration);
      const handleData = (data) => {
        console.log("data in cmd:", data);
        console.log("methodResponse we expect:", methodResponse);
        // TODO: checkout what message are we getting and do something.
        // If the data we get is the response of the sent method we make it done.
        if (data === methodResponse) {
          handleCompletion(null, data);
        }
      };
      this.parser.on("data", handleData);
      console.log("Sending over MDB", method);
      this.port.write(method, (err) => {
        if (err) {
          console.error(`Error on write: ${err.message}`);
          clearTimeout(timeout);
          this.parser.removeListener("data", handleData);
          return reject(err);
        }
        console.log(`Sent: ${method}`);
      });
    });
  }

  async handshake() {
    console.log("calling handshake in mdbClient");
    const handshakeResponse = await this.cmd(
      MDB_SEND_METHODS.CLIENT_ENABLE,
      MDB_RECEIVED_METHODS.VEND_CLIENT_ENABLE_RESPONSE
    );
    console.log("handshakeResponse", handshakeResponse);
    return handshakeResponse;
  }

  async startVendingCycle() {
    console.log("calling startVendingCycle in mdbClient");
    const startVendingCycleResponse = await this.cmd(
      MDB_SEND_METHODS.CLIENT_START_VENDING_CYCLE,
      MDB_RECEIVED_METHODS.VEND_CLIENT_START_VENDING_CYCLE_RESPONSE
    );
    console.log("startVendingCycleResponse", startVendingCycleResponse);
    return startVendingCycleResponse;
  }

  async completeVendingCycle(amount) {
    console.log("calling completeVendingCycle in mdbClient");
    console.log("amount", amount);
    const completeRequestString =
      MDB_SEND_METHODS.CLIENT_APPROVE_VENDING_REQUEST.replace(
        "<amount>",
        `${amount}`
      );
    console.log("completeRequestString", completeRequestString);
    const completeVendingCycleResponse = await this.cmd(
      completeRequestString,
      MDB_RECEIVED_METHODS.VEND_CLIENT_APPROVE_VENDING_RESPONSE
    );
    console.log("completeVendingCycleResponse", completeVendingCycleResponse);
    return completeVendingCycleResponse;
  }

  async cancelVendingCycle() {
    console.log("calling cancelVendingCycle in mdbClient");
    // TODO: not sure what is the response for this method ???
    const cancelVendingCycleResponse = await this.cmd(
      MDB_SEND_METHODS.CLIENT_STOP_ACTIVE_SESSION,
      "TODO"
    );
    console.log("cancelVendingCycleResponse", cancelVendingCycleResponse);
    return cancelVendingCycleResponse;
  }
}

module.exports = MdbClient;

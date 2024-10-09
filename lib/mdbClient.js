const { EventEmitter } = require("events");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

const { mdbParser } = require("./eventParser");
const { log } = require("./logger");

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
  VEND_CLIENT_DISABLE_RESPONSE: "c,0",
  VEND_CLIENT_START_VENDING_CYCLE_RESPONSE: "c,STATUS,IDLE,0",
  // Finished Successful Vending Cycle.
  VEND_CLIENT_APPROVE_VENDING_RESPONSE: "c,VEND,SUCCESS",
  VEND_ACK: "r,ACK",
  // Device has started the session and is waiting for VMC request (therefore it's idle).
  VEND_IDLE: "c,STATUS,IDLE",
  // The device is enabled and a vend cycle can now be started.
  VEND_ENABLED: "c,STATUS,ENABLED",
};

class MdbClient extends EventEmitter {
  parser;
  port;
  options;
  // TODO: make this an option.
  timeoutDuration = 60 * 1000;
  constructor(port, options) {
    super();
    if (!(port instanceof SerialPort)) {
      throw new TypeError("Expected port to be instance of SerialPort");
    }
    this.port = port;
    this.options = options;
    this.parser = port.pipe(new ReadlineParser());
    this.parser.on("data", (message) => {
      log.info("message form vending", message);
      this.onMessageReceived(message);
    });

    this.port.on("open", () => {
      log.info("Serial Port Opened");
      this.initializeVending();
    });

    this.port.on("error", (err) => {
      log.error(`Error: ${err.message}`);
    });

    this.port.open((err) => {
      if (err) {
        return log.info("Error opening port: ", err.message);
      }
      log.info("Port Opened !!!");
    });
  }

  onMessageReceived(message) {
    this.emit("mdb/debug", message);
    const mdbEvent = mdbParser(message);
    if (mdbEvent && mdbEvent.type === "statusVEND") {
      log.info("emitting statusVEND");
      this.emit("mdb/statusVEND", mdbEvent);
    }
  }

  cmd(method, methodResponse) {
    return new Promise((resolve, reject) => {
      const handleCompletion = (error, result) => {
        log.info("Operation completed");
        log.info("Error:", error);
        log.info("Result:", result);
        clearTimeout(timeout);
        this.parser.removeListener("data", handleData);
        if (error) log.info("error", error);
        // if (error) return reject(error);
        resolve(result);
      };
      const timeout = setTimeout(() => {
        // handleCompletion(
        //   new Error("Timed-out while waiting for MDB response.")
        // );
        handleCompletion("Timed-out while waiting for MDB response.");
      }, this.timeoutDuration);
      const handleData = (data) => {
        log.info(`data in cmd: "${data}" waiting for "${methodResponse}"`);
        // TODO: checkout what message are we getting and do something.
        // If the data we get is the response of the sent method we make it done.
        if (data === methodResponse) {
          handleCompletion(null, data);
        }
      };
      this.parser.on("data", handleData);
      log.info("Sending over MDB", method);
      this.port.write(method + "\n", (err) => {
        if (err) {
          log.error(`Error on write: ${err.message}`);
          clearTimeout(timeout);
          this.parser.removeListener("data", handleData);
          if (error) log.info("error", error);
          // return reject(err);
        }
        log.info(`Sent: ${method}`);
      });
    });
  }

  sendCommand(command) {
    log.info(`Sending: "${command}"`);
    this.port.write(command + "\n", (err) => {
      if (err) {
        log.error(`Error on write: ${err.message}`);
      }
      log.info(`Sent: "${command}"`);
    });
  }

  initializeVending() {
    log.info("Initializing cashless peripheral sending `C,0` and `C,1`");
    // We send commands C,0 and C,1 when serial port is connected.
    // TODO: ideally we would use this.cmd but still not sure what the machine is returning
    // in different states so not sure how to guarantee th call was success. Needs more experimentation.
    this.sendCommand("C,0");
    setTimeout(() => {
      this.sendCommand("C,1");
    }, 2 * 1000);
  }

  async handshake() {
    log.info("calling handshake in mdbClient");
    const disableResponse = await this.cmd(
      MDB_SEND_METHODS.CLIENT_DISABLE,
      MDB_RECEIVED_METHODS.VEND_CLIENT_DISABLE_RESPONSE
    );
    log.info("disableResponse", disableResponse);
    const enableResponse = await this.cmd(
      MDB_SEND_METHODS.CLIENT_ENABLE,
      MDB_RECEIVED_METHODS.VEND_CLIENT_ENABLE_RESPONSE
    );
    log.info("enableResponse", enableResponse);
    return enableResponse;
  }

  async startVendingCycle() {
    log.info("calling startVendingCycle in mdbClient");
    const startVendingCycleResponse = await this.cmd(
      MDB_SEND_METHODS.CLIENT_START_VENDING_CYCLE,
      MDB_RECEIVED_METHODS.VEND_CLIENT_START_VENDING_CYCLE_RESPONSE
    );
    log.info("startVendingCycleResponse", startVendingCycleResponse);
    return startVendingCycleResponse;
  }

  async completeVendingCycle(amount) {
    log.info("calling completeVendingCycle in mdbClient");
    log.info("amount", amount);
    const completeRequestString =
      MDB_SEND_METHODS.CLIENT_APPROVE_VENDING_REQUEST.replace(
        "<amount>",
        `${amount}`
      );
    log.info("completeRequestString", completeRequestString);
    const completeVendingCycleResponse = await this.cmd(
      completeRequestString,
      MDB_RECEIVED_METHODS.VEND_CLIENT_APPROVE_VENDING_RESPONSE
    );
    log.info("completeVendingCycleResponse", completeVendingCycleResponse);
    return completeVendingCycleResponse;
  }

  async cancelVendingCycle() {
    log.info("calling cancelVendingCycle in mdbClient");
    // TODO: not sure what is the response for this method ???
    const cancelVendingCycleResponse = await this.cmd(
      MDB_SEND_METHODS.CLIENT_STOP_ACTIVE_SESSION,
      "TODO"
    );
    log.info("cancelVendingCycleResponse", cancelVendingCycleResponse);
    return cancelVendingCycleResponse;
  }
}

module.exports = { MdbClient };

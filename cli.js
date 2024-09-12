const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const readline = require("readline");
const { program } = require("commander");

program
  .command("connect")
  .option(
    "--devicePath <value>",
    "File path of USB device",
    (value) => value,
    "/dev/ttyAMA0"
  )
  .option(
    "--baudRate <value>",
    "The baud rate used for serial communication with USB device",
    (value) => value,
    115200
  )
  .action((options) => {
    console.log("options", options);
    const port = new SerialPort({
      path: options.devicePath,
      baudRate: 115200,
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: "\r\n" }));

    port.on("open", () => {
      console.log("Serial Port Opened");

      const writeData = (data) => {
        port.write(data + "\n", (err) => {
          if (err) {
            return console.error(`Error on write: ${err.message}`);
          }
          console.log(`Sent: ${data}`);
        });
      };

      const promptPrefix = "> ";
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: promptPrefix,
        terminal: true,
      });

      rl.on("line", (line) => {
        console.log("Sending message to Port", line);
        writeData(line);
      });

      process.stdout.write(promptPrefix);
    });

    parser.on("data", (data) => {
      console.log(`Received: ${data}`);
    });

    port.on("error", (err) => {
      console.error(`Error: ${err.message}`);
    });

    port.open(function (err) {
      if (err) {
        return console.log("Error opening port: ", err.message);
      }
      console.log("Port Opened !!!");
    });
  });

program.parse(process.argv);

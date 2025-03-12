const { log } = require("./logger");

const eventParser = (input) => {
  const trimmedInput = input.trim();

  // Define regex patterns for different event types
  const patterns = {
    ack: /^r,ACK$/,
    status:
      /^c,STATUS,(?<statusType>INACTIVE|DISABLED|ENABLED|IDLE)(,(?<additionalInfo>\d+))?$/,
    vend: /^c,VEND,(?<vendStatus>SUCCESS)$/,
    statusVEND: /^c,STATUS,VEND,(?<amount>\d+\.\d+),(?<itemNumber>\d+)$/, // Pattern for c,STATUS,VEND,amount,itemNumber
    start: /^C,START,(?<startValue>\d+)$/,
  };

  // Check each pattern and return the corresponding event type and data
  for (const [type, pattern] of Object.entries(patterns)) {
    const match = trimmedInput.match(pattern);
    // log.info("match", match);
    if (match) {
      return {
        type,
        groups: match.groups || {},
      };
    }
  }

  return { type: "unknown", groups: {} }; // If no pattern matches
};

const mdbParser = (message) => {
  const event = eventParser(message);
  // log.info("event", event);
  if (event.type === "statusVEND") {
    return {
      type: event.type,
      data: {
        amount: event.groups.amount,
        itemNumber: event.groups.itemNumber,
      },
    };
  }
};

module.exports = { mdbParser };

const { debug } = require("debug");

const log = {
  error: debug("ln-vending:error"),
  info: debug("ln-vending:info"),
};

module.exports = { log };

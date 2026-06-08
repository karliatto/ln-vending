const QRCode = require("qrcode");

const { log } = require("./logger");

const POLL_INTERVAL_MS = 3000;

async function createInvoice(satsAmount, onPaymentRequest, onPaymentCompleted) {
  const baseUrl = process.env.LNBITS_URL?.trim().replace(/\/+$/, "");
  const invoiceKey = process.env.LNBITS_INVOICE_KEY?.trim();

  if (!baseUrl || !invoiceKey) {
    throw new Error("Missing LNBITS_URL or LNBITS_INVOICE_KEY env variables.");
  }

  const response = await fetch(`${baseUrl}/api/v1/payments`, {
    method: "POST",
    headers: {
      "X-Api-Key": invoiceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      out: false,
      amount: satsAmount,
      memo: "Vending machine payment",
    }),
  });

  if (!response.ok) {
    throw new Error(
      `LNbits create invoice failed: ${response.status} ${await response.text()}`,
    );
  }

  const { payment_request, checking_id } = await response.json();
  log.info("LNbits invoice created, checking_id:", checking_id);

  const qrcode = await QRCode.toDataURL(payment_request, {
    errorCorrectionLevel: "H",
  });

  onPaymentRequest({
    lnurl: payment_request,
    qrcode,
    sat: satsAmount,
    msat: satsAmount * 1000,
  });

  const pollTimer = setInterval(async () => {
    try {
      const statusRes = await fetch(
        `${baseUrl}/api/v1/payments/${checking_id}`,
        {
          headers: { "X-Api-Key": invoiceKey },
        },
      );

      if (!statusRes.ok) {
        log.error("LNbits payment status check failed:", statusRes.status);
        return;
      }

      const { paid } = await statusRes.json();
      if (paid) {
        clearInterval(pollTimer);
        log.info("LNbits payment confirmed for checking_id:", checking_id);
        onPaymentCompleted();
      }
    } catch (err) {
      log.error("LNbits polling error:", err);
    }
  }, POLL_INTERVAL_MS);

  return { checking_id, stopPolling: () => clearInterval(pollTimer) };
}

module.exports = { createInvoice };

import crypto from "crypto";
import express from "express";
import { logger } from "../utils/logger.js";

const router = express.Router();

function parseSignatureHeader(signatureHeader) {
  if (!signatureHeader || typeof signatureHeader !== "string") {
    return null;
  }

  const trimmed = signatureHeader.trim();
  if (!trimmed) return null;

  if (!trimmed.includes("=")) {
    return {
      algorithm: null,
      value: trimmed,
    };
  }

  const [algorithmPart, ...rest] = trimmed.split("=");
  const value = rest.join("=").trim();
  const algorithm = String(algorithmPart || "")
    .trim()
    .toLowerCase();

  if (!value) return null;

  if (algorithm === "sha1" || algorithm === "sha256") {
    return {
      algorithm,
      value,
    };
  }

  // Unknown prefix; keep only the signature value and try common algorithms.
  return {
    algorithm: null,
    value,
  };
}

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  if (!left.length || !right.length || left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function isValidPagarmeSignature(rawBody, signatureHeader, secret) {
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return false;

  const algorithms = parsed.algorithm ? [parsed.algorithm] : ["sha256", "sha1"];

  for (const algorithm of algorithms) {
    const expected = crypto
      .createHmac(algorithm, secret)
      .update(rawBody)
      .digest("hex");

    if (timingSafeEqualHex(parsed.value, expected)) {
      return true;
    }
  }

  return false;
}

router.post(
  "/api/webhooks/pagarme",
  express.raw({ type: "application/json", limit: "2mb" }),
  async (req, res) => {
    try {
      const signature =
        req.headers["x-hub-signature"] ||
        req.headers["x-pagarme-signature"] ||
        null;

      if (!signature) {
        return res.status(400).json({ error: "Missing signature" });
      }

      if (!Buffer.isBuffer(req.body)) {
        return res.status(400).json({ error: "Invalid raw body" });
      }

      const secret = String(
        process.env.PAGARME_WEBHOOK_SECRET ||
          process.env.PAGARME_SECRET_KEY ||
          "",
      ).trim();

      if (!secret) {
        logger.error(
          { route: "pagarme_webhook" },
          "[relay] PAGARME_WEBHOOK_SECRET/PAGARME_SECRET_KEY não configurada",
        );
        return res.status(500).json({ error: "Webhook secret not configured" });
      }

      if (!isValidPagarmeSignature(req.body, String(signature), secret)) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      const parsedBody = JSON.parse(req.body.toString("utf8"));

      logger.info(
        {
          route: "pagarme_webhook",
          receivedAt: new Date().toISOString(),
          eventType: parsedBody?.type || parsedBody?.event || null,
          hookId: parsedBody?.id || parsedBody?.hook_id || null,
        },
        "[relay] Webhook da Pagar.me recebido",
      );

      return res.sendStatus(200);
    } catch (err) {
      logger.error(
        { route: "pagarme_webhook", error: err?.message || err },
        "[relay] Erro ao processar webhook da Pagar.me",
      );
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  },
);

export default router;

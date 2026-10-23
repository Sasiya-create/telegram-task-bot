const crypto = require("crypto");

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        ok: false,
        error: "METHOD_NOT_ALLOWED",
      }),
    };
  }

  try {
    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
      throw new Error("BOT_TOKEN_MISSING");
    }

    const body = JSON.parse(event.body || "{}");
    const initData = body.initData;

    if (!initData || typeof initData !== "string") {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "INIT_DATA_MISSING",
        }),
      };
    }

    const params = new URLSearchParams(initData);
    const receivedHash = params.get("hash");

    if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "HASH_MISSING_OR_INVALID",
        }),
      };
    }

    // Remove only the hash field.
    params.delete("hash");

    // Sort fields and build Telegram's data-check string.
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    // Telegram Web App HMAC verification.
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    const received = Buffer.from(receivedHash, "hex");
    const calculated = Buffer.from(calculatedHash, "hex");

    if (
      received.length !== calculated.length ||
      !crypto.timingSafeEqual(received, calculated)
    ) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "HASH_MISMATCH",
        }),
      };
    }

    // Reject old authentication data.
    const authDate = Number(params.get("auth_date"));
    const now = Math.floor(Date.now() / 1000);

    if (
      !Number.isFinite(authDate) ||
      authDate <= 0 ||
      now - authDate > 3600 ||
      authDate > now + 30
    ) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "AUTH_DATE_INVALID_OR_EXPIRED",
        }),
      };
    }

    const userValue = params.get("user");

    if (!userValue) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "TELEGRAM_USER_MISSING",
        }),
      };
    }

    const user = JSON.parse(userValue);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        user,
      }),
    };
  } catch (error) {
    console.error("Telegram verification error:", error.message);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error:
          error.message === "BOT_TOKEN_MISSING"
            ? "BOT_TOKEN_MISSING"
            : "SERVER_ERROR",
      }),
    };
  }
};

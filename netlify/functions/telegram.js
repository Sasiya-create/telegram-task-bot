
const crypto = require("crypto");

function reply(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function verifyTelegramInitData(initData, botToken) {
  if (typeof initData !== "string" || !initData) {
    return { ok: false, reason: "INIT_DATA_MISSING" };
  }

  if (!botToken) {
    return { ok: false, reason: "BOT_TOKEN_MISSING" };
  }

  try {
    const params = new URLSearchParams(initData);
    const receivedHash = params.get("hash");

    if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
      return { ok: false, reason: "HASH_MISSING_OR_INVALID" };
    }

    params.delete("hash");
    params.delete("signature");

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest();

    const receivedBuffer = Buffer.from(receivedHash, "hex");

    if (
      receivedBuffer.length !== calculatedHash.length ||
      !crypto.timingSafeEqual(receivedBuffer, calculatedHash)
    ) {
      return { ok: false, reason: "HASH_MISMATCH" };
    }

    const authDate = Number(params.get("auth_date"));
    const now = Math.floor(Date.now() / 1000);

    if (!Number.isSafeInteger(authDate) || authDate <= 0) {
      return { ok: false, reason: "AUTH_DATE_INVALID" };
    }

    if (now - authDate > 3600 || authDate > now + 60) {
      return { ok: false, reason: "AUTH_DATA_EXPIRED_OR_FUTURE" };
    }

    const user = JSON.parse(params.get("user") || "null");

    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) {
      return { ok: false, reason: "USER_DATA_INVALID" };
    }

    return { ok: true, user };
  } catch {
    return { ok: false, reason: "INIT_DATA_PARSE_ERROR" };
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return reply(405, {
      ok: false,
      error: "POST required"
    });
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, {
      ok: false,
      error: "Invalid JSON"
    });
  }

  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    return reply(500, {
      ok: false,
      error: "Server configuration incomplete",
      code: "BOT_TOKEN_MISSING"
    });
  }

  const verification = verifyTelegramInitData(
    body.initData,
    botToken
  );

  if (!verification.ok) {
    const statusCode =
      verification.reason === "INIT_DATA_MISSING" ? 400 : 401;

    return reply(statusCode, {
      ok: false,
      error: "Telegram verification failed",
      code: verification.reason
    });
  }

  const user = verification.user;

  return reply(200, {
    ok: true,
    user: {
      id: user.id,
      first_name: user.first_name || "",
      username: user.username || ""
    }
  });
};

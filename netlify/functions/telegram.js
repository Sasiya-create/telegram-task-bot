
const crypto = require("crypto");

function reply(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function verifyTelegramInitData(initData, botToken) {
  if (
    typeof initData !== "string" ||
    !initData ||
    !botToken
  ) {
    return null;
  }

  try {
    const params = new URLSearchParams(initData);
    const receivedHash = params.get("hash");

    if (
      !receivedHash ||
      !/^[a-f0-9]{64}$/i.test(receivedHash)
    ) {
      return null;
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

    const receivedBuffer = Buffer.from(
      receivedHash,
      "hex"
    );

    if (
      receivedBuffer.length !== calculatedHash.length ||
      !crypto.timingSafeEqual(
        receivedBuffer,
        calculatedHash
      )
    ) {
      return null;
    }

    const authDate = Number(params.get("auth_date"));
    const now = Math.floor(Date.now() / 1000);

    if (
      !Number.isSafeInteger(authDate) ||
      authDate <= 0 ||
      now - authDate > 3600 ||
      authDate > now + 60
    ) {
      return null;
    }

    const user = JSON.parse(
      params.get("user") || "null"
    );

    if (
      !user ||
      !Number.isSafeInteger(user.id) ||
      user.id <= 0
    ) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return reply(405, {
      ok: false,
      error: "POST required",
    });
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, {
      ok: false,
      error: "Invalid JSON",
    });
  }

  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    return reply(500, {
      ok: false,
      error: "Server configuration incomplete",
    });
  }

  const user = verifyTelegramInitData(
    body.initData,
    botToken
  );

  if (!user) {
    return reply(401, {
      ok: false,
      error: "Telegram verification failed",
    });
  }

  return reply(200, {
    ok: true,
    user: {
      id: user.id,
      first_name: user.first_name || "",
      username: user.username || "",
    },
  });
};

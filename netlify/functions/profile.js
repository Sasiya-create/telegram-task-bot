
const crypto = require("crypto");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(statusCode, data) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(data),
  };
}

function verifyTelegram(initData, botToken) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");

  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new Error("INVALID_TELEGRAM_HASH");
  }

  params.delete("hash");

  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secret)
    .update(checkString)
    .digest("hex");

  const received = Buffer.from(receivedHash, "hex");
  const calculated = Buffer.from(calculatedHash, "hex");

  if (
    received.length !== calculated.length ||
    !crypto.timingSafeEqual(received, calculated)
  ) {
    throw new Error("INVALID_TELEGRAM_HASH");
  }

  const authDate = Number(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);

  if (
    !Number.isFinite(authDate) ||
    authDate <= 0 ||
    now - authDate > 3600 ||
    authDate > now + 30
  ) {
    throw new Error("TELEGRAM_AUTH_EXPIRED");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new Error("TELEGRAM_USER_MISSING");

  const user = JSON.parse(rawUser);

  if (!Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new Error("INVALID_TELEGRAM_USER");
  }

  return user;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return response(405, {
      ok: false,
      error: "METHOD_NOT_ALLOWED",
    });
  }

  try {
    const botToken = process.env.BOT_TOKEN;
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!botToken || !supabaseUrl || !serviceKey) {
      console.error("Missing required server environment variables");
      return response(500, {
        ok: false,
        error: "SERVER_CONFIGURATION_ERROR",
      });
    }

    let body;

    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return response(400, { ok: false, error: "INVALID_JSON" });
    }

    if (typeof body.initData !== "string" || !body.initData) {
      return response(400, { ok: false, error: "INIT_DATA_REQUIRED" });
    }

    let user;

    try {
      user = verifyTelegram(body.initData, botToken);
    } catch (error) {
      return response(401, {
        ok: false,
        error: error.message,
      });
    }

    const usdtAddress =
      typeof body.usdt_address === "string"
        ? body.usdt_address.trim()
        : "";

    const binancePayId =
      typeof body.binance_pay_id === "string"
        ? body.binance_pay_id.trim()
        : "";

    if (usdtAddress.length > 100 || binancePayId.length > 100) {
      return response(400, {
        ok: false,
        error: "FIELD_TOO_LONG",
      });
    }

    // Check the BEP20 address format if supplied.
    if (
      usdtAddress &&
      !/^0x[a-fA-F0-9]{40}$/.test(usdtAddress)
    ) {
      return response(400, {
        ok: false,
        error: "INVALID_BEP20_ADDRESS",
      });
    }

    const baseUrl = supabaseUrl.replace(/\/+$/, "");

    // Update only the authenticated Telegram user's row.
    const updateResult = await fetch(
      `${baseUrl}/rest/v1/users?telegram_id=eq.${user.id}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          usdt_address: usdtAddress || null,
          binance_pay_id: binancePayId || null,
        }),
      }
    );

    if (!updateResult.ok) {
      console.error("Profile update failed:", updateResult.status);
      return response(500, {
        ok: false,
        error: "PROFILE_SAVE_FAILED",
      });
    }

    const rows = await updateResult.json();

    if (!rows.length) {
      return response(404, {
        ok: false,
        error: "USER_NOT_REGISTERED",
        message: "Please initialize your TaskFlow profile first.",
      });
    }

    return response(200, {
      ok: true,
      message: "PROFILE_SAVED",
      profile: {
        usdt_address: rows[0].usdt_address,
        binance_pay_id: rows[0].binance_pay_id,
      },
    });
  } catch (error) {
    console.error("Profile API error:", error.message);

    return response(500, {
      ok: false,
      error: "SERVER_ERROR",
    });
  }
};

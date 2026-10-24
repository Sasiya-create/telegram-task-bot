
const crypto = require("crypto");

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode, data) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(data),
  };
}

function verifyInitData(initData, botToken) {
  if (typeof initData !== "string" || !initData) {
    throw new Error("INIT_DATA_MISSING");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    throw new Error("INVALID_HASH");
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

  const calculated = crypto
    .createHmac("sha256", secret)
    .update(checkString)
    .digest("hex");

  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(calculated, "hex");

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("HASH_MISMATCH");
  }

  const authDate = Number(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);

  if (
    !Number.isFinite(authDate) ||
    authDate <= 0 ||
    now - authDate > 3600 ||
    authDate > now + 30
  ) {
    throw new Error("AUTH_DATA_EXPIRED");
  }

  const userText = params.get("user");
  if (!userText) throw new Error("TELEGRAM_USER_MISSING");

  const user = JSON.parse(userText);

  if (!user.id || !Number.isSafeInteger(Number(user.id))) {
    throw new Error("INVALID_TELEGRAM_USER");
  }

  return user;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const botToken = process.env.BOT_TOKEN;
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!botToken || !supabaseUrl || !serviceKey) {
      console.error("Wallet environment variables are missing.");
      return json(500, { ok: false, error: "SERVER_CONFIG_ERROR" });
    }

    const body = JSON.parse(event.body || "{}");
    const user = verifyInitData(body.initData, botToken);
    const telegramId = String(user.id);

    const baseUrl = supabaseUrl.replace(/\/+$/, "");

    const response = await fetch(
      `${baseUrl}/rest/v1/rpc/get_wallet_balance`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          p_telegram_id: telegramId,
        }),
      }
    );

    if (!response.ok) {
      console.error("Wallet balance query failed:", response.status);
      return json(502, { ok: false, error: "BALANCE_QUERY_FAILED" });
    }

    const balance = await response.json();
    const amount = Number(balance);

    if (!Number.isFinite(amount)) {
      return json(502, { ok: false, error: "INVALID_BALANCE" });
    }

    return json(200, {
      ok: true,
      balance: Math.round((amount + Number.EPSILON) * 100) / 100,
      currency: "USD",
    });
  } catch (error) {
    const knownErrors = [
      "INIT_DATA_MISSING",
      "INVALID_HASH",
      "HASH_MISMATCH",
      "AUTH_DATA_EXPIRED",
      "TELEGRAM_USER_MISSING",
      "INVALID_TELEGRAM_USER",
    ];

    if (knownErrors.includes(error.message)) {
      return json(401, { ok: false, error: error.message });
    }

    console.error("Wallet function failed:", error.message);
    return json(400, { ok: false, error: "INVALID_REQUEST" });
  }
};

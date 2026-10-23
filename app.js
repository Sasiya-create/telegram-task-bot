
const tg = window.Telegram?.WebApp;

let verifiedTelegramUser = null;
let telegramVerificationStatus = "not_started";

async function verifyTelegramUser() {
  const greeting = document.getElementById("greeting");
  const username = document.getElementById("username");

  if (!tg) {
    telegramVerificationStatus = "unavailable";

    if (greeting) {
      greeting.textContent = "Please open this app in Telegram.";
    }

    if (username) {
      username.textContent = "Telegram required";
    }

    return;
  }

  tg.ready();
  tg.expand();

  if (greeting) {
    greeting.textContent = "Verifying your Telegram account...";
  }

  if (username) {
    username.textContent = "";
  }

  try {
    if (!tg.initData || !tg.initData.trim()) {
      throw new Error("INIT_DATA_MISSING (Telegram data unavailable)");
    }

    const response = await fetch("/.netlify/functions/telegram", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      cache: "no-store",
      body: JSON.stringify({
        initData: tg.initData
      })
    });

    let result;

    try {
      result = await response.json();
    } catch {
      throw new Error(
        "INVALID_SERVER_RESPONSE (HTTP " + response.status + ")"
      );
    }

    if (!response.ok || !result.ok || !result.user) {
      const errorCode =
        result.code ||
        result.error ||
        "UNKNOWN_VERIFICATION_ERROR";

      throw new Error(
        errorCode + " (HTTP " + response.status + ")"
      );
    }

    verifiedTelegramUser = result.user;
    telegramVerificationStatus = "verified";

    if (greeting) {
      greeting.textContent =
        "Hello, " + (result.user.first_name || "User") + "!";
    }

    if (username) {
      username.textContent = result.user.username
        ? "@" + result.user.username
        : result.user.first_name || "Telegram user";
    }

  } catch (error) {
    verifiedTelegramUser = null;
    telegramVerificationStatus = "failed";

    if (greeting) {
      greeting.textContent = "Unable to verify your account.";
    }

    if (username) {
      username.textContent =
        error.message || "Verification failed. Please try again.";
    }

    // Do not log initData, bot tokens, or other secrets.
    console.error("Telegram verification failed:", error.message);
  }
}

function showPage(page, button) {
  const allowedPages = [
    "home",
    "referral",
    "tasks",
    "addtask",
    "ads",
    "profile"
  ];

  if (!allowedPages.includes(page)) {
    return;
  }

  document.querySelectorAll(".panel").forEach(panel => {
    panel.classList.add("hidden");
  });

  const selected = document.getElementById(page);

  if (selected) {
    selected.classList.remove("hidden");
  }

  document.querySelectorAll(".nav-button").forEach(nav => {
    nav.classList.toggle(
      "active",
      nav.dataset.page === page
    );
  });

  if (button?.classList.contains("nav-button")) {
    button.classList.add("active");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

verifyTelegramUser();

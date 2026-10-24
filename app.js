const tg = window.Telegram?.WebApp;

let verifiedTelegramUser = null;
let telegramVerificationStatus = "not_started";
let walletBalance = null;

function setVerificationMessage(message, state = "") {
  const status = document.getElementById("verificationStatus");

  if (status) {
    status.textContent = message;
    status.className =
      "verification-status" + (state ? " " + state : "");
  }
}

function showWalletBalance(value) {
  const balanceElement = document.getElementById("balance");
  if (!balanceElement) return;

  if (value === null || !Number.isFinite(Number(value))) {
    balanceElement.textContent = "Unavailable";
    return;
  }

  walletBalance = Number(value);
  balanceElement.textContent = "$" + walletBalance.toFixed(2);
}

async function loadWalletBalance() {
  if (!verifiedTelegramUser || !tg?.initData) return;

  const balanceElement = document.getElementById("balance");

  if (balanceElement) {
    balanceElement.textContent = "Loading...";
  }

  try {
    const response = await fetch("/.netlify/functions/wallet", {
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
      throw new Error("INVALID_SERVER_RESPONSE");
    }

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "BALANCE_LOAD_FAILED");
    }

    const balance = Number(result.balance);

    if (!Number.isFinite(balance)) {
      throw new Error("INVALID_BALANCE");
    }

    showWalletBalance(balance);

  } catch (error) {
    showWalletBalance(null);
    console.error("Wallet balance load failed:", error.message);
  }
}

async function verifyTelegramUser() {
  const greeting = document.getElementById("greeting");
  const username = document.getElementById("username");

  if (!tg) {
    telegramVerificationStatus = "unavailable";

    if (greeting) greeting.textContent = "Open this app in Telegram.";
    if (username) username.textContent = "Telegram is required.";

    setVerificationMessage(
      "Telegram Web App data is unavailable. Open this app using your bot's Telegram App button.",
      "error"
    );

    return;
  }

  try {
    tg.ready();
    tg.expand();

    if (greeting) {
      greeting.textContent = "Verifying your Telegram account...";
    }

    if (username) {
      username.textContent = "Checking account...";
    }

    setVerificationMessage("Verifying Telegram account...");

    if (!tg.initData || !tg.initData.trim()) {
      throw new Error("INIT_DATA_MISSING");
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
      throw new Error("INVALID_SERVER_RESPONSE");
    }

    if (!response.ok || !result.ok || !result.user) {
      throw new Error(result.error || "TELEGRAM_VERIFICATION_FAILED");
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
        : (result.user.first_name || "Telegram user");
    }

    setVerificationMessage("Telegram account verified.", "success");

    await loadWalletBalance();

  } catch (error) {
    verifiedTelegramUser = null;
    telegramVerificationStatus = "failed";

    const message = error?.message || "Unknown verification error";

    if (greeting) {
      greeting.textContent = "Unable to verify your account.";
    }

    if (username) {
      username.textContent = message;
    }

    setVerificationMessage(
      "Verification failed: " + message,
      "error"
    );

    console.error("Telegram verification failed:", message);
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

  if (!allowedPages.includes(page)) return;

  document.querySelectorAll(".page").forEach(section => {
    section.classList.add("hidden");
  });

  const selectedPage = document.getElementById(page);

  if (selectedPage) {
    selectedPage.classList.remove("hidden");
  }

  const activePage = page === "addtask" ? "tasks" : page;

  document.querySelectorAll(".nav-button").forEach(nav => {
    nav.classList.toggle("active", nav.dataset.page === activePage);
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

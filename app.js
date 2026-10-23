
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();

  // Display Telegram user information only.
  // Server authentication must validate tg.initData.
  const user = tg.initDataUnsafe?.user;

  if (user) {
    const greeting = document.getElementById("greeting");
    const username = document.getElementById("username");

    if (greeting) {
      greeting.textContent =
        "Hello, " + (user.first_name || "User") + "!";
    }

    if (username) {
      username.textContent = user.username
        ? "@" + user.username
        : user.first_name || "Telegram user";
    }
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

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// server.js
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const qrcode = require("qrcode");

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const moment = require("moment-timezone");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const PHONE = "923262615475";
const TIMEZONE = "Asia/Karachi";

// Target: 17 September 00:00:00 (this year or next if already passed)
const TARGET_MONTH = 9; // September
const TARGET_DAY = 17;
const TARGET_HOUR = 0;
const TARGET_MINUTE = 0;
const TARGET_SECOND = 0;

// Emoji pool (modify as you like)
const EMOJIS = [
  "🎉",
  "🎂",
  "💖",
  "🎈",
  "🥳",
  "😍",
  "🌹",
  "✨",
  "🎁",
  "💐",
  "❤️",
  "💞",
  "💕",
  "💓",
  "💗",
  "💝",
  "💟",
  "❣️",
  "🤗",
  "😇",
  "😻",
  "🤍",
  "💛",
  "💙",
  "💚",
  "💜",
  "🌟",
  "🌈",
  "☀️",
  "🌸",
  "🌼",
  "🌻",
  "🌺",
  "🌷",
  "🍫",
  "🍭",
  "🍰",
  "🍩",
  "🍪",
  "🍦",
  "🍨",
  "🧁",
  "🥂",
  "🍹",
  "🍸",
  "🍷",
];

// whatsapp client
let latestQrDataUrl = null;
let clientReady = false;
const client = new Client({
  authStrategy: new LocalAuth({ clientId: "whatsapp-node-session" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", async (qr) => {
  try {
    latestQrDataUrl = await qrcode.toDataURL(qr);
    console.log("QR generated — visit /api/qr to view.");
  } catch (e) {
    console.error("QR gen error", e);
  }
});

client.on("ready", () => {
  clientReady = true;
  latestQrDataUrl = null;
  console.log("WhatsApp client ready. Starting countdown scheduler.");
  startCountdownScheduler(); // start when ready
});

client.on("auth_failure", (msg) => {
  console.error("Auth failure:", msg);
});

client.on("disconnected", (reason) => {
  clientReady = false;
  console.log("Client disconnected:", reason);
  // Optionally try reinitialize or notify
});

client.initialize();

// ----------------- Helper functions -----------------
function toChatId(number) {
  const phone = number.toString().replace(/\D/g, "");
  return `${phone}@c.us`;
}

function pickEmoji() {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

function buildTargetMoment() {
  const now = moment.tz(TIMEZONE);
  // build target for current year
  let target = moment.tz(
    {
      year: now.year(),
      month: TARGET_MONTH - 1, // month is 0-indexed
      day: TARGET_DAY,
      hour: TARGET_HOUR,
      minute: TARGET_MINUTE,
      second: TARGET_SECOND,
    },
    TIMEZONE
  );

  // if target already passed this year, use next year
  if (target.isSameOrBefore(now)) {
    target = target.add(1, "year");
  }
  return target;
}

async function sendWhatsAppMessage(text) {
  if (!clientReady) {
    console.warn("Client not ready — skipping send.");
    return { success: false, error: "client not ready" };
  }
  try {
    const chatId = toChatId(PHONE);
    const msg = await client.sendMessage(chatId, text);
    console.log("Sent:", text);
    return { success: true, id: msg.id._serialized };
  } catch (err) {
    console.error("Send error:", err);
    return { success: false, error: err.message || err.toString() };
  }
}

// ----------------- Countdown scheduler -----------------
let schedulerInterval = null;
let lastSentKey = null; // to avoid duplicate sends if desired

function startCountdownScheduler() {
  const target = buildTargetMoment();
  console.log("Countdown target:", target.format(), "Timezone:", TIMEZONE);

  // Send an immediate message at start if you want (optional)
  // runTick(); // uncomment to run immediate send
  runTick();
  schedulerInterval = setInterval(runTick, 5000);
  // run first tick immediately, then every minute
  let lastSentKey = null; // global variable to avoid duplicates

  function runTick() {
    const now = moment.tz(TIMEZONE);
    const diffMs = target.diff(now);

    if (diffMs <= 0) {
      const happyEmojis = Array.from({ length: 5 }, () => pickEmoji()).join(
        " "
      );
      const finalMsg = `🎊🎂 Happy Birthday! 🎂🎊\n\nWishing you the happiest birthday! ${happyEmojis}`;
      sendWhatsAppMessage(finalMsg);
      if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log("Target reached — scheduler stopped.");
      }
      return;
    }

    const duration = moment.duration(diffMs);
    const days = Math.floor(duration.asDays());
    const hours = duration.hours();
    const minutes = duration.minutes();
    const seconds = duration.seconds();

    // Build remaining string
    let remaining = "";
    if (days >= 1) {
      remaining = `${days} days ${hours} hrs ${minutes} mins`;
    } else if (hours >= 1) {
      remaining = `${hours} hrs ${minutes} mins`;
    } else {
      remaining = `${minutes} mins`; // last hour -> seconds skip
    }

    // Message templates
    const templates = [
      `Only ${remaining} left till your special day! ${pickEmoji()}`,
      `${pickEmoji()} Countdown: ${remaining} to go!`,
      `⏳ ${remaining} more… can't wait! ${pickEmoji()}`,
      `${pickEmoji()} Just ${remaining} left 🎂`,
      `Baby, ${remaining} left before the big moment 💖`,
      `⌛ ${remaining} left — I'm so excited ${pickEmoji()}`,
      `Every second brings me closer to you 🥰 ${remaining} left!`,
      `Can’t believe just ${remaining} left till my queen’s day 👑`,
      `${remaining} left… thinking of you every moment 💕`,
      `The wait is almost over! ${remaining} ${pickEmoji()}`,
    ];

    // ---------------------
    // Send logic
    // ---------------------
    let shouldSend = false;
    let sendKey = "";

    if (days > 0 || hours > 1) {
      // Normal period -> every 15 minutes only
      if (minutes % 15 === 0 && seconds === 0) {
        shouldSend = true;
        sendKey = `${days}-${hours}-${minutes}`;
      }
    } else if (hours === 1) {
      // Last hour -> every minute
      if (seconds === 0) {
        shouldSend = true;
        sendKey = `${minutes}`; // unique per minute
      }
    } else if (hours === 0) {
      // Final 59 mins -> every minute
      if (seconds === 0) {
        shouldSend = true;
        sendKey = `${minutes}`;
      }
    }

    if (shouldSend && sendKey !== lastSentKey) {
      lastSentKey = sendKey;

      let msgText = "";
      if (Math.random() < 0.7) {
        msgText = templates[Math.floor(Math.random() * templates.length)];
      } else {
        msgText = `${remaining} left ⏳ ${pickEmoji()}`;
      }

      sendWhatsAppMessage(msgText);
    }
  }
}

// ----------------- API endpoints (keep existing) -----------------

// QR endpoint for frontend
app.get("/api/qr", (req, res) => {
  if (clientReady)
    return res.json({ status: "ready", message: "Client authenticated" });
  if (!latestQrDataUrl)
    return res.json({
      status: "waiting",
      message: "Waiting for QR generation",
    });
  return res.json({ status: "qr", qr: latestQrDataUrl });
});

// Manual trigger endpoint (no body required) - useful for testing
app.post("/api/send-default", async (req, res) => {
  if (!clientReady)
    return res.status(400).json({ success: false, error: "Client not ready" });
  const phone = PHONE;
  const message = "hey"; // you can change
  try {
    const chatId = toChatId(phone);
    const msg = await client.sendMessage(chatId, message);
    return res.json({
      success: true,
      id: msg.id._serialized,
      to: phone,
      message,
    });
  } catch (err) {
    console.error("Send-default error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/check", (req, res) => {
  res.send("Hello World");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server listening on http://localhost:${PORT}`)
);


import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// ─── DuckDuckGo Image Search ─────────────────────────────────────────────────
async function searchImages(query, count = 5) {
  try {
    const tokenRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      { headers: { "User-Agent": "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36" } }
    );
    const html = await tokenRes.text();
    const match = html.match(/vqd=([\d-]+)/);
    if (!match) return [];

    const searchRes = await fetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&vqd=${match[1]}&f=,,,&p=1&v7exp=a`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://duckduckgo.com/",
        },
      }
    );
    const data = await searchRes.json();
    return (data.results || []).slice(0, count).map((r) => ({
      title: r.title,
      imageUrl: r.image,
      thumbnailUrl: r.thumbnail,
      sourceUrl: r.url,
    }));
  } catch {
    return [];
  }
}

// ─── DuckDuckGo Web Search ────────────────────────────────────────────────────
async function searchWeb(query) {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { "User-Agent": "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36" } }
    );
    const data = await res.json();
    const results = [];
    if (data.AbstractText) results.push(data.AbstractText);
    if (data.RelatedTopics) {
      data.RelatedTopics.slice(0, 3).forEach((t) => {
        if (t.Text) results.push(t.Text);
      });
    }
    return results.join("\n");
  } catch {
    return "";
  }
}

// ─── Intent Detection ─────────────────────────────────────────────────────────
function detectIntent(message) {
  const msg = message.toLowerCase();
  if (/(image|photo|pic|tasveer|photo dhund|photo do|image do|image search|dikha)/i.test(msg)) return "image";
  if (/(gana|song|lyrics|likho|likh|write.*song|gaana)/i.test(msg)) return "lyrics";
  if (/(search|google|dhundo|batao|kya hai|what is|who is|kaun|kab|kahan|why|how|explain)/i.test(msg)) return "search";
  return "chat";
}

// ─── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu ek super-smart, funny aur friendly AI assistant hai jiska naam Jarvis hai! 🤖✨

Tere rules:
1. 😄 HAMESHA emojis use kar — har response mein kam se kam 3-4 emojis ho
2. 🤣 Har response mein ek funny joke ya witty comment zaroor ho
3. 💬 Bilkul human jaisa baat kar — Hinglish (Hindi + English mix) mein
4. 📝 Detailed aur lambe jawab de — sirf 1-2 line nahi, poora explain kar
5. 🎵 Agar koi gana maange toh poori lyrics likho with proper verses and chorus
6. 🔍 Agar koi cheez search ki ho toh us information ko interesting tarike se present kar
7. 🖼️ Agar images mile hain toh unhe clearly mention kar aur links do
8. ❤️ Friendly, caring aur entertaining reh — jaise ek dost baat kar raha ho
9. 🧠 Smart answers do — bakoraas mat kar, real information de
10. 😂 Kabhi kabhi self-deprecating humor use kar

Example style: "Arre yaar! 😄 Kya sawaal poochha hai tune! 🤔✨ Dekh main batata hoon..."`;

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "active",
    message: "Jarvis AI Server is live 24/7! 🤖🔥",
    model: "gemini-1.5-flash",
    features: ["chat", "image-search", "web-search", "lyrics", "jokes"],
    timestamp: new Date().toISOString(),
  });
});

// Main AI chat endpoint
app.post("/chat", async (req, res) => {
  const message = req.body.message || req.body.text || req.body.prompt || "";

  if (!message) {
    return res.status(400).json({
      error: "Message do! 😅 Example: { \"message\": \"aapka sawaal\" }",
    });
  }

  try {
    const intent = detectIntent(message);
    let contextInfo = "";
    let images = [];

    if (intent === "image") {
      const query = message.replace(/(image|photo|pic|tasveer|photo dhund|photo do|image do|image search|dikha|mujhe|do|kar|dikh|please)/gi, "").trim();
      images = await searchImages(query || message, 5);
      if (images.length > 0) {
        contextInfo = `\nImage search results for "${query}":\n${images.map((img, i) => `${i + 1}. ${img.title} - ${img.imageUrl}`).join("\n")}`;
      }
    } else if (intent === "search") {
      const webInfo = await searchWeb(message);
      if (webInfo) {
        contextInfo = `\nWeb search results:\n${webInfo}`;
      }
    }

    const prompt = `${SYSTEM_PROMPT}

User ka message: "${message}"
Intent detected: ${intent}
${contextInfo ? `\nSearch se mili information (ise use karke jawab do):\n${contextInfo}` : ""}

${intent === "image" && images.length > 0 ? "Image links clearly mention karo aur user ko click karke dekhne bolo." : ""}
${intent === "lyrics" ? "Poori song lyrics likho with proper Hindi/Urdu/English verses, chorus, aur bridge. Creative aur catchy banao!" : ""}
${intent === "search" ? "Search results ko human-friendly tarike se explain karo with your own insights added." : ""}

Ab helpful, funny aur detailed jawab do:`;

    const result = await model.generateContent(prompt);
    const aiReply = result.response.text();

    const response = {
      status: "success",
      intent,
      message,
      reply: aiReply,
      timestamp: new Date().toISOString(),
    };

    if (images.length > 0) {
      response.images = images;
    }

    res.json(response);
  } catch (err) {
    console.error("AI Error:", err);
    res.status(500).json({
      error: "Kuch gadbad ho gayi! 😅 Try again karo.",
      details: err.message,
    });
  }
});

// Dedicated image search endpoint
app.get("/image-search", async (req, res) => {
  const query = req.query.q;
  const count = Math.min(parseInt(req.query.count) || 5, 20);

  if (!query) {
    return res.status(400).json({ error: "Query do! Example: /image-search?q=cats" });
  }

  try {
    const images = await searchImages(query, count);
    res.json({ query, total: images.length, images });
  } catch (err) {
    res.status(500).json({ error: "Image search failed", details: err.message });
  }
});

// Dedicated lyrics endpoint
app.post("/lyrics", async (req, res) => {
  const { song, style, language } = req.body;

  if (!song) {
    return res.status(400).json({ error: "Song topic do! Example: { \"song\": \"dosti ke baare mein\" }" });
  }

  try {
    const prompt = `${SYSTEM_PROMPT}

Ek beautiful, emotional aur catchy song likho "${song}" ke baare mein.
Style: ${style || "Bollywood/Hinglish"}
Language: ${language || "Hinglish (Hindi + English mix)"}

Poori structure likho:
- Title
- Verse 1
- Chorus  
- Verse 2
- Chorus
- Bridge
- Final Chorus

Creative, rhyming aur meaningful lyrics likho! Emojis bhi lagao! 🎵`;

    const result = await model.generateContent(prompt);
    res.json({
      status: "success",
      song,
      lyrics: result.response.text(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Lyrics generate nahi hue", details: err.message });
  }
});

// Joke endpoint
app.get("/joke", async (_req, res) => {
  try {
    const result = await model.generateContent(
      `${SYSTEM_PROMPT}\n\nEk super funny Hinglish joke sunao! Short, punchy aur original ho. Punchline strong ho! 😂`
    );
    res.json({
      status: "success",
      joke: result.response.text(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Joke generate nahi hua", details: err.message });
  }
});

// Keep-alive ping (prevents Railway sleep)
app.get("/ping", (_req, res) => {
  res.json({ pong: true, time: new Date().toISOString() });
});

// Self keep-alive — pings itself every 5 minutes so server never sleeps
setInterval(async () => {
  try {
    await fetch(`http://localhost:${PORT}/ping`);
    console.log("✅ Self ping — server is awake!");
  } catch {}
}, 5 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`🤖 Jarvis AI Server running on port ${PORT}`);
  console.log(`✅ Model: gemini-1.5-flash`);
  console.log(`🔥 Features: chat, image-search, lyrics, jokes, web-search`);
});

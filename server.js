const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const PORT = process.env.PORT || 3000;
const AI_NAME = process.env.AI_NAME || 'Gemini Pro';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY is not set!');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are ${AI_NAME}, an intelligent, friendly, witty, and helpful AI assistant.
Your name is ${AI_NAME}. Always be warm, supportive, and engaging in your responses.
You respond in the same language as the user. When asked your name, always say "${AI_NAME}".`;

function extractMessage(req) {
  const b = req.body || {};
  const q = req.query || {};
  const val = b.message ?? b.text ?? b.content ?? b.msg ?? b.query ?? b.input ??
              b.userMessage ?? b.user_message ??
              q.message ?? q.text ?? q.content ?? q.msg;
  return val !== undefined ? String(val) : undefined;
}

async function handleMessage(req, res) {
  const message = extractMessage(req);
  if (!message || message.trim() === '') {
    return res.status(400).json({
      status: 'error',
      error: 'Message required. Use field: message, text, content, msg, query, or input',
      received: Object.keys(req.body || {}),
    });
  }
  try {
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    });
    const result = await model.generateContent(message.trim());
    const reply = result.response.text();
    return res.json({
      status: 'success',
      type: 'text',
      sender: 'User',
      originalMessage: message,
      reply,
      response: reply,
      text: reply,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ status: 'error', error: err.message });
  }
}

app.get('/api/chat', (req, res) => {
  if (!extractMessage(req)) {
    return res.json({ status: 'ok', endpoint: '/api/chat', ai: AI_NAME });
  }
  return handleMessage(req, res);
});
app.post('/api/chat', handleMessage);
app.post('/api/jarvis/autoresponder', handleMessage);
app.get('/api/jarvis/autoresponder', handleMessage);
app.get('/health', (req, res) => res.json({ status: 'ok', ai: AI_NAME }));

app.listen(PORT, () => console.log(`${AI_NAME} server running on port ${PORT}`));

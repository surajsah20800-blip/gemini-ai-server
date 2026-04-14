const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const AI_NAME = process.env.AI_NAME || 'Gemini Pro';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY env var is not set!');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are ${AI_NAME}, an intelligent, friendly, witty, and helpful AI assistant.
Your name is ${AI_NAME}. Always be warm, supportive, and engaging in your responses.
You help users with a wide range of topics from general knowledge to creative tasks.
Keep responses natural, conversational, and helpful. When asked your name, always say "${AI_NAME}".`;

app.post('/api/jarvis/autoresponder', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ status: 'error', error: 'Message is required' });
    }
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      systemInstruction: SYSTEM_PROMPT,
    });
    const result = await model.generateContent(message);
    const reply = result.response.text();
    return res.json({
      status: 'success',
      type: 'text',
      sender: 'User',
      originalMessage: message,
      reply,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', ai: AI_NAME }));

app.listen(PORT, () => {
  console.log(`${AI_NAME} server running on port ${PORT}`);
});

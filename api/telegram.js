// api/telegram.js
import { Telegraf } from 'telegraf';
import fetch from 'node-fetch';
import { Client as NotionClient } from '@notionhq/client';

// ✅ Load environment variables
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const notion = new NotionClient({ auth: process.env.NOTION_TOKEN });
const NOTION_DB = process.env.NOTION_DATABASE_ID;

// Hugging Face inference endpoint for classification + transcription
const HF_API = 'https://api-inference.huggingface.co/models';
const HF_HEADERS = { Authorization: `Bearer ${process.env.HF_TOKEN}` };

// ---------- UTILS ----------
async function classifyText(text) {
  const res = await fetch(`${HF_API}/facebook/bart-large-mnli`, {
    method: 'POST',
    headers: HF_HEADERS,
    body: JSON.stringify({
      inputs: text,
      parameters: { candidate_labels: ['note', 'todo', 'reminder', 'journal', 'idea'] }
    })
  });
  const data = await res.json();
  return data?.labels?.[0] || 'note';
}

async function refineText(text) {
  const res = await fetch(`${HF_API}/facebook/bart-large-cnn`, {
    method: 'POST',
    headers: HF_HEADERS,
    body: JSON.stringify({ inputs: text })
  });
  const data = await res.json();
  return data?.[0]?.summary_text || text;
}

async function transcribeAudio(fileUrl) {
  const res = await fetch(`${HF_API}/openai/whisper-small`, {
    method: 'POST',
    headers: HF_HEADERS,
    body: JSON.stringify({ inputs: fileUrl })
  });
  const data = await res.json();
  return data?.text || '';
}

async function saveToNotion(category, content) {
  await notion.pages.create({
    parent: { database_id: NOTION_DB },
    properties: {
      Title: { title: [{ text: { content: content.slice(0, 50) } }] },
      Category: { select: { name: category } }
    },
    children: [
      { object: 'block', type: 'paragraph', paragraph: { text: [{ type: 'text', text: { content } }] } }
    ]
  });
}

// ---------- BOT HANDLERS ----------
bot.start((ctx) => ctx.reply('🚀 Bot is live! Send me a voice or text message.'));

bot.on('voice', async (ctx) => {
  try {
    const file = await ctx.telegram.getFile(ctx.message.voice.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;
    const rawText = await transcribeAudio(fileUrl);
    const refined = await refineText(rawText);
    const category = await classifyText(refined);
    await saveToNotion(category, refined);
    ctx.reply(`✅ ${category} saved to Notion!`);
  } catch (err) {
    console.error(err);
    ctx.reply('❌ Error processing voice note.');
  }
});

bot.on('text', async (ctx) => {
  try {
    const refined = await refineText(ctx.message.text);
    const category = await classifyText(refined);
    await saveToNotion(category, refined);
    ctx.reply(`✅ ${category} saved to Notion!`);
  } catch (err) {
    console.error(err);
    ctx.reply('❌ Error processing text.');
  }
});

// ---------- VERCEL HANDLER ----------
export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      return res.status(200).send('ok');
    }
    res.status(200).send('Bot running');
  } catch (err) {
    console.error('Bot error:', err);
    res.status(500).send('Error');
  }
}

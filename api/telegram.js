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

async function saveToNotion(content) {
  if (!content || content.trim() === '') {
    console.warn('No content to save to Notion.');
    return;
  }

  await notion.pages.create({
    parent: { database_id: process.env.NOTION_DATABASE_ID },
    properties: {
      Name: {
        title: [
          {
            text: { content: content.slice(0, 100) } // Truncate to 100 chars
          }
        ]
      }
    },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: { content }
            }
          ]
        }
      }
    ]
  });
}

// ---------- BOT HANDLERS ----------
bot.start((ctx) => ctx.reply('🚀 Bot is live! Send me a voice or text message.'));

bot.on('text', async (ctx) => {
  try {
    const message = ctx.message.text || '';
    await saveToNotion(message);
    await ctx.reply('Saved to Notion!');
  } catch (err) {
    console.error(err);
    await ctx.reply('Error saving to Notion.');
  }
});

bot.on('voice', async (ctx) => {
  await ctx.reply('Got your voice note! (Not saving to Notion)');
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

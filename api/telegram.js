// api/telegram.js
import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Simple command handler
bot.start((ctx) => ctx.reply('🚀 Bot is live! Send me a message.'));
bot.on('text', (ctx) => ctx.reply(`You said: ${ctx.message.text}`));

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      return res.status(200).send('ok');
    }
    res.status(200).send('Bot running');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
}


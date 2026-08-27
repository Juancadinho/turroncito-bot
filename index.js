require('dotenv').config();
const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const { handleMessage } = require('./ai');
const { buildMorningMessage } = require('./morningSummary');

const TIMEZONE = 'America/Santiago';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Comando /start: primer contacto para confirmar que el bot responde.
// De paso loguea el chat.id para poder configurarlo como TELEGRAM_CHAT_ID (resumen matutino).
bot.start((ctx) => {
  console.log(`[start] chat.id = ${ctx.chat.id}`);
  ctx.reply('Hola, soy Turrón. Sigo aquí contigo, acompañándote día a día, como siempre.');
});

// Cualquier mensaje de texto se procesa con la IA (Gemini + function calling sobre Calendar/ClickUp)
bot.on('text', async (ctx) => {
  try {
    const reply = await handleMessage(ctx.chat.id, ctx.message.text);
    ctx.reply(reply);
  } catch (err) {
    console.error('Error procesando mensaje con IA:', err);
    ctx.reply('Tuve un problema pensando la respuesta. Intenta de nuevo en un rato.');
  }
});

bot.launch();
console.log('Turrón bot corriendo...');

// Resumen matutino automático: todos los días a las 7:30 am (hora de Chile), sin que Juanca
// tenga que pedirlo. Requiere TELEGRAM_CHAT_ID en el .env (el chat.id que se loguea en /start).
if (process.env.TELEGRAM_CHAT_ID) {
  cron.schedule(
    '30 7 * * *',
    async () => {
      try {
        const msg = await buildMorningMessage();
        await bot.telegram.sendMessage(process.env.TELEGRAM_CHAT_ID, msg);
        console.log('[cron] Resumen matutino enviado');
      } catch (err) {
        console.error('[cron] Error generando/enviando el resumen matutino:', err);
      }
    },
    { timezone: TIMEZONE }
  );
  console.log('Resumen matutino programado (7:30 am, America/Santiago)');
} else {
  console.log('TELEGRAM_CHAT_ID no está seteado: el resumen matutino automático está desactivado.');
}

// Apagado limpio
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

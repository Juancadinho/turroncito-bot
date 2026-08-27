const fs = require('fs');
const { google } = require('googleapis');

const TIMEZONE = 'America/Santiago';

function getAuthClient() {
  const credentials = JSON.parse(fs.readFileSync('./credentials.json'));
  const token = JSON.parse(fs.readFileSync('./token.json'));
  const { client_id, client_secret } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret);
  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}

// Calcula el instante correspondiente a "fin del día de hoy" en la zona horaria dada,
// sin importar en qué zona horaria esté corriendo el servidor (ej. una VM en UTC).
function getEndOfTodayInTimezone(timeZone) {
  const now = new Date();
  const nowAsWallClock = new Date(now.toLocaleString('en-US', { timeZone }));
  const endOfDayWallClock = new Date(nowAsWallClock);
  endOfDayWallClock.setHours(23, 59, 59, 999);
  const diffMs = endOfDayWallClock - nowAsWallClock;
  return new Date(now.getTime() + diffMs);
}

// Devuelve los eventos de HOY (desde ahora mismo hasta las 23:59, hora de Chile) del calendario principal
async function getTodayEvents() {
  const auth = getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  const endOfDay = getEndOfTodayInTimezone(TIMEZONE);

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  return res.data.items || [];
}

// Formatea la lista de eventos en un mensaje legible para Telegram
function formatEvents(events) {
  if (events.length === 0) {
    return 'No tienes más eventos agendados por hoy. 🎉';
  }

  const lines = events.map((event) => {
    const start = event.start.dateTime
      ? new Date(event.start.dateTime).toLocaleTimeString('es-CL', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: TIMEZONE,
        })
      : 'Todo el día';
    return `🕒 ${start} — ${event.summary || '(sin título)'}`;
  });

  return `Esto tienes agendado para hoy:\n\n${lines.join('\n')}`;
}

module.exports = { getTodayEvents, formatEvents };

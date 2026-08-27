// Helpers de fecha/hora conscientes de zona horaria, para no repetir el truco de
// wall-clock en cada archivo que necesita convertir entre "hora de Chile" y epoch ms.

// Convierte una hora de pared (año, mes, día, hora, minuto, seg, ms) que representa
// un instante en `timeZone`, a su epoch ms real, sin importar en qué zona horaria
// esté corriendo el proceso (ej. una VM en UTC). Mismo truco que usa calendar.js.
function wallClockInTimezoneToEpochMs(y, mo, d, h, mi, s, ms, timeZone) {
  const now = new Date();
  // Se trunca "now" a segundos porque toLocaleString no devuelve milisegundos: si no,
  // el resto de milisegundos de "now" se suma al ms del target y lo hace pasarse de
  // medianoche (ej. pedir 23:59:59.999 podía terminar dando 00:00:00.xxx del día siguiente).
  const nowTruncatedToSeconds = Math.floor(now.getTime() / 1000) * 1000;
  const nowAsWallClock = new Date(now.toLocaleString('en-US', { timeZone }));
  const diffMs = nowTruncatedToSeconds - nowAsWallClock.getTime();
  const targetWallClock = new Date(y, mo - 1, d, h, mi, s, ms);
  return targetWallClock.getTime() + diffMs;
}

// Fecha y hora actuales en `timeZone`, en español, para inyectar en el system instruction
// (ej. "miércoles 27 de agosto de 2026, 15:42").
function formatNowForPrompt(timeZone) {
  const now = new Date();
  const datePart = now.toLocaleDateString('es-CL', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timePart = now.toLocaleTimeString('es-CL', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart}, ${timePart}`;
}

// Convierte "YYYY-MM-DD" o "YYYY-MM-DD HH:mm" (ya calculada por el modelo a partir de
// la fecha de hoy) a epoch ms en `timeZone`. Sin hora, asume fin del día.
function dateStringToEpochMs(fecha, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec((fecha || '').trim());
  if (!match) {
    throw new Error(`Formato de fecha inválido: "${fecha}". Usa YYYY-MM-DD o YYYY-MM-DD HH:mm.`);
  }

  const [, y, mo, d, h, mi] = match;
  const hasTime = h !== undefined;

  return wallClockInTimezoneToEpochMs(
    Number(y),
    Number(mo),
    Number(d),
    hasTime ? Number(h) : 23,
    hasTime ? Number(mi) : 59,
    hasTime ? 0 : 59,
    hasTime ? 0 : 999,
    timeZone
  );
}

// epoch ms -> "YYYY-MM-DD" en `timeZone`, para mostrarle al modelo la fecha de vencimiento.
function epochMsToDateLabel(epochMs, timeZone) {
  return new Date(Number(epochMs)).toLocaleDateString('en-CA', { timeZone });
}

module.exports = { formatNowForPrompt, dateStringToEpochMs, epochMsToDateLabel };

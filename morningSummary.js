const { getTodayEvents, formatEvents } = require('./calendar');
const { getPendingTasks, formatPendingTasks } = require('./clickup');

// Arma el mensaje del resumen matutino: calendario de hoy + tareas pendientes de ClickUp.
// No usa el modelo de IA (no hace falta interpretar nada), así que es rápido y no depende
// de que Groq esté disponible o lento a esa hora.
async function buildMorningMessage() {
  const [events, tasks] = await Promise.all([getTodayEvents(), getPendingTasks()]);

  const calendarText = formatEvents(events);
  const { text: tasksText } = formatPendingTasks(tasks);

  return `¡Buenos días, Juanca! ☀️\n\n${calendarText}\n\n${tasksText}`;
}

module.exports = { buildMorningMessage };

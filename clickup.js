const CLICKUP_API = 'https://api.clickup.com/api/v2';

// IDs de las listas dentro de la carpeta "🤖 Turroncito Bot"
const LISTS = {
  general: { id: '901716234659', label: '📌 General' },
  uni: { id: '901716234661', label: '🎓 Universidad' },
  trabajo: { id: '901716234662', label: '💼 Trabajo' },
  deporte: { id: '901716234664', label: '🏃 Deporte y Gym' },
};

// Prefijos que el usuario puede escribir en /agregar (ej. "uni: entregar informe")
const PREFIX_ALIASES = {
  general: 'general',
  uni: 'uni',
  universidad: 'uni',
  trabajo: 'trabajo',
  uber: 'trabajo',
  deporte: 'deporte',
  gym: 'deporte',
};

function headers() {
  return {
    Authorization: process.env.CLICKUP_API_TOKEN,
    'Content-Type': 'application/json',
  };
}

// Trae las tareas abiertas de las 4 listas. ClickUp excluye "complete" por defecto.
async function getPendingTasks() {
  const results = [];

  for (const key of Object.keys(LISTS)) {
    const list = LISTS[key];
    const res = await fetch(`${CLICKUP_API}/list/${list.id}/task?archived=false`, {
      headers: headers(),
    });

    if (!res.ok) {
      throw new Error(`ClickUp respondió ${res.status} al leer la lista ${list.label}`);
    }

    const data = await res.json();
    for (const task of data.tasks || []) {
      results.push({ id: task.id, name: task.name, listKey: key, listLabel: list.label });
    }
  }

  return results;
}

// Arma el mensaje para /pendientes y devuelve también el mapeo número -> tarea
// para que /completar sepa a qué tarea se refiere cada número.
function formatPendingTasks(tasks) {
  if (tasks.length === 0) {
    return { text: 'No tienes tareas pendientes en ClickUp. 🎉', numbered: [] };
  }

  const byList = {};
  for (const task of tasks) {
    if (!byList[task.listKey]) byList[task.listKey] = [];
    byList[task.listKey].push(task);
  }

  let counter = 1;
  const numbered = [];
  const lines = [];

  for (const key of Object.keys(LISTS)) {
    const group = byList[key];
    if (!group || group.length === 0) continue;

    lines.push(`\n${LISTS[key].label}`);
    for (const task of group) {
      lines.push(`${counter}. ${task.name}`);
      numbered.push(task);
      counter++;
    }
  }

  return { text: `Tus pendientes:${lines.join('\n')}`, numbered };
}

// Interpreta "trabajo: turno uber sabado" -> { listKey: 'trabajo', text: 'turno uber sabado' }
// Si no hay prefijo reconocido, va todo a General.
function parseAddCommand(rawText) {
  const match = rawText.match(/^([a-záéíóúñ]+):\s*(.+)$/i);
  if (match) {
    const prefix = match[1].toLowerCase();
    const listKey = PREFIX_ALIASES[prefix];
    if (listKey) {
      return { listKey, text: match[2].trim() };
    }
  }
  return { listKey: 'general', text: rawText.trim() };
}

async function addTask(listKey, text) {
  const list = LISTS[listKey];
  const res = await fetch(`${CLICKUP_API}/list/${list.id}/task`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: text }),
  });

  if (!res.ok) {
    throw new Error(`ClickUp respondió ${res.status} al crear la tarea`);
  }

  return list.label;
}

async function completeTask(taskId) {
  const res = await fetch(`${CLICKUP_API}/task/${taskId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ status: 'complete' }),
  });

  if (!res.ok) {
    throw new Error(`ClickUp respondió ${res.status} al completar la tarea`);
  }
}

// Cambia el nombre/texto de una tarea existente.
async function editTask(taskId, newText) {
  const res = await fetch(`${CLICKUP_API}/task/${taskId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ name: newText }),
  });

  if (!res.ok) {
    throw new Error(`ClickUp respondió ${res.status} al editar la tarea`);
  }
}

// Elimina una tarea permanentemente (no es lo mismo que completarla).
async function deleteTask(taskId) {
  const res = await fetch(`${CLICKUP_API}/task/${taskId}`, {
    method: 'DELETE',
    headers: headers(),
  });

  if (!res.ok) {
    throw new Error(`ClickUp respondió ${res.status} al eliminar la tarea`);
  }
}

module.exports = {
  LISTS,
  getPendingTasks,
  formatPendingTasks,
  parseAddCommand,
  addTask,
  completeTask,
  editTask,
  deleteTask,
};

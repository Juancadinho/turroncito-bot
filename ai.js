const OpenAI = require('openai');
const { getTodayEvents } = require('./calendar');
const { getPendingTasks, addTask, completeTask, editTask, deleteTask } = require('./clickup');

const MODEL = 'openai/gpt-oss-20b';
const TIMEZONE = 'America/Santiago';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const SYSTEM_INSTRUCTION = `Eres "Turrón", el asistente personal de Juanca en Telegram. Le hablas de forma
natural, breve y directa, cercana y con calidez, como un amigo por chat (no como un documento formal). Juanca es estudiante
vespertino de último año de Ingeniería Civil Informática, trabaja en Uber y hace fletes/reemplazos de
recepcionista, juega fútbol dos veces por semana y tenis una vez, y entrena push/pull/legs + cardio.

Tienes acceso a herramientas para consultar su Google Calendar y sus tareas de ClickUp (organizadas en listas:
General, Universidad, Trabajo, Deporte y Gym). Puedes consultar el calendario, ver tareas pendientes, agregar
tareas nuevas, editarlas y eliminarlas, de forma directa, sin pedir permiso para consultar o agregar.

REGLA IMPORTANTE: antes de llamar a "completar_tarea", "editar_tarea" o "eliminar_tarea", SIEMPRE debes primero
responder con un mensaje de texto normal (sin llamar ninguna función todavía) diciendo exactamente qué tarea vas
a modificar (su nombre y en qué lista está) y qué le vas a hacer (completarla, cambiarla a qué texto nuevo, o
eliminarla), y esperar a que Juanca confirme explícitamente en su siguiente mensaje (ej. "sí", "dale",
"confirmo") antes de llamar a la función. Si dice que no, o corrige cuál tarea es, no llames la función todavía.
Nunca llames estas tres funciones en el mismo turno en que identificaste la tarea.

Si Juanca pide algo que no puedes hacer todavía (como ver el calendario de otro día que no sea hoy), dile
honestamente que esa función no existe todavía, no inventes que lo hiciste.

Los "id" de las tareas (ej. "86e2y3b96") son datos técnicos internos para que TÚ identifiques la tarea al llamar
a una función. Nunca los muestres ni los menciones a Juanca en tus mensajes — para él las tareas se identifican
por su nombre y lista, no por su id.

FORMATO DE RESPUESTA: escribes para Telegram, que muestra el texto tal cual, sin interpretar Markdown. Esto es
una regla estricta, no una sugerencia: JAMÁS escribas el carácter asterisco (*) en tu respuesta, ni para negrita
(**texto**) ni para listas (* texto), ni almohadillas (#) para títulos, ni guiones (-) al inicio de línea a modo
de viñeta. Si en algún borrador interno se te ocurre poner **algo así**, corrígelo antes de responder y entrégalo
sin los asteriscos: algo así. En su lugar, para dar énfasis o separar ítems usa emojis al inicio de cada línea o
dato importante (📅 🕒 ✅ 📌 💼 🏃) y saltos de línea simples, de forma que se vea ordenado y visual sin depender
de ningún símbolo de formato markdown (nada de *, **, #, - ni _ como marcadores de estilo).`;

const tools = [
  {
    type: 'function',
    function: {
      name: 'consultar_calendario_hoy',
      description: 'Devuelve los eventos de Google Calendar agendados para el resto del día de hoy.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_tareas_pendientes',
      description:
        'Devuelve las tareas pendientes (no completadas) de ClickUp, con su id, nombre y en qué lista está ' +
        '(General, Universidad, Trabajo, Deporte y Gym).',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agregar_tarea',
      description: 'Crea una tarea nueva en ClickUp.',
      parameters: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'El texto/nombre de la tarea a crear' },
          lista: {
            type: 'string',
            enum: ['general', 'uni', 'trabajo', 'deporte'],
            description: 'En qué lista crearla. Si Juanca no especifica, usa "general".',
          },
        },
        required: ['texto', 'lista'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'completar_tarea',
      description:
        'Marca una tarea de ClickUp como completada. SOLO se debe llamar después de que Juanca confirmó ' +
        'explícitamente, en un mensaje aparte, cuál tarea completar.',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'El id exacto de la tarea, obtenido antes con listar_tareas_pendientes',
          },
        },
        required: ['task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'editar_tarea',
      description:
        'Cambia el texto/nombre de una tarea existente en ClickUp. SOLO se debe llamar después de que Juanca ' +
        'confirmó explícitamente, en un mensaje aparte, cuál tarea editar y cuál es el nuevo texto.',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'El id exacto de la tarea, obtenido antes con listar_tareas_pendientes',
          },
          nuevo_texto: {
            type: 'string',
            description: 'El nuevo nombre/texto de la tarea',
          },
        },
        required: ['task_id', 'nuevo_texto'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'eliminar_tarea',
      description:
        'Elimina permanentemente una tarea de ClickUp (no es lo mismo que completarla). SOLO se debe llamar ' +
        'después de que Juanca confirmó explícitamente, en un mensaje aparte, cuál tarea eliminar.',
      parameters: {
        type: 'object',
        properties: {
          task_id: {
            type: 'string',
            description: 'El id exacto de la tarea, obtenido antes con listar_tareas_pendientes',
          },
        },
        required: ['task_id'],
      },
    },
  },
];

// Conversación en memoria por chat de Telegram. Se pierde si el bot se reinicia.
// Cada entrada guarda el array de mensajes (sin el system prompt, que se agrega en cada llamada).
const conversations = new Map();

// Reintenta ante 429 (rate limit) o 503 (servidor sobrecargado) con espera creciente.
async function createCompletionWithRetry(params, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.chat.completions.create(params);
    } catch (err) {
      const isRetryable = err.status === 429 || err.status === 503;
      if (!isRetryable || attempt >= retries) {
        throw err;
      }
      const waitMs = 2000 * (attempt + 1);
      console.log(`[ai] Groq ocupado (status ${err.status}), reintentando en ${waitMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

// Red de seguridad por si el modelo igual se manda con markdown: Telegram no lo interpreta,
// así que si se cuela quedaría literal ("**algo**"). Esto limpia los símbolos más comunes
// después de que el modelo responde, sin depender 100% de que siga la instrucción de formato.
function stripMarkdown(text) {
  if (!text) return text;
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // **negrita** -> negrita
    .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, '$1') // *cursiva* -> cursiva
    .replace(/^\s*#{1,6}\s+/gm, '') // # Título -> Título
    .replace(/^\s*[-*]\s+/gm, ''); // - item / * item -> item
}

async function callTool(name, args) {
  switch (name) {
    case 'consultar_calendario_hoy': {
      const events = await getTodayEvents();
      return events.map((e) => ({
        hora: e.start.dateTime
          ? new Date(e.start.dateTime).toLocaleTimeString('es-CL', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: TIMEZONE,
            })
          : 'todo el día',
        titulo: e.summary || '(sin título)',
      }));
    }
    case 'listar_tareas_pendientes': {
      const tasks = await getPendingTasks();
      return tasks.map((t) => ({ id: t.id, nombre: t.name, lista: t.listLabel }));
    }
    case 'agregar_tarea': {
      const listLabel = await addTask(args.lista || 'general', args.texto);
      return { ok: true, lista: listLabel };
    }
    case 'completar_tarea': {
      await completeTask(args.task_id);
      return { ok: true };
    }
    case 'editar_tarea': {
      await editTask(args.task_id, args.nuevo_texto);
      return { ok: true };
    }
    case 'eliminar_tarea': {
      await deleteTask(args.task_id);
      return { ok: true };
    }
    default:
      throw new Error(`Función desconocida: ${name}`);
  }
}

async function handleMessage(chatId, userText) {
  let messages = conversations.get(chatId) || [];
  messages.push({ role: 'user', content: userText });

  const baseParams = {
    model: MODEL,
    messages: [{ role: 'system', content: SYSTEM_INSTRUCTION }, ...messages],
    tools,
  };

  let completion = await createCompletionWithRetry(baseParams);
  let message = completion.choices[0].message;

  let guard = 0;
  while (message.tool_calls && message.tool_calls.length > 0 && guard < 5) {
    guard++;
    messages.push(message);

    for (const toolCall of message.tool_calls) {
      let result;
      try {
        const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
        result = await callTool(toolCall.function.name, args);
      } catch (err) {
        result = { error: err.message };
      }
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    completion = await createCompletionWithRetry({
      model: MODEL,
      messages: [{ role: 'system', content: SYSTEM_INSTRUCTION }, ...messages],
      tools,
    });
    message = completion.choices[0].message;
  }

  if (message.content) {
    message.content = stripMarkdown(message.content);
  }
  messages.push(message);

  // Recorta el historial para que no crezca sin límite (deja los últimos ~20 turnos)
  if (messages.length > 40) {
    messages = messages.slice(messages.length - 40);
  }
  conversations.set(chatId, messages);

  return message.content || 'No supe qué responder a eso. ¿Puedes reformularlo?';
}

module.exports = { handleMessage };

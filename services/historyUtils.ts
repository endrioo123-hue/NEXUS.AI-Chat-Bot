
import { CallLog, Character, Message } from '../types';

const CALL_HISTORY_KEY = 'animetalk_call_history';
const CHAT_HISTORY_PREFIX = 'animetalk_chat_';

// --- CALL HISTORY ---

export const getHistory = (): CallLog[] => {
  try {
    const stored = localStorage.getItem(CALL_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Falha ao ler histórico de chamadas", e);
    return [];
  }
};

export const saveCallLog = (character: Character) => {
  try {
    const history = getHistory();
    const newLog: CallLog = {
      id: Date.now().toString(),
      characterName: character.name,
      characterAvatar: character.avatarUrl,
      timestamp: Date.now(),
    };
    // Mantém apenas os últimos 50 registros
    const updated = [newLog, ...history].slice(0, 50);
    localStorage.setItem(CALL_HISTORY_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Falha ao salvar histórico de chamadas", e);
  }
};

export const clearHistory = () => {
  localStorage.removeItem(CALL_HISTORY_KEY);
};

// --- CHAT MEMORY (PERSISTENCE) ---

export const getChatHistory = (characterId: string): Message[] => {
  try {
    const stored = localStorage.getItem(`${CHAT_HISTORY_PREFIX}${characterId}`);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error(`Falha ao ler chat de ${characterId}`, e);
    return [];
  }
};

export const saveChatHistory = (characterId: string, messages: Message[]) => {
  try {
    // Mantém apenas as últimas 100 mensagens para economizar espaço
    const trimmedMessages = messages.slice(-100);
    localStorage.setItem(`${CHAT_HISTORY_PREFIX}${characterId}`, JSON.stringify(trimmedMessages));
  } catch (e) {
    console.error(`Falha ao salvar chat de ${characterId}`, e);
  }
};

export const clearChatHistory = (characterId: string) => {
    localStorage.removeItem(`${CHAT_HISTORY_PREFIX}${characterId}`);
};

export const getAllChatSessions = (): { characterId: string, lastMessage: string, timestamp: number }[] => {
  const sessions = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CHAT_HISTORY_PREFIX)) {
      const characterId = key.replace(CHAT_HISTORY_PREFIX, '');
      try {
        const messages = JSON.parse(localStorage.getItem(key) || '[]');
        if (messages.length > 0) {
          const lastMsg = messages[messages.length - 1];
          sessions.push({
            characterId,
            lastMessage: lastMsg.text,
            timestamp: lastMsg.timestamp
          });
        }
      } catch (e) { console.error(e); }
    }
  }
  return sessions.sort((a, b) => b.timestamp - a.timestamp);
};

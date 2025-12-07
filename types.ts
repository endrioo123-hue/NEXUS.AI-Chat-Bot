export interface Character {
  id: string;
  name: string;
  role: string;
  color: string;
  avatarUrl: string;
  systemInstruction: string;
  customInstructions?: string[]; // New in V2
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface CallLog {
  id: string;
  characterName: string;
  characterAvatar: string;
  timestamp: number;
  duration?: number;
}

export enum AppScreen {
  HOME = 'HOME',
  CHAT = 'CHAT',
  CALL = 'CALL',
  HISTORY = 'HISTORY',
  CREATOR = 'CREATOR',
  DETAILS = 'DETAILS'
}
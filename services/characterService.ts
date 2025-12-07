import { Character } from '../types';
import { CHARACTERS as DEFAULT_CHARACTERS } from '../constants';

const CUSTOM_CHARS_KEY = 'animetalk_custom_chars';

export const getAllCharacters = (): Character[] => {
  try {
    const stored = localStorage.getItem(CUSTOM_CHARS_KEY);
    const custom: Character[] = stored ? JSON.parse(stored) : [];
    // Retorna padrão + customizados
    // Inverte a ordem dos customizados para que os mais novos apareçam perto do botão de criar se desejado, 
    // ou mantém no final. Vamos colocar no final.
    return [...DEFAULT_CHARACTERS, ...custom];
  } catch (e) {
    console.error("Erro ao carregar personagens", e);
    return DEFAULT_CHARACTERS;
  }
};

export const saveCharacter = (char: Character) => {
  try {
    const stored = localStorage.getItem(CUSTOM_CHARS_KEY);
    const custom: Character[] = stored ? JSON.parse(stored) : [];
    
    const existingIndex = custom.findIndex(c => c.id === char.id);
    if (existingIndex >= 0) {
        custom[existingIndex] = char;
    } else {
        custom.push(char);
    }
    
    localStorage.setItem(CUSTOM_CHARS_KEY, JSON.stringify(custom));
  } catch (e) {
    console.error("Erro ao salvar personagem", e);
  }
};

export const deleteCharacter = (charId: string) => {
    try {
        const stored = localStorage.getItem(CUSTOM_CHARS_KEY);
        if (!stored) return;
        let custom: Character[] = JSON.parse(stored);
        custom = custom.filter(c => c.id !== charId);
        localStorage.setItem(CUSTOM_CHARS_KEY, JSON.stringify(custom));
    } catch (e) {
        console.error("Erro ao deletar personagem", e);
    }
}

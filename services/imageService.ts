import { Character } from '../types';

/**
 * Generates a high-quality anime avatar URL based on the character's profile.
 * Uses Pollinations AI (Flux model) with a sophisticated prompt engineering strategy.
 * 
 * @param character - The character object (or partial) containing name, role, and instructions.
 * @returns The URL of the generated image.
 */
export const generateCharacterAvatar = (character: Partial<Character>): string => {
  if (!character.name) return '';

  // 1. Extract Visual Keywords from System/Custom Instructions
  // We look for words that describe appearance or mood to enhance the prompt
  const combinedText = `${character.systemInstruction || ''} ${character.customInstructions?.join(' ') || ''}`;
  
  const visualKeywords = [];
  if (combinedText.toLowerCase().includes('dark') || combinedText.toLowerCase().includes('sombrio')) visualKeywords.push('dark atmosphere, cinematic lighting');
  if (combinedText.toLowerCase().includes('happy') || combinedText.toLowerCase().includes('alegre')) visualKeywords.push('bright vibrant colors, smiling');
  if (combinedText.toLowerCase().includes('cyber') || combinedText.toLowerCase().includes('tech')) visualKeywords.push('cyberpunk aesthetic, neon lights');
  if (combinedText.toLowerCase().includes('forest') || combinedText.toLowerCase().includes('nature')) visualKeywords.push('nature background, organic details');
  if (combinedText.toLowerCase().includes('magic') || combinedText.toLowerCase().includes('wizard')) visualKeywords.push('magical aura, fantasy art');

  // 2. Construct the Master Prompt
  const promptParts = [
    `anime portrait of ${character.name}`,
    character.role ? `${character.role}` : '',
    visualKeywords.join(', '),
    'official art style',
    'highly detailed face',
    'masterpiece',
    '8k resolution',
    'looking at viewer',
    'intricate details'
  ];

  const fullPrompt = promptParts.filter(Boolean).join(', ');

  // 3. Generate Random Seed for Variation
  // We use a random seed here so the user can click "Generate" multiple times to get different results
  const seed = Math.floor(Math.random() * 999999);

  // 4. Construct URL
  // Using 'flux' model for best anime results
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=400&height=400&nologo=true&seed=${seed}&model=flux`;
};

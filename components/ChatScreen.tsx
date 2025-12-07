
import React, { useState, useEffect, useRef } from 'react';
import { Character, Message } from '../types';
import { GoogleGenAI, Chat, GenerateContentResponse, Modality, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { base64ToUint8Array, decodeAudioData } from '../services/audioUtils';
import { getChatHistory, saveChatHistory, clearChatHistory } from '../services/historyUtils';

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

interface ChatScreenProps {
  character: Character;
  onBack: () => void;
}

// Markdown Renderer
const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <span className="leading-relaxed whitespace-pre-wrap font-sans text-sm md:text-base">
      {parts.map((part, index) => {
        if (part.startsWith('```')) {
          const content = part.replace(/^```\w*\n?|```$/g, '');
          return (
            <div key={index} className="my-3 p-3 bg-black/80 border border-white/10 rounded font-mono text-xs text-green-400 overflow-x-auto custom-scrollbar">
              {content}
            </div>
          );
        }
        const lines = part.split('\n');
        return lines.map((line, i) => {
             const segments = line.split(/(\*\*.*?\*\*|\*.*?\*)/g);
             return (
                 <span key={`${index}-${i}`}>
                    {segments.map((seg, j) => {
                        if (seg.startsWith('**') && seg.endsWith('**')) {
                            return <strong key={j} className="text-white font-bold drop-shadow-md">{seg.slice(2, -2)}</strong>;
                        }
                        if (seg.startsWith('*') && seg.endsWith('*')) {
                            return <em key={j} className="text-gray-400 font-serif italic">{seg}</em>;
                        }
                        return seg;
                    })}
                    {i < lines.length - 1 && <br />}
                 </span>
             )
        });
      })}
    </span>
  );
};

// Helper to create a high-quality room impulse response for Reverb
const createImpulseResponse = (ctx: AudioContext, duration: number, decay: number) => {
    const rate = ctx.sampleRate;
    const length = rate * duration;
    const impulse = ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
        const n = i < length ? Math.pow(1 - i / length, decay) : 0;
        left[i] = (Math.random() * 2 - 1) * n;
        right[i] = (Math.random() * 2 - 1) * n;
    }
    return impulse;
};

// Helper: Analog Tube Saturation Curve (Asymmetric for Even Harmonics/Warmth)
const makeTubeCurve = (amount: number) => {
  const k = typeof amount === 'number' ? amount : 50;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    // Asymmetric transfer function to simulate triode tube characteristics
    if (x < -0.5) {
        curve[i] = -0.5 + (1 + x + 0.5) * 0.1; // Soft bottom compression
    } else if (x > 0.5) {
        curve[i] = 0.5 + (x - 0.5) * 0.8; // Harder top limit
    } else {
        curve[i] = x; // Linear middle
    }
    // Apply drive
    curve[i] *= (1 + k/100);
  }
  return curve;
};

// Helper: Detect Character Timbre (Formant Shift)
const getCharacterTimbre = (char: Character) => {
    const deepKeywords = ['God', 'Titan', 'King', 'Vingador', 'General', 'Captain', 'Emperor', 'Demon', 'Villain'];
    const highKeywords = ['Child', 'Small', 'Cute', 'Maid', 'Slime', 'Princess', 'Fairy', 'Spy'];
    
    let shift = 0; // Hz shift for formant filter
    
    if (deepKeywords.some(k => char.role.includes(k) || char.name.includes(k))) shift = -150; 
    if (highKeywords.some(k => char.role.includes(k) || char.name.includes(k))) shift = 250; 

    // Specific Overrides for Experimental Fidelity
    if (char.name.includes('Kratos') || char.name.includes('Sukuna') || char.name.includes('Ainz')) shift = -350;
    if (char.name.includes('Anya') || char.name.includes('Pikachu')) shift = 450;
    if (char.name.includes('Rei') || char.name.includes('Violet')) shift = 100; // Slight robotic/light shift

    return shift;
};

// Helper: Detect Character Pitch Shift (Fundamental Freq in Cents)
const getCharacterBasePitch = (char: Character) => {
    let pitch = 0; // In Cents (100 cents = 1 semitone)
    const deepKeywords = ['God', 'Titan', 'King', 'Vingador', 'General', 'Captain', 'Emperor', 'Demon', 'Villain', 'All Might', 'Kratos', 'Sukuna', 'Ainz', 'Guts'];
    const highKeywords = ['Child', 'Small', 'Cute', 'Maid', 'Slime', 'Princess', 'Fairy', 'Spy', 'Anya', 'Pikachu', 'Zenitsu', 'Rimuru'];
    
    // Base Role adjustments
    if (deepKeywords.some(k => char.role.includes(k) || char.name.includes(k))) pitch = -250;
    if (highKeywords.some(k => char.role.includes(k) || char.name.includes(k))) pitch = 250;

    // Specific Character Overrides for Accurate Voice Acting
    if (char.name.includes('Kratos')) pitch = -600; // Very deep, slower
    if (char.name.includes('Ainz')) pitch = -400; // Deep, regal
    if (char.name.includes('Anya')) pitch = 500; // High, child-like
    if (char.name.includes('Pikachu')) pitch = 800;
    if (char.name.includes('Zenitsu')) pitch = 300; // Whiny high pitch
    if (char.name.includes('Frieren')) pitch = -100; // Slight mature tone
    if (char.name.includes('Gojo')) pitch = -50; // Cool, slightly relaxed depth

    return pitch;
};

// Emotional Profile Interface
interface EmotionalProfile {
    rate: number;
    detune: number;
    bassBoost: number;
    trebleBoost: number;
    saturation: number;
    compressionThreshold: number;
    reverbMix: number;
}

// Advanced Emotion Analyzer
const analyzeEmotion = (text: string, characterId: string): EmotionalProfile => {
    // Default Base Profile (Neutral with slight warmth)
    let profile: EmotionalProfile = {
        rate: 1.0,
        detune: 0,
        bassBoost: 0,
        trebleBoost: 0,
        saturation: 15, // Subtle warmth/presence
        compressionThreshold: -20,
        reverbMix: 0.1
    };

    const lower = text.toLowerCase();
    
    // 1. WHISPER / INTIMATE / MYSTERIOUS
    if (text.includes('(') || lower.includes('*sussurra*') || lower.includes('*whispers*') || lower.includes('...')) {
        profile.rate = 0.95;
        profile.detune = -50; 
        profile.bassBoost = -5; 
        profile.trebleBoost = 8; 
        profile.saturation = 5; // Clean, breathy
        profile.compressionThreshold = -30; 
        profile.reverbMix = 0.05; 
    }
    
    // 2. SHOUT / EXCITEMENT / ANGER
    else if ((text === text.toUpperCase() && text.length > 10) || text.includes('!!') || text.includes('?!')) {
        profile.rate = 1.05;
        profile.detune = 50; 
        profile.bassBoost = 2;
        profile.trebleBoost = 4;
        profile.saturation = 45; // Grit and harmonics for intensity
        profile.compressionThreshold = -12; 
        profile.reverbMix = 0.25; 
    }

    // 3. SAD / SERIOUS / MELANCHOLY
    else if (lower.includes('sorry') || lower.includes('sad') || lower.includes('triste') || lower.includes('desculpa')) {
        profile.rate = 0.85; 
        profile.detune = -100; 
        profile.bassBoost = 4; 
        profile.trebleBoost = -2; 
        profile.saturation = 25; // Warm, thick texture
        profile.compressionThreshold = -24;
        profile.reverbMix = 0.3; 
    }
    
    // Character Specific Tweaks (Deterministic)
    let charHash = 0;
    for (let i = 0; i < characterId.length; i++) charHash += characterId.charCodeAt(i);
    const charMod = (charHash % 10) / 10; 

    profile.bassBoost += charMod * 3;
    profile.trebleBoost += (1 - charMod) * 3;

    return profile;
};

const ChatScreen: React.FC<ChatScreenProps> = ({ character, onBack }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [processingState, setProcessingState] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isFlashMode, setIsFlashMode] = useState(false);
  const [speechSpeed, setSpeechSpeed] = useState(1.0);
  const [detectedEmotion, setDetectedEmotion] = useState<string>('NEUTRAL');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<Chat | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ttsTimeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const savedMessages = getChatHistory(character.id);
    if (savedMessages.length > 0) {
        setMessages(savedMessages);
    } else {
        setMessages([{
            id: 'init',
            role: 'model',
            text: `>> SYSTEM ONLINE. Protocolo de personalidade ${character.name} carregado. Memória acessada.`,
            timestamp: Date.now()
        }]);
    }

    return () => {
        isMountedRef.current = false;
        if (ttsTimeoutRef.current) clearTimeout(ttsTimeoutRef.current);
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            try { audioContextRef.current.close(); } catch(e) {}
        }
    };
  }, [character.id]);

  useEffect(() => {
    if (messages.length > 0) {
        saveChatHistory(character.id, messages);
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, character.id, isTyping, isThinking]);

  useEffect(() => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const historyPayload = messages
        .filter(m => m.id !== 'init' && m.id !== 'reset')
        .map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
        }));

    let fullSystemInstruction = character.systemInstruction;
    if (character.customInstructions && character.customInstructions.length > 0) {
        fullSystemInstruction += `\n\n=== NEURAL PROCESSING RULES (NLP) ===\n${character.customInstructions.join('\n')}`;
    }
    fullSystemInstruction += `\n\n=== CONTEXT MEMORY ===\nVocê tem acesso ao histórico desta conversa. Use-o para manter a consistência.`;

    chatSessionRef.current = ai.chats.create({
      model: 'gemini-2.5-flash', 
      config: { 
        systemInstruction: fullSystemInstruction,
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
        ]
      },
      history: historyPayload
    });

  }, [character, messages.length === 0]); 

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearMemory = () => {
      if(confirm("LIMPAR NÚCLEO DE MEMÓRIA? Esta ação não pode ser desfeita.")){
          clearChatHistory(character.id);
          setMessages([{
            id: 'reset',
            role: 'model',
            text: `>> MEMORY CACHE CLEARED. Reiniciando ${character.name}...`,
            timestamp: Date.now()
        }]);
      }
  }

  const handleTTSCleanup = () => {
      if (!isMountedRef.current) return;
      setIsPlayingAudio(false);
      setDetectedEmotion('NEUTRAL');
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          try {
            audioContextRef.current.close();
          } catch(e) { console.error("Error closing audio context", e); }
      }
  };

  const playTTS = async (text: string) => {
    if (isPlayingAudio) return;
    setIsPlayingAudio(true);
    let nextStartTime = 0;
    
    // Reference Counting for Robust Stream Cleanup
    let activeSourcesCount = 0;
    let streamFinished = false;

    // Clear any pending cleanup timeouts
    if (ttsTimeoutRef.current) clearTimeout(ttsTimeoutRef.current);

    // Function to check if we can close the context
    const checkCleanup = () => {
        if (!isMountedRef.current) return;
        // Only cleanup if stream is done AND all audio sources have finished playing
        if (streamFinished && activeSourcesCount === 0) {
            // Wait for 1s to allow Reverb tail to fade out naturally
            ttsTimeoutRef.current = window.setTimeout(() => {
                handleTTSCleanup();
            }, 1000);
        }
    };

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const cleanText = text.replace(/\*.*?\*/g, '').trim();
        if (!cleanText) {
             setIsPlayingAudio(false);
             return;
        }

        const emotion = analyzeEmotion(text, character.id);
        const timbreShift = getCharacterTimbre(character);
        const basePitch = getCharacterBasePitch(character);
        
        // Debug Visuals for Emotion
        if (emotion.saturation > 30) setDetectedEmotion('SHOUT / INTENSE');
        else if (emotion.rate < 0.9) setDetectedEmotion('SAD / MELANCHOLY');
        else if (emotion.reverbMix < 0.08) setDetectedEmotion('WHISPER / INTIMATE');
        else setDetectedEmotion('NEUTRAL / WARM');

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        let ctx = audioContextRef.current;
        
        // Ensure 24000Hz Sample Rate for High Fidelity
        if (!ctx || ctx.state === 'closed') {
            ctx = new AudioContextClass({ 
                sampleRate: 24000, 
                latencyHint: 'interactive' 
            });
            audioContextRef.current = ctx;
        }
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }

        nextStartTime = ctx.currentTime + 0.1;

        // --- DYNAMIC AUDIO GRAPH CONSTRUCTION ---
        
        // 1. Dynamics
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = emotion.compressionThreshold;
        compressor.knee.value = 30;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        // 2. EQ - Low End
        const lowShelf = ctx.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 120;
        lowShelf.gain.value = emotion.bassBoost;

        // 3. EQ - Mid (Presence)
        const midPeaking = ctx.createBiquadFilter();
        midPeaking.type = 'peaking';
        midPeaking.frequency.value = 1500;
        midPeaking.Q.value = 0.8;
        midPeaking.gain.value = 2;

        // 4. EQ - High End (Air)
        const highShelf = ctx.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 8000;
        highShelf.gain.value = emotion.trebleBoost;

        // 5. Formant Morphing (Timbre Simulation)
        const formantFilter = ctx.createBiquadFilter();
        formantFilter.type = 'peaking';
        formantFilter.frequency.value = 1000 + timbreShift; // Shift center freq
        formantFilter.Q.value = 1.0;
        formantFilter.gain.value = Math.abs(timbreShift) > 50 ? 5 : 0; 

        // 6. Tube Harmonics (Warm Saturation)
        const exciterGain = ctx.createGain();
        exciterGain.gain.value = 0.05 + (emotion.saturation / 500); // Dynamic blend
        const shaper = ctx.createWaveShaper();
        shaper.curve = makeTubeCurve(emotion.saturation); // Use Analog Tube Curve
        const exciterHighPass = ctx.createBiquadFilter();
        exciterHighPass.type = 'highpass';
        exciterHighPass.frequency.value = 2000;
        
        // 7. Reverb (Space)
        const convolver = ctx.createConvolver();
        convolver.buffer = createImpulseResponse(ctx, 0.5, 3.0); 

        // 8. Stereo Widening (Haas)
        const merger = ctx.createChannelMerger(2);
        const stereoDelay = ctx.createDelay();
        stereoDelay.delayTime.value = 0.012; 

        // Routing Nodes
        const dryGain = ctx.createGain();
        const wetGain = ctx.createGain();
        dryGain.gain.value = 0.8;
        wetGain.gain.value = emotion.reverbMix; 

        const masterGain = ctx.createGain();
        masterGain.gain.value = 1.0;

        // --- CONNECTIONS ---
        // Chain: Compressor -> LowShelf -> Formant -> MidPeaking -> HighShelf
        compressor.connect(lowShelf);
        lowShelf.connect(formantFilter);
        formantFilter.connect(midPeaking);
        midPeaking.connect(highShelf);
        
        // Exciter Path: Parallel processing for high-end harmonics
        midPeaking.connect(exciterHighPass);
        exciterHighPass.connect(shaper);
        shaper.connect(exciterGain);
        exciterGain.connect(highShelf);

        // FX Splits
        highShelf.connect(dryGain);
        highShelf.connect(convolver);
        convolver.connect(wetGain);

        // Spatial Merge
        dryGain.connect(merger, 0, 0);
        wetGain.connect(merger, 0, 0);
        dryGain.connect(stereoDelay);
        wetGain.connect(stereoDelay);
        stereoDelay.connect(merger, 0, 1);

        const finalDest = masterGain;
        merger.connect(finalDest);
        
        // Flash Mode (Delay Feedback)
        if (isFlashMode) {
            const delayNode = ctx.createDelay();
            delayNode.delayTime.value = 0.12; 
            const feedbackGain = ctx.createGain();
            feedbackGain.gain.value = 0.3;
            const delayWet = ctx.createGain();
            delayWet.gain.value = 0.45;

            highShelf.connect(delayNode);
            delayNode.connect(feedbackGain);
            feedbackGain.connect(delayNode);
            delayNode.connect(delayWet);
            delayWet.connect(masterGain);
        }

        masterGain.connect(ctx.destination);
        const entryNode = compressor;

        // Use standard speech config
        const speechConfig = {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: character.voiceName } },
        };

        // Prepare System Instruction for Voice Acting
        const voiceActingPrompt = `Act as ${character.name}. Role: ${character.role}. Current Emotion: ${detectedEmotion}. Speak with ${character.systemInstruction.slice(0, 100)}...`;

        const result = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash-preview-tts',
            contents: { parts: [{ text: cleanText }] },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: speechConfig,
                systemInstruction: {
                    parts: [{ text: voiceActingPrompt }]
                }
            }
        });

        for await (const chunk of result) {
            if (!isMountedRef.current) break;
            const base64Audio = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                // Decode LINEAR16 PCM data
                const audioBytes = base64ToUint8Array(base64Audio);
                const audioBuffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                
                // Apply Prosody Adjustments (Base Pitch + Emotional Detune)
                const finalRate = emotion.rate * speechSpeed;
                source.playbackRate.value = finalRate;
                source.detune.value = emotion.detune + basePitch;

                source.connect(entryNode);
                
                // --- ROBUST SCHEDULING ---
                if (nextStartTime < ctx.currentTime) nextStartTime = ctx.currentTime;
                
                source.start(nextStartTime);
                activeSourcesCount++;
                
                // Register cleanup event for THIS source
                source.onended = () => {
                    activeSourcesCount--;
                    checkCleanup();
                };
                
                // Adjust next start time based on the modified rate
                nextStartTime += audioBuffer.duration / finalRate;
            }
        }
        
    } catch (e) {
        console.error("TTS Stream Error", e);
    } finally {
        streamFinished = true;
        checkCleanup();
    }
  };

  const simulateProcessing = async () => {
      const states = [
          "ANALYZING INPUT...",
          "DETECTING SENTIMENT...",
          "ACCESSING LONG-TERM MEMORY...",
          "FORMULATING RESPONSE...",
      ];
      for (const state of states) {
          if (!isMountedRef.current) break;
          setProcessingState(state);
          await new Promise(r => setTimeout(r, 400));
      }
  }

  const handleSend = async () => {
    if ((!inputText.trim() && !selectedImage) || !chatSessionRef.current || isTyping) return;

    const currentText = inputText;
    const currentImage = selectedImage;

    setInputText('');
    setSelectedImage(null);
    setIsTyping(true);
    setIsThinking(true);
    simulateProcessing();

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: currentText + (currentImage ? ' [IMAGE ATTACHED]' : ''),
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const responseId = (Date.now() + 1).toString();
      
      // Fix structure to wrap parts in 'message' property
      const messageParts: any[] = [];
      if (currentText) messageParts.push({ text: currentText });
      if (currentImage) {
          const base64Data = currentImage.split(',')[1];
          const mimeType = currentImage.split(';')[0].split(':')[1];
          messageParts.push({
              inlineData: { mimeType: mimeType, data: base64Data }
          });
      }

      const result = await chatSessionRef.current.sendMessageStream({ message: messageParts });
      
      let fullText = '';
      let hasStarted = false;

      for await (const chunk of result) {
        if (!isMountedRef.current) break;
        if (!hasStarted) {
            setIsThinking(false);
            setProcessingState('');
            hasStarted = true;
            setMessages(prev => [...prev, { id: responseId, role: 'model', text: '', timestamp: Date.now() }]);
        }
        const c = chunk as GenerateContentResponse;
        const textChunk = c.text || '';
        fullText += textChunk;
        setMessages(prev => prev.map(msg => msg.id === responseId ? { ...msg, text: fullText } : msg));
      }
    } catch (error) {
      console.error(error);
      if (isMountedRef.current) {
        setIsThinking(false);
        setMessages(prev => [...prev, {
            id: Date.now().toString(), role: 'model', text: ">> SYSTEM ERROR: Neural Link Severed or Safety Filter Triggered. Try again.", timestamp: Date.now()
        }]);
      }
    } finally {
      if (isMountedRef.current) {
        setIsTyping(false);
        setIsThinking(false);
        setProcessingState('');
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#050505] relative overflow-hidden">
      {/* Dynamic Background with Ambient Effects */}
      <div className={`absolute inset-0 z-0 pointer-events-none transition-all duration-1000 ease-in-out
          ${detectedEmotion.includes('SHOUT') ? 'bg-red-900/10' : ''}
          ${detectedEmotion.includes('SAD') ? 'bg-blue-900/10 grayscale-[50%]' : ''}
          ${detectedEmotion.includes('WHISPER') ? 'bg-purple-900/10 brightness-50' : ''}
      `}>
         {/* Avatar Blur Background */}
         <img 
            src={character.avatarUrl} 
            className={`w-full h-full object-cover blur-3xl opacity-10 scale-110 transition-transform duration-[3000ms]
                ${detectedEmotion.includes('SHOUT') ? 'scale-125 opacity-20' : ''}
                ${detectedEmotion.includes('SAD') ? 'scale-100 opacity-5' : ''}
            `} 
         />
         {/* Ambient Particles */}
         <div className={`absolute top-[-10%] right-[-10%] w-96 h-96 rounded-full blur-[100px] opacity-20 animate-pulse-slow transition-colors duration-1000
             ${detectedEmotion.includes('SHOUT') ? 'bg-red-600' : character.color.replace('text-', 'bg-')}
         `}></div>
         <div className={`absolute bottom-[-10%] left-[-10%] w-80 h-80 rounded-full blur-[80px] opacity-10 animate-float transition-colors duration-1000
             ${detectedEmotion.includes('SAD') ? 'bg-blue-600' : 'bg-white'}
         `}></div>

         <div className="absolute inset-0 bg-[#050505]/80 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
      </div>

      {/* Header */}
      <div className="relative z-30 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/10 p-3 flex items-center justify-between shadow-2xl">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-all border border-white/5">
          <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex flex-col items-center">
            <span className={`text-[8px] font-mono tracking-[0.3em] uppercase ${character.color} animate-pulse`}>NEURAL LINK ESTABLISHED</span>
            <h2 className="font-bold text-base text-white tracking-widest uppercase">{character.name}</h2>
            {isPlayingAudio && (
                 <span className="text-[8px] font-mono text-white bg-white/10 px-1 rounded mt-0.5 animate-pulse">
                     {detectedEmotion}
                 </span>
            )}
        </div>
        
        {/* Memory & FX Actions */}
        <div className="flex items-center gap-2">
            {/* Speed Control Slider */}
            <div className="hidden md:flex flex-col items-center bg-black/40 rounded px-2 py-0.5 border border-white/5">
                <label className="text-[6px] font-mono text-gray-500 tracking-widest">SPD: {speechSpeed.toFixed(1)}x</label>
                <input 
                    type="range" 
                    min="0.5" 
                    max="2.0" 
                    step="0.1" 
                    value={speechSpeed} 
                    onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
                    className="w-12 h-1 accent-white bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
            </div>
            
            <button 
                onClick={() => setIsFlashMode(!isFlashMode)} 
                className={`w-7 h-7 flex items-center justify-center rounded border transition-all ${isFlashMode ? 'bg-yellow-400/10 text-yellow-400 border-yellow-400/50 shadow-[0_0_10px_rgba(250,204,21,0.2)]' : 'bg-transparent text-gray-500 border-white/10 hover:text-gray-300'}`}
                title="Toggle Flash Mode (High Speed Echo)"
             >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" clipRule="evenodd" />
                </svg>
             </button>
             <button onClick={clearMemory} className="text-[10px] text-red-500 hover:text-red-400 font-mono border border-red-500/20 px-2 py-1 rounded hover:bg-red-500/10 transition-all" title="Limpar Memória">
                RESET
             </button>
             {/* Reactive Header Avatar */}
            <div className={`w-8 h-8 rounded-full overflow-hidden border-2 transition-all duration-300 ${character.color.replace('text-', 'border-')}
                ${detectedEmotion.includes('SHOUT') ? 'ring-2 ring-red-500 scale-110' : ''}
                ${detectedEmotion.includes('SAD') ? 'grayscale opacity-70' : ''}
            `}>
                <img src={character.avatarUrl} className="w-full h-full object-cover" />
            </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto pt-4 pb-4 px-4 space-y-5 relative z-10 custom-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-float`}>
            <div className={`max-w-[85%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
               <div 
                  className={`
                    px-4 py-3 text-sm md:text-base backdrop-blur-xl border shadow-lg
                    ${msg.role === 'user' 
                      ? `bg-${character.color.replace('text-', '')}/10 border-${character.color.replace('text-', '')}/30 text-white rounded-2xl rounded-tr-none` 
                      : 'bg-[#151515] border-gray-800 text-gray-200 rounded-2xl rounded-tl-none'
                    }
                  `}
                >
                  {msg.role === 'model' ? <MarkdownText text={msg.text} /> : msg.text}
                </div>
                {/* Actions */}
                <div className="flex items-center gap-2 mt-1 px-1 opacity-60 hover:opacity-100 transition-opacity">
                   {msg.role === 'model' && (
                       <button onClick={() => playTTS(msg.text)} disabled={isPlayingAudio} className={`text-[9px] font-mono uppercase tracking-wider hover:text-white transition-colors flex items-center gap-1 ${isPlayingAudio ? character.color : 'text-gray-500'}`}>
                           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                             <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
                             <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
                           </svg>
                           {isPlayingAudio ? 'VOICE SYNTHESIS ACTIVE...' : 'PLAY VOICE'}
                       </button>
                   )}
                </div>
            </div>
          </div>
        ))}
        {/* Thinking / NLP Processing UI */}
        {isThinking && (
            <div className="flex justify-start">
                <div className="flex flex-col space-y-1">
                     <div className="flex space-x-1 items-center p-3 rounded-2xl rounded-tl-none bg-[#111] border border-white/5 w-fit">
                        <div className={`w-1.5 h-1.5 rounded-full ${character.color.replace('text-', 'bg-')} animate-bounce`}></div>
                        <div className={`w-1.5 h-1.5 rounded-full ${character.color.replace('text-', 'bg-')} animate-bounce delay-100`}></div>
                        <div className={`w-1.5 h-1.5 rounded-full ${character.color.replace('text-', 'bg-')} animate-bounce delay-200`}></div>
                    </div>
                    {/* Fake NLP Console Log */}
                    <span className={`text-[9px] font-mono ${character.color} animate-pulse px-1`}>
                        &gt; {processingState}
                    </span>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-[#0a0a0a]/90 backdrop-blur-md border-t border-white/10 relative z-30">
        {selectedImage && (
            <div className="absolute bottom-full left-0 m-4 w-20 h-20 bg-black border border-white/20 rounded-lg overflow-hidden shadow-2xl">
                <img src={selectedImage} className="w-full h-full object-cover opacity-80" />
                <button onClick={() => setSelectedImage(null)} className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full text-white flex items-center justify-center font-bold text-xs">✕</button>
            </div>
        )}
        <div className="flex gap-2 items-end">
          <button onClick={() => fileInputRef.current?.click()} className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all active:scale-95">
             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </button>
          <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
          <div className="flex-1 relative">
             <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                placeholder={`Envie mensagem para ${character.name}...`}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-white/20 focus:bg-white/5 transition-all resize-none h-11 max-h-32 text-sm font-sans"
              />
          </div>
          <button 
            onClick={handleSend}
            disabled={isTyping || isThinking || (!inputText.trim() && !selectedImage)}
            className={`w-11 h-11 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-50 disabled:grayscale ${character.color.replace('text-', 'bg-')} shadow-lg active:scale-95`}
          >
            <svg className="w-5 h-5 translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatScreen;


import React, { useEffect, useRef, useState } from 'react';
import { Character } from '../types';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPCM16Blob, base64ToUint8Array, decodeAudioData } from '../services/audioUtils';
import { saveCallLog } from '../services/historyUtils';

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

// Interface for speech config options
interface ExtendedSpeechConfig {
    voiceConfig?: { prebuiltVoiceConfig?: { voiceName: string } };
    audioEncoding?: string;
    sampleRateHertz?: number;
}

interface CallScreenProps {
  character: Character;
  onHangup: () => void;
}

// Helper for Reverb (same as ChatScreen for consistency)
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

// Helper: Soft Clipper / Saturation Curve for Harmonic Exciter
const makeDistortionCurve = (amount: number) => {
  const k = typeof amount === 'number' ? amount : 50;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    // Classic soft-clipping sigmoid
    curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
  }
  return curve;
};

// Helper: Generate Deterministic Acoustic Profile from Character ID
const getAcousticProfile = (id: string, char: Character) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    const norm = (Math.abs(hash) % 100) / 100;

    // Detect Formant Shift based on Role (Shared logic with ChatScreen)
    const deepKeywords = ['God', 'Titan', 'King', 'Vingador', 'General', 'Captain', 'Emperor', 'Demon', 'Villain'];
    const highKeywords = ['Child', 'Small', 'Cute', 'Maid', 'Slime', 'Princess', 'Fairy', 'Spy'];
    
    let formantShift = 0;
    let pitchShift = 0; // Pitch Shift in Cents

    if (deepKeywords.some(k => char.role.includes(k) || char.name.includes(k))) {
        formantShift = -150; 
        pitchShift = -250;
    }
    if (highKeywords.some(k => char.role.includes(k) || char.name.includes(k))) {
        formantShift = 250; 
        pitchShift = 250;
    }
    
    // Specific Overrides for Experimental Fidelity
    if (char.name.includes('Kratos') || char.name.includes('Sukuna') || char.name.includes('Ainz')) {
        formantShift = -350;
        pitchShift = -600; // Deep rumble
    }
    if (char.name.includes('Anya') || char.name.includes('Pikachu')) {
        formantShift = 450;
        pitchShift = 500;
    }
    if (char.name.includes('Rei') || char.name.includes('Violet')) {
        formantShift = 100;
    }

    // Saturation level (Grit)
    const isDark = deepKeywords.some(k => char.role.includes(k) || char.systemInstruction.includes('Arrogante') || char.systemInstruction.includes('Sombrio'));
    const saturation = isDark ? 40 : 15;

    return {
        bassGain: 2 + (norm * 6), 
        midFreq: 1000 + (norm * 1000), 
        trebleGain: 2 + ((1 - norm) * 4), 
        reverbMix: 0.1 + (norm * 0.1),
        formantShift,
        pitchShift,
        saturation
    };
};

const CallScreen: React.FC<CallScreenProps> = ({ character, onHangup }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [isInterrupted, setIsInterrupted] = useState(false);
  
  const nextStartTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null); 
  const processingInputRef = useRef<AudioNode | null>(null); // Input for the FX chain
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const hasSavedLog = useRef(false);
  const interruptTimeoutRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const ambientLightRef = useRef<HTMLDivElement>(null);

  // Generate full system instruction with custom instructions
  const getFullSystemInstruction = (char: Character) => {
    let instruction = char.systemInstruction;
    // Add emotional prompting to system instruction for real-time expressiveness
    instruction += `\n\n[VOCAL MODULATION PROTOCOL]: Use uma ampla gama de tons emocionais. Se estiver empolgado, fale mais rápido e alto. Se triste, mais devagar. Evite soar monótono. Seja altamente expressivo.`;

    if (char.customInstructions && char.customInstructions.length > 0) {
        instruction += `\n\n[INSTRUÇÕES ADICIONAIS DE PERSONALIDADE/COMPORTAMENTO]:\n${char.customInstructions.join('\n')}`;
    }
    return instruction;
  };
  
  const stopAudio = () => {
    activeSourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
    activeSourcesRef.current.clear();
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        inputAudioContextRef.current.close();
    }
    
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  };

  const handleHangup = () => {
    if (!hasSavedLog.current) {
        saveCallLog(character);
        hasSavedLog.current = true;
    }
    stopAudio();
    onHangup();
  };

  const triggerInterruptionUI = () => {
      setIsInterrupted(true);
      if (interruptTimeoutRef.current) window.clearTimeout(interruptTimeoutRef.current);
      interruptTimeoutRef.current = window.setTimeout(() => setIsInterrupted(false), 2000);
  };

  const drawVisualizer = () => {
      if (!canvasRef.current || !analyserRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);

      // --- Ambient Light Update ---
      // Calculate Volume for Ambient Light
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const avgVolume = sum / bufferLength;

      if (ambientLightRef.current) {
          const scale = 1 + (avgVolume / 255) * 0.6; // Scale up to 1.6x
          const opacity = 0.1 + (avgVolume / 255) * 0.4; // Opacity up to 0.5
          ambientLightRef.current.style.transform = `translate(-50%, -50%) scale(${scale})`;
          ambientLightRef.current.style.opacity = opacity.toFixed(2);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 85; 
      const bars = 80;
      const step = (Math.PI * 2) / bars;

      // Color Parsing Hack for V2
      let strokeColor = '#00f3ff';
      if (character.color.includes('pink')) strokeColor = '#ff0055';
      else if (character.color.includes('purple')) strokeColor = '#bc13fe';
      else if (character.color.includes('orange')) strokeColor = '#ff9900';
      else if (character.color.includes('red')) strokeColor = '#ff2a2a';
      else if (character.color.includes('gray')) strokeColor = '#a0a0a0';
      else if (character.color.includes('blue')) strokeColor = '#60a5fa';

      ctx.lineWidth = 2;
      ctx.lineCap = 'butt';

      for (let i = 0; i < bars; i++) {
          const value = dataArray[i * 2] || 0; 
          const barHeight = (value / 255) * 50; 

          const angle = i * step;
          const x1 = centerX + Math.cos(angle) * (radius);
          const y1 = centerY + Math.sin(angle) * (radius);
          const x2 = centerX + Math.cos(angle) * (radius + barHeight);
          const y2 = centerY + Math.sin(angle) * (radius + barHeight);

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.strokeStyle = strokeColor;
          ctx.globalAlpha = 0.4 + (value / 255) * 0.6;
          ctx.stroke();

          // Inner ring reflection
          const x3 = centerX + Math.cos(angle) * (radius - 5);
          const y3 = centerY + Math.sin(angle) * (radius - 5);
          const x4 = centerX + Math.cos(angle) * (radius - 5 - (barHeight * 0.3));
          const y4 = centerY + Math.sin(angle) * (radius - 5 - (barHeight * 0.3));
          
          ctx.beginPath();
          ctx.moveTo(x3, y3);
          ctx.lineTo(x4, y4);
          ctx.strokeStyle = '#ffffff';
          ctx.globalAlpha = 0.1;
          ctx.stroke();
      }
      ctx.globalAlpha = 1.0;
      animationFrameRef.current = requestAnimationFrame(drawVisualizer);
  };

  useEffect(() => {
    const startCall = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        
        const ctx = new AudioContextClass({ sampleRate: 24000, latencyHint: 'interactive' });
        audioContextRef.current = ctx;

        // --- AUDIO ENHANCEMENT PIPELINE SETUP ---
        const profile = getAcousticProfile(character.id, character);

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.knee.value = 30;
        compressor.ratio.value = 12;

        const lowShelf = ctx.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 150;
        lowShelf.gain.value = profile.bassGain;

        // Formant Filter (Timbre Simulation)
        const formantFilter = ctx.createBiquadFilter();
        formantFilter.type = 'peaking';
        formantFilter.frequency.value = 1000 + profile.formantShift;
        formantFilter.Q.value = 1.0;
        formantFilter.gain.value = Math.abs(profile.formantShift) > 50 ? 5 : 0; 

        const midPeaking = ctx.createBiquadFilter();
        midPeaking.type = 'peaking';
        midPeaking.frequency.value = profile.midFreq;
        midPeaking.Q.value = 0.8;
        midPeaking.gain.value = 2; // Add Presence

        // Harmonic Exciter Nodes (Saturation)
        const exciterHighPass = ctx.createBiquadFilter();
        exciterHighPass.type = 'highpass';
        exciterHighPass.frequency.value = 2000;
        
        const shaper = ctx.createWaveShaper();
        shaper.curve = makeDistortionCurve(profile.saturation);

        const exciterGain = ctx.createGain();
        exciterGain.gain.value = 0.05 + (profile.saturation / 500);

        const highShelf = ctx.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 6000;
        highShelf.gain.value = profile.trebleGain;

        const convolver = ctx.createConvolver();
        // Updated impulse response: 1.5s duration, 2.0 decay for a more spacious hall/studio feel
        convolver.buffer = createImpulseResponse(ctx, 1.5, 2.0); 
        
        // Stereo Widening (Haas Effect)
        const merger = ctx.createChannelMerger(2);
        const stereoDelay = ctx.createDelay();
        stereoDelay.delayTime.value = 0.015;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyserRef.current = analyser;

        // Routing Groups
        const dryGain = ctx.createGain();
        const wetGain = ctx.createGain();
        dryGain.gain.value = 0.8;
        wetGain.gain.value = profile.reverbMix; 

        // Connect Chain (Expanded)
        compressor.connect(lowShelf);
        lowShelf.connect(formantFilter);
        formantFilter.connect(midPeaking);
        midPeaking.connect(highShelf);

        // Exciter Path (Parallel)
        midPeaking.connect(exciterHighPass);
        exciterHighPass.connect(shaper);
        shaper.connect(exciterGain);
        exciterGain.connect(highShelf);

        // Split to FX
        highShelf.connect(dryGain);
        highShelf.connect(convolver);
        convolver.connect(wetGain);

        // Haas Implementation
        dryGain.connect(merger, 0, 0);
        wetGain.connect(merger, 0, 0);
        
        dryGain.connect(stereoDelay);
        wetGain.connect(stereoDelay);
        stereoDelay.connect(merger, 0, 1);

        merger.connect(analyser);
        analyser.connect(ctx.destination);

        // Store input node
        processingInputRef.current = compressor;

        inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
        streamRef.current = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
        });
        
        // Request high fidelity audio configuration
        const speechConfig: ExtendedSpeechConfig = {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: character.voiceName } },
            audioEncoding: "LINEAR16", 
            sampleRateHertz: 24000
        };

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: speechConfig as any,
            generationConfig: { temperature: 1.0, topP: 0.95, maxOutputTokens: 1024 }, // Higher temp for more emotion
            systemInstruction: getFullSystemInstruction(character),
          },
          callbacks: {
            onopen: () => {
              setStatus('connected');
              drawVisualizer();
              if (!inputAudioContextRef.current || !streamRef.current) return;
              const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
              const processor = inputAudioContextRef.current.createScriptProcessor(2048, 1, 1);
              processorRef.current = processor;
              
              // --- NOISE GATE IMPLEMENTATION ---
              processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Calculate RMS (Volume)
                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);

                // Noise Threshold
                if (rms > 0.02) {
                    const pcmBlob = createPCM16Blob(inputData);
                    sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                }
              };
              
              source.connect(processor);
              processor.connect(inputAudioContextRef.current.destination);
            },
            onmessage: async (msg: LiveServerMessage) => {
               if (msg.serverContent?.interrupted) {
                 activeSourcesRef.current.forEach(src => { try { src.stop(); } catch(e){} });
                 activeSourcesRef.current.clear();
                 nextStartTimeRef.current = 0;
                 triggerInterruptionUI();
                 return;
               }
               const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
               if (base64Audio && audioContextRef.current && processingInputRef.current) {
                 const ctx = audioContextRef.current;
                 const now = ctx.currentTime;
                 if (nextStartTimeRef.current < now) nextStartTimeRef.current = now + 0.05;
                 const audioBuffer = await decodeAudioData(base64ToUint8Array(base64Audio), ctx, 24000, 1);
                 
                 const source = ctx.createBufferSource();
                 source.buffer = audioBuffer;
                 
                 // Apply Character Pitch Shift (Detune)
                 source.detune.value = profile.pitchShift;
                 
                 // Connect incoming audio chunks to the enhanced FX chain
                 source.connect(processingInputRef.current);
                 
                 source.onended = () => activeSourcesRef.current.delete(source);
                 source.start(nextStartTimeRef.current);
                 activeSourcesRef.current.add(source);
                 nextStartTimeRef.current += audioBuffer.duration;
               }
            },
            onclose: () => handleHangup(),
            onerror: () => setStatus('error')
          }
        });
      } catch (err) { 
          console.error(err);
          setStatus('error'); 
      }
    };
    startCall();
    return () => {
        if (!hasSavedLog.current) {
            saveCallLog(character);
            hasSavedLog.current = true;
        }
        stopAudio();
    };
  }, [character]);

  return (
    <div className="h-full flex flex-col items-center justify-between bg-[#020202] p-6 relative overflow-hidden">
      
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-20"></div>
      <div className={`absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-${character.color.replace('text-', '')}/10 to-transparent pointer-events-none`}></div>
      
      {/* Ambient Audio Reactive Light */}
      <div 
        ref={ambientLightRef}
        className={`absolute top-1/2 left-1/2 w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none transition-transform duration-75 ease-linear ${character.color.replace('text-', 'bg-')}`}
        style={{ transform: 'translate(-50%, -50%) scale(1)', opacity: 0.1 }}
      />

      {/* Top Status */}
      <div className="z-10 mt-8 w-full flex flex-col items-center">
         <div className={`px-6 py-2 rounded-sm border border-${character.color.replace('text-', '')}/30 bg-black/60 backdrop-blur-md mb-8 transition-all`}>
            <span className={`text-[10px] font-mono font-bold tracking-[0.2em] uppercase flex items-center gap-3 ${status === 'error' ? 'text-red-500' : 'text-gray-300'}`}>
                {status === 'connecting' && <span className={`block w-2 h-2 rounded-full animate-ping ${character.color.replace('text-', 'bg-')}`}/>}
                {status === 'connected' && <span className={`block w-2 h-2 rounded-full ${character.color.replace('text-', 'bg-')} shadow-[0_0_10px_currentColor]`}/>}
                {status === 'connecting' ? 'INITIALIZING UPLINK...' : status === 'error' ? 'CONNECTION LOST' : 'SECURE LINE ACTIVE'}
            </span>
         </div>

         {/* Avatar & Visualizer */}
         <div className="relative w-[320px] h-[320px] flex items-center justify-center">
            <canvas ref={canvasRef} width={320} height={320} className="absolute inset-0 z-0 pointer-events-none opacity-80"/>
            
            {isInterrupted && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 text-red-500 font-black text-4xl tracking-tighter opacity-80 animate-ping">!</div>
            )}

            <div className={`relative w-44 h-44 rounded-full p-1 z-10 transition-all duration-300 ${isInterrupted ? 'grayscale opacity-50 scale-95' : 'scale-100'}`}>
                <img src={character.avatarUrl} alt="avatar" className="w-full h-full rounded-full object-cover border-4 border-black shadow-2xl bg-gray-900" />
                <div className={`absolute inset-0 rounded-full border border-white/20`}></div>
            </div>
         </div>
         
         <div className="text-center mt-8">
            <h2 className={`text-5xl font-bold tracking-tighter drop-shadow-2xl ${character.color} animate-pulse-slow`}>
                {character.name}
            </h2>
            <div className="flex items-center justify-center gap-2 mt-2">
                <span className="w-2 h-2 bg-gray-600 rounded-full"></span>
                <p className="text-gray-500 text-xs font-mono font-medium uppercase tracking-[0.4em]">
                    {character.role}
                </p>
                <span className="w-2 h-2 bg-gray-600 rounded-full"></span>
            </div>
         </div>
      </div>

      {/* Controls */}
      <div className="z-10 w-full flex flex-col items-center gap-6 mb-8">
        <button 
          onClick={handleHangup}
          className="group relative w-20 h-20 rounded-full bg-red-600/90 hover:bg-red-500 flex items-center justify-center transition-all shadow-lg hover:shadow-red-500/40 active:scale-95 border border-red-400/50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-8 h-8">
             <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
        </button>
        <p className="text-[10px] text-gray-600 font-mono">TAP TO DISCONNECT</p>
      </div>
    </div>
  );
};

export default CallScreen;

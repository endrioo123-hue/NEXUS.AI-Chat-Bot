
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Character } from '../types';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPCM16Blob, base64ToUint8Array, decodeAudioData } from '../services/audioUtils';
import { saveCallLog } from '../services/historyUtils';

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
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

// Helper: Generate Deterministic Acoustic Profile from Character ID
const getAcousticProfile = (id: string, char: Character) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    const norm = (Math.abs(hash) % 100) / 100;

    // Detect Formant Shift based on Role (Shared logic with ChatScreen)
    // Expanded list for better anime archetype coverage
    const deepKeywords = [
        'God', 'Titan', 'King', 'Vingador', 'General', 'Captain', 'Emperor', 'Demon', 'Villain', 
        'Dragon', 'Berserker', 'All Might', 'Monster', 'Giant', 'Boss'
    ];
    const highKeywords = [
        'Child', 'Small', 'Cute', 'Maid', 'Slime', 'Princess', 'Fairy', 'Spy', 
        'Spirit', 'Cat', 'Girl', 'Loli', 'Witch', 'Mage'
    ];
    
    let formantShift = 0;
    let pitchShift = 0; // Pitch Shift in Cents

    // Check System Instruction too for better coverage
    const combinedText = (char.role + ' ' + char.systemInstruction).toLowerCase();

    if (deepKeywords.some(k => combinedText.includes(k.toLowerCase()) || char.name.includes(k))) {
        formantShift = -200; 
        pitchShift = -250;
    }
    if (highKeywords.some(k => combinedText.includes(k.toLowerCase()) || char.name.includes(k))) {
        formantShift = 300; 
        pitchShift = 250;
    }
    
    // Specific Overrides for Experimental Fidelity
    if (char.name.includes('Kratos') || char.name.includes('Sukuna') || char.name.includes('Ainz') || char.name.includes('Vader')) {
        formantShift = -400; // Deep chest resonance
        pitchShift = -600; // Deep rumble
    }
    if (char.name.includes('Anya') || char.name.includes('Pikachu') || char.name.includes('Zenitsu')) {
        formantShift = 500; // Head voice resonance
        pitchShift = 500;
    }
    if (char.name.includes('Rei') || char.name.includes('Violet') || char.role.includes('Robot') || char.role.includes('Autômata')) {
        formantShift = 100; // Slight synthetic tightening
        pitchShift = 0;
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
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('connecting');
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [speechSpeed, setSpeechSpeed] = useState(1.0);
  
  // Ref needed to access state inside streaming callback
  const speechSpeedRef = useRef(1.0);
  const isMountedRef = useRef(true);
  const userVolumeRef = useRef(0); // Tracks user mic input volume for visualization

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
  const sessionRef = useRef<any>(null); // Keep track of session to close it properly

  // Update ref when state changes
  useEffect(() => {
    speechSpeedRef.current = speechSpeed;
  }, [speechSpeed]);

  useEffect(() => {
      isMountedRef.current = true;
      return () => { isMountedRef.current = false; };
  }, []);

  // Generate full system instruction with custom instructions
  const getFullSystemInstruction = (char: Character) => {
    let instruction = char.systemInstruction;
    // Add enhanced emotional prompting to system instruction for real-time expressiveness
    instruction += `\n\n[VOCAL PERFORMANCE DIRECTIVE]: You are a high-fidelity voice actor performing as ${char.name}. Vary your pitch, speed, and tone dramatically based on emotion. Whisper when secretive, shout when angry. Do NOT speak monotonously. Act out the role completely.`;

    if (char.customInstructions && char.customInstructions.length > 0) {
        instruction += `\n\n[INSTRUÇÕES ADICIONAIS DE PERSONALIDADE/COMPORTAMENTO]:\n${char.customInstructions.join('\n')}`;
    }
    return instruction;
  };
  
  const stopAudio = useCallback(() => {
    activeSourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
    activeSourcesRef.current.clear();
    
    try {
        processorRef.current?.disconnect();
        processorRef.current = null;
    } catch(e) {}

    try {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    } catch(e) {}
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try { audioContextRef.current.close(); } catch(e) {}
        audioContextRef.current = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        try { inputAudioContextRef.current.close(); } catch(e) {}
        inputAudioContextRef.current = null;
    }
    
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }

    if (sessionRef.current) {
        sessionRef.current = null;
    }
  }, []);

  const handleHangup = useCallback(() => {
    if (!hasSavedLog.current) {
        saveCallLog(character);
        hasSavedLog.current = true;
    }
    stopAudio();
    onHangup();
  }, [character, onHangup, stopAudio]);

  const triggerInterruptionUI = () => {
      if (!isMountedRef.current) return;
      setIsInterrupted(true);
      if (interruptTimeoutRef.current) window.clearTimeout(interruptTimeoutRef.current);
      interruptTimeoutRef.current = window.setTimeout(() => {
          if (isMountedRef.current) setIsInterrupted(false);
      }, 2000);
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

      // Draw Microphone Input Indicator (Inner Glow/Ripple)
      if (userVolumeRef.current > 0.002) {
          const inputScale = 1 + Math.min(userVolumeRef.current * 8, 0.4);
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius * 0.75 * inputScale, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Second Ripple
          if (userVolumeRef.current > 0.05) {
              ctx.beginPath();
              ctx.arc(centerX, centerY, radius * 0.6 * inputScale, 0, Math.PI * 2);
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
              ctx.stroke();
          }
      }

      ctx.globalAlpha = 1.0;
      animationFrameRef.current = requestAnimationFrame(drawVisualizer);
  };

  const connectToGemini = async () => {
    if (status === 'connected') return;
    setStatus('connecting');
    hasSavedLog.current = false;

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        
        // --- AUDIO CONTEXT SETUP ---
        // Use default/native sample rate (usually 44100 or 48000) for higher fidelity effects processing
        const ctx = new AudioContextClass({ latencyHint: 'interactive' });
        audioContextRef.current = ctx;
        
        // Resume context if suspended (common in mobile)
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }

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
        // Dynamic Gain based on shift intensity - deeper/higher shifts get stronger coloring
        formantFilter.gain.value = Math.min(12, Math.abs(profile.formantShift) / 25); 

        const midPeaking = ctx.createBiquadFilter();
        midPeaking.type = 'peaking';
        midPeaking.frequency.value = profile.midFreq;
        midPeaking.Q.value = 0.8;
        midPeaking.gain.value = 2; // Add Presence

        // Harmonic Exciter Nodes (Tube Saturation)
        const exciterHighPass = ctx.createBiquadFilter();
        exciterHighPass.type = 'highpass';
        exciterHighPass.frequency.value = 2000;
        
        const shaper = ctx.createWaveShaper();
        shaper.curve = makeTubeCurve(profile.saturation); // Use Analog Tube Curve

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
            audio: { 
                echoCancellation: true, 
                noiseSuppression: true, 
                autoGainControl: true,
                channelCount: 1, // Force mono to avoid phase issues
            } 
        });
        
        // Use default speech config without audioEncoding/sampleRateHertz for Live API
        const speechConfig = {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: character.voiceName } }
        };

        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: speechConfig,
            generationConfig: { temperature: 1.0, topP: 0.95, maxOutputTokens: 1024 }, // Higher temp for more emotion
            systemInstruction: getFullSystemInstruction(character),
          },
          callbacks: {
            onopen: () => {
              if (isMountedRef.current) {
                  setStatus('connected');
                  drawVisualizer();
              }
              // Force start conversation
              sessionPromise.then(s => s.sendRealtimeInput([{ mimeType: 'text/plain', data: 'O usuário conectou. Cumprimente-o.' }]));
              
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
                userVolumeRef.current = rms; // Update for visualizer

                // Noise Threshold - Lowered to 0.002 to catch quiet speech/whispers
                if (rms > 0.002) {
                    const pcmBlob = createPCM16Blob(inputData);
                    // Optimized sending: use active session ref if available to avoid Promise overhead
                    if (sessionRef.current) {
                        sessionRef.current.sendRealtimeInput({ media: pcmBlob });
                    } else {
                        sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                    }
                }
              };
              
              source.connect(processor);
              processor.connect(inputAudioContextRef.current.destination);
              
              // Store session
              sessionPromise.then(s => sessionRef.current = s);
            },
            onmessage: async (msg: LiveServerMessage) => {
               if (!isMountedRef.current) return;

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
                 
                 // Decode at 24000Hz (Model Rate) - The Context (System Rate) will upsample automatically
                 const audioBuffer = await decodeAudioData(base64ToUint8Array(base64Audio), ctx, 24000, 1);
                 
                 const source = ctx.createBufferSource();
                 source.buffer = audioBuffer;
                 
                 // Apply Character Pitch Shift (Detune)
                 source.detune.value = profile.pitchShift;

                 // Apply Real-time Speech Speed
                 source.playbackRate.value = speechSpeedRef.current;
                 
                 // Connect incoming audio chunks to the enhanced FX chain
                 source.connect(processingInputRef.current);
                 
                 source.onended = () => activeSourcesRef.current.delete(source);
                 source.start(nextStartTimeRef.current);
                 activeSourcesRef.current.add(source);
                 
                 // Adjust next start time based on playback rate
                 nextStartTimeRef.current += audioBuffer.duration / speechSpeedRef.current;
               }
            },
            onclose: () => {
                // DO NOT HANGUP AUTOMATICALLY. Allow user to retry.
                console.log("Connection closed by server.");
                if (isMountedRef.current) {
                    stopAudio();
                    setStatus('disconnected');
                }
            },
            onerror: (err) => {
                console.error("Connection error:", err);
                if (isMountedRef.current) {
                    stopAudio();
                    setStatus('error');
                }
            }
          }
        });
      } catch (err) { 
          console.error(err);
          if (isMountedRef.current) setStatus('error');
      }
  };

  useEffect(() => {
    connectToGemini();
    return () => {
        if (!hasSavedLog.current && status === 'connected') {
            saveCallLog(character);
        }
        stopAudio();
    };
  }, [character]); // Re-connect only if character changes

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
            <span className={`text-[10px] font-mono font-bold tracking-[0.2em] uppercase flex items-center gap-3 ${status === 'error' || status === 'disconnected' ? 'text-red-500' : 'text-gray-300'}`}>
                {status === 'connecting' && <span className={`block w-2 h-2 rounded-full animate-ping ${character.color.replace('text-', 'bg-')}`}/>}
                {status === 'connected' && <span className={`block w-2 h-2 rounded-full ${character.color.replace('text-', 'bg-')} shadow-[0_0_10px_currentColor]`}/>}
                
                {status === 'connecting' ? 'INITIALIZING UPLINK...' : 
                 status === 'connected' ? 'SECURE LINE ACTIVE' : 
                 status === 'disconnected' ? 'UPLINK SEVERED' : 'CONNECTION ERROR'}
            </span>
         </div>

         {/* Avatar & Visualizer */}
         <div className="relative w-[320px] h-[320px] flex items-center justify-center">
            <canvas ref={canvasRef} width={320} height={320} className="absolute inset-0 z-0 pointer-events-none opacity-80"/>
            
            {isInterrupted && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 text-red-500 font-black text-4xl tracking-tighter opacity-80 animate-ping">!</div>
            )}

            <div className={`relative w-44 h-44 rounded-full p-1 z-10 transition-all duration-300 ${isInterrupted || status !== 'connected' ? 'grayscale opacity-50 scale-95' : 'scale-100'}`}>
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
        
        {/* Connection Error Action */}
        {(status === 'error' || status === 'disconnected') && (
            <button 
                onClick={connectToGemini}
                className="px-6 py-3 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-white font-mono text-xs tracking-widest uppercase transition-all flex items-center gap-2 mb-2 animate-pulse"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                RE-ESTABLISH CONNECTION
            </button>
        )}

        {/* Speed Control Slider (Live) - Only show when connected */}
        {status === 'connected' && (
            <div className="flex flex-col items-center bg-black/40 rounded px-4 py-2 border border-white/5 backdrop-blur-sm">
                <label className="text-[8px] font-mono text-gray-500 tracking-widest mb-1">LIVE SPEED: {speechSpeed.toFixed(1)}x</label>
                <input 
                    type="range" 
                    min="0.5" 
                    max="2.0" 
                    step="0.1" 
                    value={speechSpeed} 
                    onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
                    className="w-32 h-1 accent-white bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
            </div>
        )}

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

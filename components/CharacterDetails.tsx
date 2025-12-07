import React from 'react';
import { Character } from '../types';

interface CharacterDetailsProps {
  character: Character;
  onBack: () => void;
}

const CharacterDetails: React.FC<CharacterDetailsProps> = ({ character, onBack }) => {
  const bgClass = character.color.replace('text-', 'bg-');
  const borderClass = character.color.replace('text-', 'border-');

  return (
    <div className="flex flex-col h-full bg-anime-bg relative overflow-y-auto custom-scrollbar">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
         <div className="absolute top-0 right-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
         <img 
            src={character.avatarUrl} 
            className="absolute top-0 left-0 w-full h-1/2 object-cover opacity-10 blur-xl mask-image-gradient" 
         />
         <div className={`absolute -bottom-20 -left-20 w-80 h-80 rounded-full blur-[100px] opacity-10 ${bgClass}`}></div>
      </div>

      {/* Header */}
      <div className="relative z-20 px-6 py-4 flex items-center justify-between bg-black/60 backdrop-blur-md border-b border-white/5 shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors group">
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/5 group-hover:bg-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
            </div>
            <span className="font-mono text-xs tracking-widest uppercase">VOLTAR</span>
        </button>
        <h2 className="font-bold text-lg text-white tracking-widest uppercase flex items-center gap-2">
            DATABASE
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${borderClass} ${character.color} bg-black/50`}>
                ID: {character.id.substring(0, 8)}...
            </span>
        </h2>
      </div>

      <div className="flex-1 p-6 relative z-10 flex flex-col gap-6 max-w-3xl mx-auto w-full">
        
        {/* Profile Header */}
        <div className="flex flex-col md:flex-row gap-6 items-center md:items-start bg-white/5 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
            <div className={`relative w-32 h-32 rounded-xl p-1 ${bgClass} shadow-[0_0_30px_rgba(0,0,0,0.5)]`}>
                <img src={character.avatarUrl} alt={character.name} className="w-full h-full rounded-lg object-cover bg-black" />
                <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20"></div>
            </div>
            
            <div className="flex-1 text-center md:text-left space-y-2">
                <h1 className={`text-4xl font-bold font-mono tracking-tighter ${character.color} drop-shadow-md`}>
                    {character.name}
                </h1>
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                    <span className="px-3 py-1 bg-white/10 rounded text-xs font-mono uppercase tracking-wider text-white border border-white/10">
                        {character.role}
                    </span>
                    <span className="px-3 py-1 bg-white/10 rounded text-xs font-mono uppercase tracking-wider text-gray-400 border border-white/10 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                          <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
                          <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
                        </svg>
                        Voice: {character.voiceName}
                    </span>
                </div>
            </div>
        </div>

        {/* System Instruction Viewer */}
        <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
                <div className={`w-2 h-2 rounded-full ${bgClass}`}></div>
                <h3 className="text-xs font-mono text-gray-400 uppercase tracking-widest">Neural Programming (System Prompt)</h3>
            </div>
            <div className="bg-[#0a0a0a] border border-white/10 rounded-lg p-4 font-mono text-xs text-gray-300 leading-relaxed overflow-x-auto relative group">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] bg-white/10 px-2 py-1 rounded text-gray-500">READ-ONLY</span>
                </div>
                <pre className="whitespace-pre-wrap">{character.systemInstruction}</pre>
            </div>
        </div>

        {/* Custom Instructions Viewer */}
        {character.customInstructions && character.customInstructions.length > 0 && (
            <div className="space-y-2 pb-10">
                <div className="flex items-center gap-2 px-1">
                    <div className={`w-2 h-2 rounded-full ${bgClass}`}></div>
                    <h3 className="text-xs font-mono text-gray-400 uppercase tracking-widest">Behavioral Modules (Custom Instructions)</h3>
                </div>
                <div className="grid gap-2">
                    {character.customInstructions.map((inst, idx) => (
                        <div key={idx} className="bg-[#0a0a0a] border border-white/10 rounded p-3 flex gap-3 items-start">
                             <span className={`font-mono text-[10px] ${character.color} opacity-70 mt-0.5`}>
                                 {(idx + 1).toString().padStart(2, '0')}
                             </span>
                             <p className="font-mono text-xs text-gray-400">{inst}</p>
                        </div>
                    ))}
                </div>
            </div>
        )}

      </div>
      
      <style>{`
        .mask-image-gradient {
            mask-image: linear-gradient(to bottom, black 0%, transparent 100%);
        }
      `}</style>
    </div>
  );
};

export default CharacterDetails;
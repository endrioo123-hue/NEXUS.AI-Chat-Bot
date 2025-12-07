
import React, { useMemo, useState } from 'react';
import { Character } from '../types';

interface CharacterCardProps {
  character: Character;
  isSelected: boolean;
  onClick: () => void;
  onEdit?: (character: Character) => void;
  onDelete?: (id: string) => void;
  onViewDetails?: (character: Character) => void;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ character, isSelected, onClick, onEdit, onDelete, onViewDetails }) => {
  const [copied, setCopied] = useState(false);
  
  const borderClass = character.color.replace('text-', 'border-');
  const bgClass = character.color.replace('text-', 'bg-');
  const isCustom = character.id.startsWith('custom_');
  
  // Extrai "Traits" baseados nas customInstructions (Visual Hack)
  // Pega a primeira palavra entre colchetes das instruções, ex: CORE_ARCH, NLP_ANALYSIS
  const traits = character.customInstructions?.slice(0, 3).map(inst => {
     const match = inst.match(/\[(.*?)\]/);
     return match ? match[1] : 'SYSTEM';
  }) || ['AI_CORE', 'NEURAL_NET'];

  // Calculate a deterministic Sync Rate based on Character ID
  const syncRate = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < character.id.length; i++) {
        hash = character.id.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Map hash to 85-99 range
    return 85 + (Math.abs(hash) % 15);
  }, [character.id]);

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `${character.name} - ${character.role}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      onClick={onClick}
      className={`
        relative p-4 mb-4 cursor-pointer transition-all duration-500 rounded-xl overflow-hidden group
        ${isSelected 
          ? `bg-white/5 border-l-4 ${borderClass} shadow-lg translate-x-2` 
          : 'bg-black/40 border-l-4 border-white/5 hover:bg-white/5 hover:translate-x-1'
        }
      `}
    >
      {/* Tech Background Lines */}
      {isSelected && (
        <div className="absolute inset-0 z-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')]"></div>
      )}

      <div className="flex items-start gap-4 relative z-10">
        {/* Avatar Container */}
        <div className={`
          relative w-16 h-16 md:w-20 md:h-20 rounded-lg p-0.5 transition-all duration-500 overflow-hidden shrink-0
          ${isSelected ? 'ring-2 ring-white/20 shadow-xl' : 'grayscale group-hover:grayscale-0'}
        `}>
            <div className={`absolute inset-0 bg-gradient-to-tr from-transparent to-white/10 opacity-50`}></div>
            <img 
              src={character.avatarUrl} 
              alt={character.name}
              className={`w-full h-full rounded-md object-cover bg-gray-900 transition-transform duration-700 ${isSelected ? 'animate-breathing' : 'scale-100 group-hover:scale-110'}`}
            />
            {isSelected && (
               <div className={`absolute bottom-0 left-0 w-full h-1 ${bgClass} animate-pulse`}></div>
            )}
        </div>
        
        {/* Info & Stats */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <div>
                <h3 className={`font-mono font-bold text-xl leading-none tracking-tighter ${isSelected ? character.color : 'text-gray-300'}`}>
                {character.name}
                </h3>
                <p className="text-[10px] text-gray-500 font-mono tracking-widest uppercase mt-1 truncate">
                    {character.role}
                </p>
            </div>
            {isSelected && (
                <div className="text-right">
                    <span className="text-[9px] font-mono text-gray-500 block">SYNC RATE</span>
                    <span className={`text-lg font-mono leading-none ${character.color}`}>{syncRate}%</span>
                </div>
            )}
          </div>
          
          {/* Trait Chips (RPG Style) */}
          <div className="flex flex-wrap gap-1.5 mt-3">
             {traits.map((trait, i) => (
                 <span key={i} className={`
                    text-[8px] font-mono px-1.5 py-0.5 rounded border border-white/10 uppercase tracking-wider
                    ${isSelected ? 'bg-white/5 text-gray-300' : 'bg-black/20 text-gray-600'}
                 `}>
                    {trait}
                 </span>
             ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className={`absolute top-2 right-2 flex gap-2 transition-opacity duration-300 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
           
           {/* Share Button with Feedback */}
           <button 
              onClick={handleShare}
              className={`p-1.5 rounded transition-all border border-white/10 ${copied ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-black/60 hover:bg-white/20 text-gray-400 hover:text-white'}`}
              title={copied ? "Copiado!" : "Compartilhar"}
           >
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
              )}
           </button>

           {/* Info Button - For All Characters */}
           {onViewDetails && (
             <button 
                onClick={(e) => { e.stopPropagation(); onViewDetails(character); }}
                className="p-1.5 rounded bg-black/60 hover:bg-white/20 text-gray-400 hover:text-white transition-all border border-white/10"
                title="Ver Detalhes"
             >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
             </button>
           )}

           {/* Edit/Delete - For Custom Characters */}
           {isCustom && onEdit && (
             <button 
                onClick={(e) => { e.stopPropagation(); onEdit(character); }}
                className="p-1.5 rounded bg-black/60 hover:bg-white/20 text-gray-400 hover:text-white transition-all border border-white/10"
                title="Editar Persona"
             >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                </svg>
             </button>
           )}
           {isCustom && onDelete && (
             <button 
                onClick={(e) => { e.stopPropagation(); onDelete(character.id); }}
                className="p-1.5 rounded bg-black/60 hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-all border border-white/10 hover:border-red-500/50"
                title="Deletar Persona"
             >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
             </button>
           )}
      </div>
    </div>
  );
};

export default CharacterCard;

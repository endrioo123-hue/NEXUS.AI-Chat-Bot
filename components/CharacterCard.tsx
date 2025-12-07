
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
  const [isHovered, setIsHovered] = useState(false);
  
  // Extrai cor base sem o prefixo 'text-' para uso em bordas/bgs
  const colorBase = character.color.replace('text-', '');
  const isCustom = character.id.startsWith('custom_');
  
  // Extrai "Traits" para visualização HUD
  const traits = character.customInstructions?.slice(0, 2).map(inst => {
     const match = inst.match(/\[(.*?)\]/);
     return match ? match[1] : null;
  }).filter(Boolean) || ['SYSTEM', 'LINK'];

  // Sync Rate determinístico
  const syncRate = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < character.id.length; i++) {
        hash = character.id.charCodeAt(i) + ((hash << 5) - hash);
    }
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        group relative w-full mb-3 cursor-pointer overflow-hidden rounded-xl border
        transition-all duration-300 ease-out select-none
        ${isSelected 
          ? `bg-white/5 border-${colorBase}/50 shadow-[0_0_15px_rgba(0,0,0,0.3)] translate-x-2` 
          : 'bg-black/40 border-white/5 hover:border-white/20 hover:bg-white/5 hover:-translate-y-0.5'
        }
      `}
    >
      {/* Dynamic Background Gradient (Selected State) */}
      <div 
        className={`absolute inset-0 transition-opacity duration-500 pointer-events-none 
        ${isSelected ? 'opacity-100' : 'opacity-0'}
        bg-gradient-to-r from-${colorBase}/10 via-transparent to-transparent`} 
      />

      {/* Active Indicator Bar */}
      <div className={`
        absolute left-0 top-0 bottom-0 w-1 transition-all duration-300
        ${isSelected ? `bg-${colorBase} shadow-[0_0_10px_currentColor]` : 'bg-transparent w-0'}
      `} />

      <div className="flex items-center gap-4 p-3 relative z-10">
        
        {/* Avatar Section */}
        <div className="relative shrink-0">
            {/* Rotating Ring / Glow */}
            <div className={`
                absolute -inset-1 rounded-full border border-dashed transition-all duration-700
                ${isSelected ? `border-${colorBase} rotate-180 opacity-100` : `border-white/10 rotate-0 opacity-0 group-hover:opacity-30`}
            `}></div>
            
            <div className={`
                relative w-14 h-14 md:w-16 md:h-16 rounded-lg overflow-hidden transition-all duration-300
                ${isSelected ? 'ring-2 ring-white/10' : 'grayscale group-hover:grayscale-0'}
            `}>
                <img 
                  src={character.avatarUrl} 
                  alt={character.name}
                  className={`w-full h-full object-cover transition-transform duration-700 ease-in-out ${isSelected ? 'scale-110' : 'scale-100 group-hover:scale-110'}`}
                  onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/150/000000/FFFFFF/?text=ERROR'; }}
                />
                
                {/* Audio Viz Overlay (Fake) */}
                {isSelected && (
                    <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-center gap-0.5 pb-1">
                        <div className={`w-0.5 h-2 bg-${colorBase} animate-pulse`}></div>
                        <div className={`w-0.5 h-3 bg-${colorBase} animate-pulse delay-75`}></div>
                        <div className={`w-0.5 h-1.5 bg-${colorBase} animate-pulse delay-150`}></div>
                    </div>
                )}
            </div>
        </div>

        {/* Info Section */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className={`font-mono font-bold text-lg md:text-xl leading-none tracking-tight transition-colors duration-300 ${isSelected ? character.color : 'text-gray-200 group-hover:text-white'}`}>
                        {character.name}
                    </h3>
                    <p className="text-[10px] md:text-xs text-gray-500 font-mono tracking-widest uppercase mt-1 truncate max-w-[140px] md:max-w-[200px]">
                        {character.role}
                    </p>
                </div>
                
                {/* Sync Rate Badge */}
                <div className={`flex flex-col items-end transition-opacity duration-300 ${isSelected || isHovered ? 'opacity-100' : 'opacity-0 md:opacity-40'}`}>
                    <div className="flex items-center gap-1">
                         <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? `bg-${colorBase} animate-pulse` : 'bg-gray-600'}`}></span>
                         <span className={`text-xs font-mono font-bold ${isSelected ? character.color : 'text-gray-600'}`}>
                             {syncRate}%
                         </span>
                    </div>
                    <span className="text-[8px] text-gray-700 font-mono uppercase tracking-wider">SYNC</span>
                </div>
            </div>

            {/* Trait Tags */}
            <div className="flex items-center gap-2 mt-2">
                {traits.map((trait, i) => (
                    <span key={i} className={`
                        text-[8px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider transition-colors duration-300
                        ${isSelected 
                            ? `bg-${colorBase}/10 border-${colorBase}/20 text-${colorBase}` 
                            : 'bg-black/20 border-white/5 text-gray-500 group-hover:border-white/10'
                        }
                    `}>
                        {trait}
                    </span>
                ))}
            </div>
        </div>
      </div>

      {/* Floating Action Bar - Slide In on Hover/Select */}
      <div className={`
        absolute top-2 right-2 flex flex-col gap-1.5 transition-all duration-300 ease-out z-20
        ${isSelected || isHovered ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0 pointer-events-none'}
      `}>
          {/* Share */}
          <ActionButton 
            onClick={handleShare} 
            active={copied}
            color={copied ? 'text-green-400 border-green-500/50 bg-green-900/20' : 'text-gray-400 hover:text-white border-white/10 hover:bg-white/10'}
          >
             {copied ? (
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
             ) : (
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" /></svg>
             )}
          </ActionButton>

          {/* Details */}
          {onViewDetails && (
              <ActionButton 
                onClick={(e) => { e.stopPropagation(); onViewDetails(character); }}
                color="text-gray-400 hover:text-blue-400 border-white/10 hover:border-blue-500/30 hover:bg-blue-500/10"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </ActionButton>
          )}

          {/* Edit (Custom Only) */}
          {isCustom && onEdit && (
              <ActionButton 
                onClick={(e) => { e.stopPropagation(); onEdit(character); }}
                color="text-gray-400 hover:text-yellow-400 border-white/10 hover:border-yellow-500/30 hover:bg-yellow-500/10"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
              </ActionButton>
          )}

          {/* Delete (Custom Only) */}
          {isCustom && onDelete && (
              <ActionButton 
                onClick={(e) => { e.stopPropagation(); onDelete(character.id); }}
                color="text-gray-400 hover:text-red-500 border-white/10 hover:border-red-500/30 hover:bg-red-500/10"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </ActionButton>
          )}
      </div>

    </div>
  );
};

// Helper sub-component for buttons
const ActionButton: React.FC<{ onClick: (e: React.MouseEvent) => void; children: React.ReactNode; color: string; active?: boolean }> = ({ onClick, children, color, active }) => (
    <button 
        onClick={onClick}
        className={`p-1.5 rounded-lg border backdrop-blur-sm transition-all duration-200 active:scale-95 ${color}`}
    >
        {children}
    </button>
);

export default CharacterCard;

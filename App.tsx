
import React, { useState, useEffect, useMemo } from 'react';
import { AppScreen, Character } from './types';
import CharacterCard from './components/CharacterCard';
import ChatScreen from './components/ChatScreen';
import CallScreen from './components/CallScreen';
import HistoryScreen from './components/HistoryScreen';
import CharacterCreator from './components/CharacterCreator';
import CharacterDetails from './components/CharacterDetails';
import { getAllCharacters, deleteCharacter } from './services/characterService';

// Overlay Component for CRT Effect
const Overlay: React.FC = () => (
    <div className="absolute inset-0 z-50 pointer-events-none rounded-none sm:rounded-[2.5rem] overflow-hidden">
        <div className="scanlines"></div>
        <div className="vignette"></div>
        {/* High-tech corners - Visible only on Desktop/Framed mode */}
        <div className="hidden sm:block absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-white/20 rounded-tl-lg"></div>
        <div className="hidden sm:block absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-white/20 rounded-tr-lg"></div>
        <div className="hidden sm:block absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-white/20 rounded-bl-lg"></div>
        <div className="hidden sm:block absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-white/20 rounded-br-lg"></div>
    </div>
);

const App: React.FC = () => {
  const [screen, setScreen] = useState<AppScreen>(AppScreen.HOME);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharId, setSelectedCharId] = useState<string>('');
  const [interactionMode, setInteractionMode] = useState<'CHAT' | 'CALL'>('CHAT');
  const [editingChar, setEditingChar] = useState<Character | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');

  // Carrega personagens ao iniciar
  useEffect(() => {
    const chars = getAllCharacters();
    setCharacters(chars);
    if (chars.length > 0 && !selectedCharId) {
        setSelectedCharId(chars[0].id);
    }
  }, []);

  const refreshCharacters = () => {
      const chars = getAllCharacters();
      setCharacters(chars);
      // Mantém a seleção se possível, senão seleciona o primeiro
      if (!chars.find(c => c.id === selectedCharId)) {
        if (chars.length > 0) setSelectedCharId(chars[0].id);
      }
  };

  const handleDeleteCharacter = (id: string) => {
    if (window.confirm("CONFIRM DELETION? This action cannot be undone.")) {
        deleteCharacter(id);
        refreshCharacters();
        // Se deletou o selecionado, reseta a seleção
        if (id === selectedCharId) {
            const remaining = getAllCharacters();
            if (remaining.length > 0) setSelectedCharId(remaining[0].id);
        }
    }
  };

  const handleEditCharacter = (char: Character) => {
      setEditingChar(char);
      setScreen(AppScreen.CREATOR);
  };

  const handleViewDetails = (char: Character) => {
      // Ensure the character being viewed is selected
      setSelectedCharId(char.id);
      setScreen(AppScreen.DETAILS);
  };

  const activeCharacter = characters.find(c => c.id === selectedCharId) || characters[0];
  const charColorClass = activeCharacter?.color.replace('text-', '') || 'gray-500';

  // Filter Logic
  const filteredCharacters = useMemo(() => {
      if (!searchTerm) return characters;
      const lower = searchTerm.toLowerCase();
      return characters.filter(c => 
          c.name.toLowerCase().includes(lower) || 
          c.role.toLowerCase().includes(lower) ||
          c.systemInstruction.toLowerCase().includes(lower)
      );
  }, [characters, searchTerm]);

  const renderContent = () => {
    if (!activeCharacter && screen !== AppScreen.CREATOR) return <div className="p-10 text-center">Carregando módulos...</div>;

    switch (screen) {
      case AppScreen.CHAT:
        return <ChatScreen character={activeCharacter} onBack={() => setScreen(AppScreen.HOME)} />;
      case AppScreen.CALL:
        return <CallScreen character={activeCharacter} onHangup={() => setScreen(AppScreen.HOME)} />;
      case AppScreen.HISTORY:
        return <HistoryScreen onBack={() => setScreen(AppScreen.HOME)} />;
      case AppScreen.CREATOR:
        return <CharacterCreator 
          onBack={() => setScreen(AppScreen.HOME)} 
          onSave={() => { refreshCharacters(); setScreen(AppScreen.HOME); }} 
          initialData={editingChar}
        />;
      case AppScreen.DETAILS:
        return <CharacterDetails character={activeCharacter} onBack={() => setScreen(AppScreen.HOME)} />;
      case AppScreen.HOME:
      default:
        return (
          <div className="flex flex-col h-full p-6 overflow-hidden relative">
            {/* Dynamic Ambient Background */}
            <div className="absolute inset-0 z-0 overflow-hidden">
                 <img 
                    src={activeCharacter.avatarUrl} 
                    className="w-full h-full object-cover opacity-10 blur-xl scale-125 transition-all duration-1000 ease-in-out" 
                 />
                 <div className="absolute inset-0 bg-gradient-to-t from-[#020202] via-[#050505]/90 to-[#020202]/50"></div>
                 {/* Floating Particles/Orbs */}
                 <div className={`absolute top-20 right-[-20%] w-64 h-64 bg-${charColorClass} opacity-10 rounded-full blur-[80px] animate-pulse`}></div>
                 <div className={`absolute bottom-[-10%] left-[-10%] w-80 h-80 bg-${charColorClass} opacity-5 rounded-full blur-[100px] animate-float`}></div>
            </div>

            <header className="mb-4 pt-6 flex justify-between items-start relative z-10">
              <div>
                <h1 className="text-4xl font-mono font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 tracking-tighter drop-shadow-md">
                    NEXUS<span className={`text-${charColorClass}`}>.AI</span>
                </h1>
                <p className="text-gray-500 text-[10px] mt-1 font-mono tracking-[0.3em] uppercase">
                    Neural Link Established
                </p>
              </div>
              <button 
                onClick={() => setScreen(AppScreen.HISTORY)}
                className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-300 hover:bg-white/10 hover:text-white transition-all backdrop-blur-md"
              >
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                 </svg>
              </button>
            </header>

            {/* Library Search */}
            <div className="relative z-10 mb-4">
               <div className="relative group">
                  <div className={`absolute inset-0 bg-${charColorClass} opacity-20 blur-md rounded-xl transition-opacity group-focus-within:opacity-40`}></div>
                  <input 
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Pesquisar Identidade..."
                      className="relative w-full bg-black/60 border border-white/10 rounded-xl px-10 py-3 text-sm text-white focus:outline-none focus:border-white/30 placeholder-gray-500 font-mono tracking-wide backdrop-blur-md transition-all"
                  />
                  <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {searchTerm && (
                      <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                          ✕
                      </button>
                  )}
               </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar relative z-10 pb-4 pr-1 space-y-3 mask-image-gradient">
              {filteredCharacters.map(char => (
                <CharacterCard
                  key={char.id}
                  character={char}
                  isSelected={selectedCharId === char.id}
                  onClick={() => setSelectedCharId(char.id)}
                  onEdit={handleEditCharacter}
                  onDelete={handleDeleteCharacter}
                  onViewDetails={handleViewDetails}
                />
              ))}
              
              {/* Add New Character Button (Only show if not searching or if search yields nothing) */}
              {!searchTerm && (
                  <button 
                    onClick={() => { setEditingChar(undefined); setScreen(AppScreen.CREATOR); }}
                    className="w-full p-4 rounded-xl border-2 border-dashed border-white/10 hover:border-white/30 bg-white/5 hover:bg-white/10 transition-all group flex items-center justify-center gap-3 cursor-pointer"
                  >
                     <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                     </div>
                     <span className="font-mono text-xs uppercase tracking-widest text-gray-400 group-hover:text-white">NOVA IDENTIDADE</span>
                  </button>
              )}
              {filteredCharacters.length === 0 && (
                  <div className="text-center py-10 opacity-50">
                      <p className="font-mono text-xs text-white">NENHUM RESULTADO ENCONTRADO</p>
                  </div>
              )}
            </div>

            {/* Bottom Interaction Control Center */}
            <div className="mt-4 flex flex-col gap-4 relative z-10">
               
               {/* Mode Switcher */}
               <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/10 backdrop-blur-md relative overflow-hidden">
                   <div 
                     className={`
                       absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] rounded-xl bg-white/10 border border-white/10 shadow-lg transition-all duration-300 ease-out
                       ${interactionMode === 'CALL' ? 'translate-x-[calc(100%+6px)]' : 'translate-x-0'}
                     `} 
                   />
                   
                   <button 
                     onClick={() => setInteractionMode('CHAT')}
                     className={`flex-1 py-3 text-xs md:text-sm font-mono font-bold tracking-widest uppercase transition-colors relative z-10 flex items-center justify-center gap-2 ${interactionMode === 'CHAT' ? 'text-white' : 'text-gray-500'}`}
                   >
                     TEXT_MODE
                   </button>
                   
                   <button 
                     onClick={() => setInteractionMode('CALL')}
                     className={`flex-1 py-3 text-xs md:text-sm font-mono font-bold tracking-widest uppercase transition-colors relative z-10 flex items-center justify-center gap-2 ${interactionMode === 'CALL' ? 'text-white' : 'text-gray-500'}`}
                   >
                     VOICE_MODE
                   </button>
               </div>

               {/* Main Action Button */}
               <button 
                 onClick={() => setScreen(interactionMode === 'CHAT' ? AppScreen.CHAT : AppScreen.CALL)}
                 className={`
                   w-full py-5 rounded-2xl font-mono font-black text-xl tracking-widest text-white shadow-xl transition-all active:scale-95 group relative overflow-hidden flex items-center justify-center gap-3 border border-white/10
                   ${interactionMode === 'CHAT' 
                     ? `bg-gradient-to-r from-gray-800 to-gray-900 shadow-lg hover:border-${charColorClass}` 
                     : `bg-gradient-to-r from-${charColorClass} to-black shadow-bloom-${charColorClass.replace('neon-', '')}`
                   }
                 `}
                 style={{
                    // Fallback explicit styles for dynamic tailwind colors
                    background: interactionMode === 'CALL' ? undefined : undefined
                 }}
               >
                 <div className="absolute top-0 -left-[100%] w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent group-hover:animate-[shimmer_1s_infinite]" />
                 <span className={`relative z-10 flex items-center gap-3 ${interactionMode === 'CHAT' ? `text-${charColorClass}` : 'text-white'}`}>
                    {interactionMode === 'CHAT' ? 'INITIALIZE CHAT' : 'ESTABLISH UPLINK'}
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                 </span>
               </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="h-screen w-screen bg-[#050505] flex items-center justify-center font-sans selection:bg-white/20 selection:text-white">
      {/* Modern App Container - Responsive for Mobile (No Frame) vs Desktop (Framed) */}
      <div className="w-full h-full sm:max-w-[420px] sm:h-[880px] bg-[#020202] relative sm:rounded-[3rem] overflow-hidden sm:shadow-2xl sm:border-[4px] sm:border-[#1a1a1a] sm:ring-1 sm:ring-black border-none shadow-none rounded-none">
         <Overlay />
         <div className="h-full relative text-white">
            {renderContent()}
         </div>
      </div>
      <style>{`
        @keyframes shimmer {
            0% { transform: translateX(0%); }
            100% { transform: translateX(200%); }
        }
        .mask-image-gradient {
            mask-image: linear-gradient(to bottom, black 90%, transparent 100%);
        }
      `}</style>
    </div>
  );
};

export default App;

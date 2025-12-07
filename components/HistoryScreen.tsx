
import React, { useEffect, useState } from 'react';
import { CallLog } from '../types';
import { getHistory, clearHistory, getAllChatSessions, clearChatHistory } from '../services/historyUtils';
import { getAllCharacters } from '../services/characterService';

interface HistoryScreenProps {
  onBack: () => void;
}

type Tab = 'CALLS' | 'CHATS';

const HistoryScreen: React.FC<HistoryScreenProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<Tab>('CALLS');
  const [callHistory, setCallHistory] = useState<CallLog[]>([]);
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);

  useEffect(() => {
    setCharacters(getAllCharacters());
    loadData();
  }, [activeTab]);

  const loadData = () => {
      setCallHistory(getHistory());
      setChatSessions(getAllChatSessions());
  };

  const handleClearCalls = () => {
    if (confirm('Tem certeza que deseja apagar todo o histórico de chamadas?')) {
      clearHistory();
      setCallHistory([]);
    }
  };

  const handleDeleteChat = (charId: string) => {
      if (confirm('Apagar permanentemente a memória deste chat?')) {
          clearChatHistory(charId);
          loadData();
      }
  };

  const getCharInfo = (id: string) => {
      const char = characters.find(c => c.id === id);
      return char || { name: 'Desconhecido', avatarUrl: 'https://via.placeholder.com/50', color: 'text-gray-500' };
  };

  return (
    <div className="flex flex-col h-full bg-anime-bg relative">
      {/* Background FX */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-neon-purple/10 rounded-full blur-[80px]" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-neon-blue/10 rounded-full blur-[80px]" />
      </div>

      {/* Header */}
      <div className="relative z-20 px-6 py-4 bg-white/5 backdrop-blur-md border-b border-white/5 shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-4">
            <button 
            onClick={onBack} 
            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            </button>
            <h2 className="font-bold text-lg text-white tracking-widest uppercase">Arquivos</h2>
        </div>
        
        {/* Tab Switcher */}
        <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
            <button 
                onClick={() => setActiveTab('CALLS')}
                className={`px-3 py-1 rounded text-[10px] font-mono font-bold tracking-wider transition-all ${activeTab === 'CALLS' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
                VOICE LOGS
            </button>
            <button 
                onClick={() => setActiveTab('CHATS')}
                className={`px-3 py-1 rounded text-[10px] font-mono font-bold tracking-wider transition-all ${activeTab === 'CHATS' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
                MEMORY CORE
            </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 relative z-10 custom-scrollbar">
        
        {/* CALLS TAB */}
        {activeTab === 'CALLS' && (
            <>
                {callHistory.length > 0 && (
                    <div className="flex justify-end mb-2">
                         <button onClick={handleClearCalls} className="text-[10px] text-red-400 hover:text-white underline">LIMPAR TODOS</button>
                    </div>
                )}
                {callHistory.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-gray-500 opacity-60">
                    <p className="text-sm font-light tracking-wide">Nenhuma chamada registrada</p>
                </div>
                ) : (
                callHistory.map((log) => (
                    <div key={log.id} className="flex items-center gap-4 p-4 bg-white/5 border border-white/5 hover:border-white/20 rounded-xl transition-all hover:bg-white/10 group">
                    <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-tr from-gray-700 to-gray-600 group-hover:from-neon-blue group-hover:to-neon-purple transition-colors">
                        <img src={log.characterAvatar} alt={log.characterName} className="w-full h-full rounded-full object-cover bg-black" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-white text-sm">{log.characterName}</h3>
                        <p className="text-xs text-neon-blue font-mono mt-1">VOICE CALL • {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-gray-400 font-mono">
                            {new Date(log.timestamp).toLocaleDateString()}
                        </p>
                    </div>
                    </div>
                ))
                )}
            </>
        )}

        {/* CHATS TAB */}
        {activeTab === 'CHATS' && (
            <>
                {chatSessions.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-gray-500 opacity-60">
                    <p className="text-sm font-light tracking-wide">Nenhuma memória de chat encontrada</p>
                </div>
                ) : (
                chatSessions.map((session) => {
                    const char = getCharInfo(session.characterId);
                    const colorClass = char.color.replace('text-', '');
                    return (
                        <div key={session.characterId} className="flex items-center gap-4 p-4 bg-white/5 border border-white/5 hover:border-white/20 rounded-xl transition-all hover:bg-white/10 group relative overflow-hidden">
                            <div className={`absolute left-0 top-0 bottom-0 w-1 bg-${colorClass}/50`}></div>
                            <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0">
                                <img src={char.avatarUrl} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between">
                                    <h3 className={`font-bold text-sm ${char.color}`}>{char.name}</h3>
                                    <span className="text-[9px] text-gray-500 font-mono">{new Date(session.timestamp).toLocaleDateString()}</span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1 truncate font-mono opacity-80">
                                    {session.lastMessage.substring(0, 50)}...
                                </p>
                            </div>
                            <button 
                                onClick={() => handleDeleteChat(session.characterId)}
                                className="p-2 text-gray-600 hover:text-red-500 transition-colors z-10"
                                title="Apagar Memória"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                            </button>
                        </div>
                    );
                })
                )}
            </>
        )}

      </div>
    </div>
  );
};

export default HistoryScreen;


import React, { useState, useEffect } from 'react';
import { Character } from '../types';
import CharacterCard from './CharacterCard';
import { saveCharacter } from '../services/characterService';
import { generateCharacterAvatar } from '../services/imageService';

interface CharacterCreatorProps {
  onBack: () => void;
  onSave: () => void;
  initialData?: Character;
}

const VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'] as const;
const COLORS = [
  { label: 'Neon Pink', value: 'text-neon-pink' },
  { label: 'Neon Blue', value: 'text-neon-blue' },
  { label: 'Neon Purple', value: 'text-neon-purple' },
  { label: 'Neon Green', value: 'text-neon-green' },
  { label: 'Neon Orange', value: 'text-neon-orange' },
  { label: 'Neon Red', value: 'text-neon-red' },
];

const CharacterCreator: React.FC<CharacterCreatorProps> = ({ onBack, onSave, initialData }) => {
  const [formData, setFormData] = useState<Character>({
    id: `custom_${Date.now()}`,
    name: '',
    role: '',
    color: 'text-neon-blue',
    avatarUrl: '',
    voiceName: 'Puck',
    systemInstruction: '',
    customInstructions: []
  });

  const [isGeneratingImg, setIsGeneratingImg] = useState(false);

  useEffect(() => {
    if (initialData) {
        setFormData(initialData);
    }
  }, [initialData]);

  // Placeholder para preview enquanto digita
  const previewChar: Character = {
    ...formData,
    name: formData.name || 'NO NAME',
    role: formData.role || 'UNDEFINED ROLE',
    avatarUrl: formData.avatarUrl || 'https://via.placeholder.com/150/000000/FFFFFF/?text=?',
    systemInstruction: formData.systemInstruction || 'Awaiting programming...'
  };

  const handleSave = () => {
    if (!formData.name || !formData.systemInstruction) return;
    
    // Se for edição, mantém o ID original. Se for novo, usa o gerado.
    const charId = initialData ? initialData.id : (formData.id || `custom_${Date.now()}`);

    const finalChar = {
        ...formData,
        id: charId,
        customInstructions: [
            "[CORE] Modo de Resposta: Natural e Imersivo.",
            `[IDENTITY] Mantenha-se no personagem de ${formData.name} o tempo todo.`
        ]
    };
    
    saveCharacter(finalChar);
    onSave();
  };

  const generateAvatar = () => {
      if (!formData.name) return;
      setIsGeneratingImg(true);
      
      // Use the new service to generate the avatar URL
      const url = generateCharacterAvatar(formData);
      
      // Simulate loading for effect then set URL
      setTimeout(() => {
          setFormData(prev => ({ ...prev, avatarUrl: url }));
          setIsGeneratingImg(false);
      }, 800);
  };

  const isEditing = !!initialData;

  return (
    <div className="flex flex-col h-full bg-anime-bg relative overflow-y-auto custom-scrollbar">
       {/* Background */}
       <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
         <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
         <div className={`absolute -bottom-20 -right-20 w-80 h-80 rounded-full blur-[100px] opacity-20 ${formData.color.replace('text-', 'bg-')}`}></div>
       </div>

       {/* Header */}
       <div className="relative z-20 px-6 py-4 flex items-center justify-between bg-black/40 backdrop-blur-md border-b border-white/5 shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="font-mono text-xs tracking-widest uppercase">CANCELAR</span>
        </button>
        <h2 className="font-bold text-lg text-white tracking-widest uppercase flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isEditing ? 'bg-blue-500' : 'bg-green-500'} animate-pulse`}></span>
            {isEditing ? 'EDITAR PERSONA' : 'CRIAR PERSONA'}
        </h2>
        <button 
            onClick={handleSave}
            disabled={!formData.name || !formData.systemInstruction}
            className="bg-white text-black px-4 py-1.5 rounded font-bold font-mono text-xs tracking-wider hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_15px_rgba(255,255,255,0.3)]"
        >
            SALVAR
        </button>
      </div>

      <div className="flex-1 p-6 relative z-10 flex flex-col gap-8 max-w-3xl mx-auto w-full">
        
        {/* Preview Section */}
        <div className="flex justify-center">
            <div className="w-full max-w-md transform scale-100 origin-top">
                <div className="text-[10px] text-gray-500 font-mono text-center mb-2 uppercase tracking-[0.3em]">Visualização em Tempo Real</div>
                <CharacterCard character={previewChar} isSelected={true} onClick={() => {}} />
            </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-6">
            
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">Nome do Personagem</label>
                    <input 
                        type="text" 
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-white/40 focus:outline-none focus:bg-white/5 transition-all font-sans"
                        placeholder="Ex: Zero, Kaira..."
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">Papel / Arquétipo</label>
                    <input 
                        type="text" 
                        value={formData.role}
                        onChange={e => setFormData({...formData, role: e.target.value})}
                        className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-white/40 focus:outline-none focus:bg-white/5 transition-all font-sans"
                        placeholder="Ex: Caçador de Recompensas..."
                    />
                </div>
            </div>

            {/* Appearance */}
            <div className="space-y-2">
                <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider flex justify-between">
                    <span>URL do Avatar</span>
                    {formData.name && (
                        <span className="text-[9px] text-neon-blue animate-pulse">AI GENERATION READY</span>
                    )}
                </label>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={formData.avatarUrl}
                        onChange={e => setFormData({...formData, avatarUrl: e.target.value})}
                        className="flex-1 bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-white/40 focus:outline-none focus:bg-white/5 transition-all font-mono text-xs truncate"
                        placeholder="https://..."
                    />
                    <button 
                        onClick={generateAvatar}
                        disabled={!formData.name || isGeneratingImg}
                        className={`
                            px-4 rounded-lg font-mono text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2
                            ${!formData.name 
                                ? 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/5' 
                                : 'bg-gradient-to-r from-neon-purple to-neon-blue text-white shadow-lg hover:shadow-neon-blue/50 border border-white/20 active:scale-95'}
                        `}
                    >
                        {isGeneratingImg ? (
                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM6.97 11.03a5.25 5.25 0 00-3.479-3.479.75.75 0 010-1.442 5.25 5.25 0 003.479-3.479.75.75 0 011.442 0 5.25 5.25 0 003.479 3.479.75.75 0 010 1.442 5.25 5.25 0 00-3.479 3.479.75.75 0 01-1.442 0z" clipRule="evenodd" />
                            </svg>
                        )}
                        {isGeneratingImg ? 'GENERATING...' : 'MAGIC GENERATE'}
                    </button>
                </div>
                <p className="text-[9px] text-gray-600">Dica: Preencha Nome e Papel antes de gerar para melhores resultados.</p>
            </div>

            {/* Voice & Color */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                     <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">Sintetizador de Voz (TTS)</label>
                     <div className="grid grid-cols-3 gap-2">
                        {VOICES.map(voice => (
                            <button
                                key={voice}
                                onClick={() => setFormData({...formData, voiceName: voice})}
                                className={`
                                    px-2 py-2 rounded border text-xs font-mono transition-all
                                    ${formData.voiceName === voice 
                                        ? 'bg-white text-black border-white' 
                                        : 'bg-transparent border-white/10 text-gray-400 hover:border-white/30'}
                                `}
                            >
                                {voice}
                            </button>
                        ))}
                     </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">Cor da Aura (Tema)</label>
                    <div className="flex flex-wrap gap-3">
                        {COLORS.map(color => (
                            <button
                                key={color.value}
                                onClick={() => setFormData({...formData, color: color.value})}
                                className={`
                                    w-8 h-8 rounded-full border-2 transition-all shadow-[0_0_10px_rgba(0,0,0,0.5)]
                                    ${formData.color === color.value ? 'scale-125 border-white' : 'border-transparent scale-100 opacity-60 hover:opacity-100'}
                                `}
                                style={{ backgroundColor: getComputedStyle(document.documentElement).getPropertyValue(`--color-${color.value.replace('text-', '')}`) }} 
                            >
                                <div className={`w-full h-full rounded-full ${color.value.replace('text-', 'bg-')}`}></div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Personality Engine */}
            <div className="space-y-2 pb-10">
                <div className="flex justify-between items-end">
                    <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">Programação Neural (Prompt do Sistema)</label>
                    <span className="text-[9px] text-gray-600">Defina quem é o personagem, como fala e como age.</span>
                </div>
                <textarea 
                    value={formData.systemInstruction}
                    onChange={e => setFormData({...formData, systemInstruction: e.target.value})}
                    className="w-full h-64 bg-black/50 border border-white/10 rounded-lg p-4 text-gray-300 focus:border-white/40 focus:outline-none focus:bg-white/5 transition-all font-mono text-sm leading-relaxed custom-scrollbar resize-none"
                    placeholder={`IDENTITY: Nome...\n\nPERSONALITY:\n- Bravo\n- Leal\n\nSTYLE:\n- Fala gírias\n- Odeia robôs...`}
                />
            </div>

        </div>
      </div>
    </div>
  );
};

export default CharacterCreator;

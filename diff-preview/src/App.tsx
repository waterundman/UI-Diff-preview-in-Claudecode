/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Layout, 
  Code2, 
  Sparkles, 
  Layers, 
  Settings, 
  Play, 
  ChevronRight, 
  Search,
  Plus,
  Image as ImageIcon,
  Palette,
  MousePointer2,
  Maximize2,
  Move,
  X,
  Check,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateDesignSuggestion, AIDesignSuggestion } from './services/gemini';
import { opencodeBridge } from './services/opencode';

// --- Types ---
interface Element {
  id: string;
  type: 'button' | 'card' | 'text' | 'image' | 'container';
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: string;
  parentId?: string;
}

// --- Components ---

const ElementNode = ({ 
  el, 
  elements, 
  isDiff, 
  selectedElementId, 
  onSelect, 
  onUpdate 
}: { 
  key?: string | number;
  el: Element;
  elements: Element[];
  isDiff: boolean;
  selectedElementId: string | null;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Element>) => void;
}) => {
  const children = elements.filter(child => child.parentId === el.id);
  const isSelected = selectedElementId === el.id;

  const content = (
    <>
      {isDiff && <div className="absolute top-0 left-0 bg-blue-500 text-white text-[8px] px-1 font-bold uppercase tracking-tighter z-10">AI Suggestion</div>}
      {el.type === 'image' ? (
        <div className="w-full h-full flex items-center justify-center bg-zinc-200/50">
          <ImageIcon size={24} className={isDiff ? "text-blue-500/50" : "text-zinc-500/50"} />
        </div>
      ) : (
        <span className={`${isDiff ? 'text-blue-900/80' : 'text-zinc-900'} pointer-events-none ${el.style}`}>{el.content}</span>
      )}
      
      {children.map(child => (
        <ElementNode 
          key={child.id} 
          el={child} 
          elements={elements} 
          isDiff={isDiff} 
          selectedElementId={selectedElementId} 
          onSelect={onSelect}
          onUpdate={onUpdate}
        />
      ))}

      {isDiff && (
        <div 
          className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500/50 rounded-tl-sm cursor-nwse-resize opacity-0 group-hover:opacity-100 flex items-center justify-center z-20"
          onPointerDown={(e) => {
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const onMouseMove = (moveEvent: MouseEvent) => {
              const dx = ((moveEvent.clientX - startX) / 800) * 100;
              const dy = ((moveEvent.clientY - startY) / 600) * 100;
              onUpdate(el.id, { width: Math.max(5, el.width + dx), height: Math.max(5, el.height + dy) });
            };
            const onMouseUp = () => {
              window.removeEventListener('mousemove', onMouseMove);
              window.removeEventListener('mouseup', onMouseUp);
            };
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
          }}
        >
          <div className="w-1 h-1 bg-white rounded-full" />
        </div>
      )}
    </>
  );

  const style = {
    position: 'absolute' as const,
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.width}%`,
    height: `${el.height}%`,
  };

  if (isDiff) {
    return (
      <motion.div
        layoutId={el.id}
        drag={!el.parentId} // Only allow dragging top-level elements for simplicity
        dragMomentum={false}
        onPointerDown={(e) => { e.stopPropagation(); onSelect(el.id); }}
        onDragEnd={(_, info) => {
          if (el.parentId) return;
          const parent = document.getElementById('canvas-root');
          if (parent) {
            const rect = parent.getBoundingClientRect();
            const newX = ((info.point.x - rect.left) / rect.width) * 100;
            const newY = ((info.point.y - rect.top) / rect.height) * 100;
            onUpdate(el.id, { x: Math.max(0, Math.min(90, newX)), y: Math.max(0, Math.min(90, newY)) });
          }
        }}
        style={style}
        className={`flex items-center justify-center border-2 border-dashed ${isSelected ? 'border-blue-400 bg-blue-500/30' : 'border-blue-500/50 bg-blue-500/10'} ${!el.parentId ? 'cursor-move' : ''} group hover:bg-blue-500/20 transition-colors rounded-lg overflow-hidden`}
      >
        {content}
      </motion.div>
    );
  }

  return (
    <div 
      onPointerDown={(e) => { e.stopPropagation(); onSelect(el.id); }}
      style={style}
      className={`flex items-center justify-center border ${isSelected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-transparent hover:border-blue-400/30'} group transition-all cursor-pointer ${el.type === 'card' || el.type === 'container' ? 'bg-zinc-100 rounded-lg shadow-sm' : ''} ${el.type === 'button' ? 'bg-blue-600 text-white rounded-md' : ''}`}
    >
      {content}
    </div>
  );
};

const SidebarItem = ({ icon: Icon, active = false, onClick }: { icon: any, active?: boolean, onClick?: () => void }) => (
  <button 
    onClick={onClick}
    className={`p-3 rounded-lg transition-all duration-200 ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
  >
    <Icon size={20} />
  </button>
);

const PanelHeader = ({ title, icon: Icon }: { title: string, icon: any }) => (
  <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
    <Icon size={14} className="text-zinc-500" />
    <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">{title}</span>
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState('design');
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestion, setSuggestion] = useState<AIDesignSuggestion | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [prompt, setPrompt] = useState('Create a modern landing page hero section with a call to action and a glassmorphism card.');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // OpenCode bridge connection state
  const [opencodeConnected, setOpencodeConnected] = useState(false);
  const [opencodeProject, setOpencodeProject] = useState<string | null>(null);
  const [targetPath, setTargetPath] = useState('src/components/GeneratedComponent.tsx');

  // Simulated "Current Code" state
  const [currentElements, setCurrentElements] = useState<Element[]>([
    { id: '1', type: 'text', content: 'Hello World', x: 10, y: 10, width: 20, height: 5, style: 'text-2xl font-bold' }
  ]);

  // Initialize OpenCode SDK bridge on mount
  useEffect(() => {
    opencodeBridge.connect().then((connected) => {
      setOpencodeConnected(connected);
      if (connected) {
        opencodeBridge.getProject().then((project) => {
          if (project && typeof project === 'object' && 'name' in project) {
            setOpencodeProject((project as any).name as string);
          }
        });
      }
    });
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await generateDesignSuggestion(prompt);
      setSuggestion(result);
      setShowDiff(true);
    } catch (error) {
      console.error('Failed to generate design:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const applySuggestion = async () => {
    if (!suggestion) return;

    const code = generateCode;
    const sessionId = `diff-${Date.now()}`;

    setCurrentElements(suggestion.elements);
    setShowDiff(false);

    if (opencodeConnected) {
      try {
        const written = await opencodeBridge.writeFile(targetPath, code);
        if (written) {
          await opencodeBridge.showToast(
            `Design "${suggestion.title}" applied to ${targetPath}`,
            'success'
          );
          await opencodeBridge.notifyAgent(
            sessionId,
            `User applied AI-generated design "${suggestion.title}" (${activeLanguage}). ` +
            `Generated code written to ${targetPath}. Please review and refine.`
          );
          await opencodeBridge.suggestNext(
            `Review the AI-generated design in ${targetPath}`
          );
        } else {
          await opencodeBridge.showToast(
            'Design changes applied locally. File write failed.',
            'warning'
          );
        }
      } catch (err) {
        console.error('[OpenCode] Failed to write back:', err);
        await opencodeBridge.showToast(
          'Design changes applied locally',
          'info'
        );
      }
    }

    setSuggestion(null);
  };

  const updateElement = (id: string, updates: Partial<Element>) => {
    if (showDiff && suggestion) {
      setSuggestion({
        ...suggestion,
        elements: suggestion.elements.map(el => el.id === id ? { ...el, ...updates } : el)
      });
    } else {
      setCurrentElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
    }
  };

  const [activeBottomTab, setActiveBottomTab] = useState('insights');
  const [activeLanguage, setActiveLanguage] = useState('React');
  const languages = ['React', 'Vue', 'Svelte', 'HTML/CSS'];

  const selectedElement = suggestion?.elements.find(el => el.id === selectedElementId) || currentElements.find(el => el.id === selectedElementId);

  const generateCode = useMemo(() => {
    const elementsToRender = showDiff && suggestion ? suggestion.elements : currentElements;
    
    const buildTree = (parentId?: string): string => {
      const children = elementsToRender.filter(el => el.parentId === parentId);
      if (children.length === 0) return '';
      
      return children.map(el => {
        const innerContent = buildTree(el.id) || el.content;
        const styleStr = `position: absolute; left: ${Math.round(el.x)}%; top: ${Math.round(el.y)}%; width: ${Math.round(el.width)}%; height: ${Math.round(el.height)}%`;
        
        if (activeLanguage === 'React') {
          const responsiveClass = el.style ? ` className="${el.style} lg:${el.style}"` : '';
          return `      <div${responsiveClass} style={{ ${styleStr} }}>\n        ${innerContent}\n      </div>`;
        } else if (activeLanguage === 'Vue') {
          const responsiveClass = el.style ? ` class="${el.style} lg:${el.style}"` : '';
          return `    <div${responsiveClass} :style="{ ${styleStr} }">\n      ${innerContent}\n    </div>`;
        } else {
          const responsiveClass = el.style ? ` class="${el.style} lg:${el.style}"` : '';
          return `  <div${responsiveClass} style="${styleStr}">\n    ${innerContent}\n  </div>`;
        }
      }).join('\n');
    };

    const innerCode = buildTree(undefined);

    if (activeLanguage === 'React') {
      return `import React from 'react';\n\nexport default function GeneratedComponent() {\n  return (\n    <div className="relative w-full h-full">\n${innerCode}\n    </div>\n  );\n}`;
    } else if (activeLanguage === 'Vue') {
      return `<template>\n  <div class="relative w-full h-full">\n${innerCode}\n  </div>\n</template>\n\n<script>\nexport default {\n  name: 'GeneratedComponent'\n};\n</script>`;
    } else if (activeLanguage === 'Svelte') {
      return `<script>\n  // Generated Svelte component\n</script>\n\n<div class="relative w-full h-full">\n${innerCode}\n</div>`;
    } else {
      return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Generated Component</title>\n</head>\n<body>\n  <div class="relative w-full h-full">\n${innerCode}\n  </div>\n</body>\n</html>`;
    }
  }, [showDiff, suggestion, currentElements, activeLanguage]);

  const simulateAgentPush = () => {
    setSuggestion({
      title: "Agent Pushed Design",
      description: "Claude Code has pushed a new layout based on your recent file changes.",
      elements: [
        { id: 'c1', type: 'card', content: '', x: 20, y: 20, width: 60, height: 60, style: 'bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-6 flex flex-col' },
        { id: 't1', type: 'text', content: 'Agent Generated Component', x: 5, y: 5, width: 90, height: 15, style: 'text-xl font-bold text-white', parentId: 'c1' },
        { id: 'b1', type: 'button', content: 'Accept Changes', x: 5, y: 75, width: 40, height: 20, style: 'bg-blue-600 text-white rounded-lg font-medium', parentId: 'c1' }
      ],
      resources: [
        { name: 'Agent Icon', type: 'image', url: 'https://picsum.photos/seed/agent/100/100' }
      ]
    });
    setShowDiff(true);
  };

  const addResourcePoint = (e: React.MouseEvent) => {
    if (!showDiff || !suggestion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    const newElement: Element = {
      id: `new-${Date.now()}`,
      type: 'image',
      content: 'New Resource',
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
      width: Math.min(15, 100 - x),
      height: Math.min(15, 100 - y),
      style: ''
    };

    setSuggestion({
      ...suggestion,
      elements: [...suggestion.elements, newElement]
    });
  };

  const handleResize = (id: string, dw: number, dh: number) => {
    if (!suggestion) return;
    setSuggestion({
      ...suggestion,
      elements: suggestion.elements.map(el => 
        el.id === id ? { ...el, width: Math.max(5, el.width + dw), height: Math.max(5, el.height + dh) } : el
      )
    });
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-200 font-sans overflow-hidden">
      {/* ... Activity Bar ... */}
      <div className="w-16 border-r border-zinc-800 flex flex-col items-center py-4 gap-4 bg-zinc-900/30">
        <div className="mb-4 text-blue-500">
          <Code2 size={28} strokeWidth={2.5} />
        </div>
        <SidebarItem icon={Layout} active={activeTab === 'design'} onClick={() => setActiveTab('design')} />
        <SidebarItem icon={Layers} active={activeTab === 'layers'} onClick={() => setActiveTab('layers')} />
        <SidebarItem icon={Sparkles} active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} />
        <div className="mt-auto">
          <SidebarItem icon={Settings} />
        </div>
      </div>

      {/* --- Side Panel --- */}
      <div className="w-72 border-r border-zinc-800 flex flex-col bg-zinc-900/20">
        {activeTab === 'ai' ? (
          <>
            <PanelHeader title="AI Design Assistant" icon={Sparkles} />
            <div className="p-4 flex flex-col gap-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Prompt</label>
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full h-32 bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none custom-scrollbar"
                  placeholder="Describe your design..."
                />
              </div>
              <button 
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20"
              >
                {isGenerating ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isGenerating ? 'Generating...' : 'Generate Design'}
              </button>

              <button 
                onClick={simulateAgentPush}
                className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all border border-zinc-700"
              >
                <Layers size={14} />
                Simulate Agent Push (MCP)
              </button>

              {suggestion && (
                <div className="mt-4 space-y-4">
                  <div className="p-3 bg-zinc-800/30 border border-zinc-700 rounded-lg">
                    <h4 className="text-sm font-semibold text-blue-400 mb-1">{suggestion.title}</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">{suggestion.description}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">AI Resources</label>
                    <div className="grid grid-cols-2 gap-2">
                      {suggestion.resources.map((res, i) => (
                        <div key={i} className="group relative aspect-square bg-zinc-800 rounded-md overflow-hidden border border-zinc-700 hover:border-blue-500 transition-all cursor-pointer">
                          <img 
                            src={res.url} 
                            alt={res.name} 
                            className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.style.display = 'none';
                              target.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                              const fallback = document.createElement('span');
                              fallback.className = 'text-[9px] text-zinc-500 text-center px-2';
                              fallback.textContent = res.name;
                              target.parentElement?.appendChild(fallback);
                            }}
                          />
                          <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
                            <span className="text-[9px] truncate block">{res.name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <PanelHeader title="Project Explorer" icon={Layout} />
            <div className="p-2">
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800/50 rounded cursor-pointer group">
                <ChevronRight size={14} className="group-hover:text-zinc-200" />
                <span>src</span>
              </div>
              <div className="ml-4 flex items-center gap-2 px-2 py-1.5 text-sm text-blue-400 bg-blue-500/10 rounded border-l-2 border-blue-500">
                <Code2 size={14} />
                <span>App.tsx</span>
              </div>
              <div className="ml-4 flex items-center gap-2 px-2 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800/50 rounded cursor-pointer">
                <Palette size={14} />
                <span>theme.css</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* --- Main Editor Area --- */}
      <div className="flex-1 flex flex-col relative">
        {/* Toolbar */}
        <div className="h-12 border-b border-zinc-800 flex items-center px-4 justify-between bg-zinc-900/40">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-zinc-800/50 p-1 rounded-md border border-zinc-700">
              <button className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"><MousePointer2 size={16} /></button>
              <button className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"><Move size={16} /></button>
              <button className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"><Maximize2 size={16} /></button>
            </div>
            <div className="h-4 w-[1px] bg-zinc-800" />
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">1920 x 1080</span>
              <span>100%</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* OpenCode Connection Status */}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
              opencodeConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-zinc-800/50 text-zinc-500 border-zinc-700'
            }`}>
              <span className={`relative flex h-1.5 w-1.5 ${opencodeConnected ? '' : 'hidden'}`}>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              {opencodeConnected ? `OpenCode: ${opencodeProject || 'Connected'}` : 'OpenCode: Standalone'}
            </div>

            {opencodeConnected && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-zinc-600 uppercase tracking-wider">Target:</span>
                <input
                  type="text"
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  className="w-40 bg-zinc-800/50 border border-zinc-700 rounded px-2 py-0.5 text-[10px] text-zinc-300 focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="src/components/..."
                />
              </div>
            )}

            <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 rounded-md border border-zinc-700 transition-colors">
              <Play size={12} fill="currentColor" />
              Preview
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 rounded-md transition-colors">
              Publish
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 bg-zinc-950 p-12 overflow-auto custom-scrollbar relative flex items-center justify-center">
          <div 
            className="w-full max-w-5xl aspect-video bg-white rounded-xl shadow-2xl shadow-black/50 overflow-hidden relative border border-zinc-800"
            onClick={addResourcePoint}
          >
            {/* Grid Background */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            
            {/* Current Design Elements */}
            {currentElements.filter(el => !el.parentId).map((el) => (
              <ElementNode 
                key={el.id} 
                el={el} 
                elements={currentElements} 
                isDiff={false} 
                selectedElementId={selectedElementId} 
                onSelect={setSelectedElementId}
                onUpdate={updateElement}
              />
            ))}

            {/* AI Diff Preview Overlay */}
            <AnimatePresence>
              {showDiff && suggestion && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="absolute inset-0 z-50 bg-blue-500/5 backdrop-blur-[2px]"
                >
                  {/* Diff Elements */}
                  {suggestion.elements.filter(el => !el.parentId).map((el) => (
                    <ElementNode 
                      key={el.id} 
                      el={el} 
                      elements={suggestion.elements} 
                      isDiff={true} 
                      selectedElementId={selectedElementId} 
                      onSelect={setSelectedElementId}
                      onUpdate={updateElement}
                    />
                  ))}

                  {/* Diff Controls Floating Panel */}
                  <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 p-4 bg-zinc-900/90 border border-zinc-700 rounded-2xl shadow-2xl backdrop-blur-md"
                  >
                    <div className="flex items-center gap-4 w-full border-b border-zinc-800 pb-3">
                      <div className="px-3 py-1 text-xs font-bold text-blue-400 uppercase tracking-widest">
                        AI Diff Preview
                      </div>
                      <div className="h-4 w-[1px] bg-zinc-800" />
                      <div className="flex gap-1 bg-zinc-800 p-1 rounded-lg">
                        {languages.map(lang => (
                          <button 
                            key={lang}
                            onClick={() => setActiveLanguage(lang)}
                            className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${activeLanguage === lang ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                          >
                            {lang}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full">
                      <div className="text-[10px] text-zinc-500 italic flex-1">
                        Click on canvas to add resource points
                      </div>
                      <button 
                        onClick={() => setShowDiff(false)}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
                      >
                        <X size={16} />
                      </button>
                      <button 
                        onClick={applySuggestion}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-full transition-all shadow-lg shadow-blue-900/40"
                      >
                        <Check size={14} />
                        Apply Changes
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Canvas Root ID for coordinate tracking */}
            <div id="canvas-root" className="absolute inset-0 pointer-events-none" />
          </div>
        </div>

        {/* Bottom Panel (Console/Terminal) */}
        <div className="h-40 border-t border-zinc-800 bg-zinc-900/30 flex flex-col">
          <div className="flex items-center gap-6 px-4 h-8 border-b border-zinc-800 text-[10px] uppercase font-bold tracking-widest text-zinc-500">
            <button onClick={() => setActiveBottomTab('insights')} className={`${activeBottomTab === 'insights' ? 'text-blue-400 border-b border-blue-400' : 'hover:text-zinc-300'} h-full transition-colors`}>AI Insights</button>
            <button onClick={() => setActiveBottomTab('code')} className={`${activeBottomTab === 'code' ? 'text-blue-400 border-b border-blue-400' : 'hover:text-zinc-300'} h-full transition-colors`}>Generated Code</button>
            <button className="hover:text-zinc-300 h-full">Terminal</button>
          </div>
          <div className="flex-1 p-4 font-mono text-xs text-zinc-500 overflow-auto custom-scrollbar">
            {activeBottomTab === 'insights' ? (
              suggestion ? (
                <div className="space-y-1">
                  <div className="text-blue-400/80">[AI] Analysis complete. Detected design pattern: {suggestion.title}</div>
                  <div className="text-zinc-600">Suggestion: {suggestion.description}</div>
                  <div className="text-zinc-600">Generated {suggestion.elements.length} layout nodes and {suggestion.resources.length} assets.</div>
                  <div className="text-green-500/80">Ready to merge into main branch.</div>
                </div>
              ) : (
                <div className="text-zinc-700">Waiting for AI input...</div>
              )
            ) : (
              <pre className="text-zinc-400 font-mono text-[11px] whitespace-pre-wrap">{generateCode}</pre>
            )}
          </div>
        </div>
      </div>

      {/* --- Right Panel (Properties) --- */}
      <div className="w-64 border-l border-zinc-800 bg-zinc-900/20 flex flex-col">
        <PanelHeader title="Properties" icon={Settings} />
        <div className="p-4 space-y-6 overflow-y-auto custom-scrollbar">
          {selectedElement ? (
            <>
              <div className="space-y-3">
                <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Layout</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-600">X Position</span>
                    <input 
                      type="number" 
                      value={Math.round(selectedElement.x)} 
                      onChange={(e) => updateElement(selectedElement.id, { x: Number(e.target.value) })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none" 
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-600">Y Position</span>
                    <input 
                      type="number" 
                      value={Math.round(selectedElement.y)} 
                      onChange={(e) => updateElement(selectedElement.id, { y: Number(e.target.value) })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none" 
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-600">Width</span>
                    <input 
                      type="number" 
                      value={Math.round(selectedElement.width)} 
                      onChange={(e) => updateElement(selectedElement.id, { width: Number(e.target.value) })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none" 
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-600">Height</span>
                    <input 
                      type="number" 
                      value={Math.round(selectedElement.height)} 
                      onChange={(e) => updateElement(selectedElement.id, { height: Number(e.target.value) })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded p-1.5 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none" 
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Content</label>
                <textarea 
                  value={selectedElement.content}
                  onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                  className="w-full h-20 bg-zinc-800 border border-zinc-700 rounded p-2 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none resize-none custom-scrollbar"
                />
              </div>
              
              <div className="space-y-3">
                <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">Tailwind Classes</label>
                <textarea 
                  value={selectedElement.style}
                  onChange={(e) => updateElement(selectedElement.id, { style: e.target.value })}
                  className="w-full h-20 bg-zinc-800 border border-zinc-700 rounded p-2 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none resize-none custom-scrollbar font-mono"
                />
              </div>
            </>
          ) : (
            <div className="text-xs text-zinc-500 text-center py-8">
              Select an element in the canvas to edit its properties.
            </div>
          )}

          <div className="space-y-3 pt-4 border-t border-zinc-800">
            <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest">AI Suggestions</label>
            <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
              <p className="text-[11px] text-blue-400/80 italic leading-relaxed">
                "Try increasing the border radius to 24px and adding a backdrop-blur-xl for a more premium glass effect."
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

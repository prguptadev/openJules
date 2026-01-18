import { useState } from 'react';
import { FileCode, Download, Maximize2, X } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export function CodeView() {
  const [activeFile, setActiveFile] = useState<string | null>(null);

  // Placeholder content - in real app, this comes from Agent's context or tool outputs
  const codeContent = `// No file currently selected
// The agent will display file contents here when reading or writing code.`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-12 border-b border-[#222] flex items-center justify-between px-4 bg-[#111]">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">Code Context</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-1.5 hover:bg-[#222] rounded text-gray-400 hover:text-white" title="Download">
            <Download className="h-4 w-4" />
          </button>
          <button className="p-1.5 hover:bg-[#222] rounded text-gray-400 hover:text-white" title="Expand">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Code Area */}
      <div className="flex-1 overflow-hidden bg-[#0F0F0F] relative">
        {activeFile ? (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 bg-[#1A1A1A] border-b border-[#222]">
              <span className="text-xs font-mono text-gray-400">{activeFile}</span>
              <button onClick={() => setActiveFile(null)} className="text-gray-500 hover:text-white">
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar">
              <SyntaxHighlighter
                language="typescript"
                style={oneDark}
                customStyle={{ margin: 0, padding: '1rem', height: '100%', background: 'transparent' }}
                showLineNumbers
              >
                {codeContent}
              </SyntaxHighlighter>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-3">
            <div className="h-16 w-16 rounded-xl bg-[#1A1A1A] border border-[#222] flex items-center justify-center">
              <FileCode className="h-8 w-8 opacity-20" />
            </div>
            <p className="text-sm">No file active</p>
            <p className="text-xs text-gray-600 max-w-[200px] text-center">
              Files read or modified by Jules will appear here.
            </p>
          </div>
        )}
      </div>

      {/* Review Section (Bottom Pane of Right Column) */}
      <div className="h-[300px] border-t border-[#222] bg-[#111] flex flex-col">
        <div className="h-10 px-4 flex items-center justify-between border-b border-[#222]">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Review</span>
          <button className="text-xs text-gray-500 hover:text-gray-300">Collapse all</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-center text-gray-500 text-sm">
          No pending changes to review.
        </div>
      </div>
    </div>
  );
}

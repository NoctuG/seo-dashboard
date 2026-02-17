import { useMemo, useRef, useState, type MouseEvent } from 'react';
import type { CanvasDocument, CanvasNode, ExportFormat, SourceMode } from './canvasTypes';
import { canvasToMarkdown, exportCanvas, sourceToCanvas } from './canvasConverters';

const MIN_W = 180;
const MIN_H = 48;

type DragState =
  | { kind: 'move'; id: string; startX: number; startY: number; baseX: number; baseY: number }
  | { kind: 'resize'; id: string; startX: number; startY: number; baseW: number; baseH: number }
  | null;

export default function CanvasContentEditor({
  document,
  onChange,
  placeholder,
  onExport,
}: {
  document: CanvasDocument;
  onChange: (doc: CanvasDocument) => void;
  placeholder?: string;
  onExport?: (payload: { format: ExportFormat; content: string }) => void;
}) {
  const [mode, setMode] = useState<SourceMode>('canvas');
  const [sourceMode, setSourceMode] = useState<'markdown' | 'json'>('markdown');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragState>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('text');
  const [sourceValue, setSourceValue] = useState('');
  const [sourceError, setSourceError] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedNode = useMemo(() => document.nodes.find((n) => n.id === selectedId) ?? null, [document.nodes, selectedId]);

  const centerGuide = useMemo(() => {
    if (!selectedNode) return null;
    const centerX = document.width / 2;
    const centerY = document.height / 2;
    const nodeCenterX = selectedNode.x + selectedNode.width / 2;
    const nodeCenterY = selectedNode.y + selectedNode.height / 2;
    return {
      vertical: Math.abs(nodeCenterX - centerX) < 8,
      horizontal: Math.abs(nodeCenterY - centerY) < 8,
    };
  }, [document, selectedNode]);

  const updateNode = (id: string, updater: (node: CanvasNode) => CanvasNode) => {
    onChange({ ...document, nodes: document.nodes.map((n) => (n.id === id ? updater(n) : n)) });
  };

  const onCanvasMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const dx = event.clientX - dragging.startX;
    const dy = event.clientY - dragging.startY;

    if (dragging.kind === 'move') {
      updateNode(dragging.id, (node) => ({
        ...node,
        x: Math.max(0, Math.min(document.width - node.width, dragging.baseX + dx)),
        y: Math.max(0, Math.min(document.height - node.height, dragging.baseY + dy)),
      }));
      return;
    }

    updateNode(dragging.id, (node) => ({
      ...node,
      width: Math.max(MIN_W, Math.min(document.width - node.x, dragging.baseW + dx)),
      height: Math.max(MIN_H, Math.min(document.height - node.y, dragging.baseH + dy)),
    }));
  };

  const onCanvasMouseUp = () => setDragging(null);

  const addParagraphNode = () => {
    const y = document.nodes.reduce((max, n) => Math.max(max, n.y + n.height), 24) + 12;
    const newNode: CanvasNode = {
      id: `${Date.now()}-new`,
      type: 'paragraph',
      x: 24,
      y,
      width: 700,
      height: 90,
      zIndex: document.nodes.length + 1,
      text: placeholder || 'New paragraph',
      style: { fontSize: 16, textAlign: 'left' },
    };
    onChange({ ...document, nodes: [...document.nodes, newNode] });
    setSelectedId(newNode.id);
  };

  const duplicateSelected = () => {
    if (!selectedNode) return;
    const clone: CanvasNode = { ...selectedNode, id: `${selectedNode.id}-copy-${Date.now()}`, x: selectedNode.x + 16, y: selectedNode.y + 16, zIndex: document.nodes.length + 1 };
    onChange({ ...document, nodes: [...document.nodes, clone] });
    setSelectedId(clone.id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    onChange({ ...document, nodes: document.nodes.filter((n) => n.id !== selectedId), edges: document.edges.filter((e) => e.from !== selectedId && e.to !== selectedId) });
    setSelectedId(null);
  };

  const switchMode = (next: SourceMode) => {
    if (next === mode) return;
    if (next === 'markdown') {
      setSourceMode('markdown');
      setSourceValue(canvasToMarkdown(document));
    }
    if (next === 'json') {
      setSourceMode('json');
      setSourceValue(JSON.stringify(document, null, 2));
    }
    setMode(next);
    setSourceError('');
  };

  const applySource = () => {
    try {
      const doc = sourceToCanvas(sourceValue, sourceMode);
      onChange(doc);
      setSourceError('');
    } catch {
      setSourceError('Source parse failed.');
    }
  };

  return (
    <div className="shape-medium overflow-hidden border border-[color:var(--md-sys-color-outline)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--md-sys-color-outline)] bg-[color:var(--md-sys-color-surface-variant)] px-4 py-2">
        <button type="button" onClick={() => switchMode('canvas')} className="px-3 py-1.5 shape-small border">Canvas</button>
        <button type="button" onClick={() => switchMode('markdown')} className="px-3 py-1.5 shape-small border">Markdown</button>
        <button type="button" onClick={() => switchMode('json')} className="px-3 py-1.5 shape-small border">JSON</button>
        {mode === 'canvas' && (
          <>
            <button type="button" onClick={addParagraphNode} className="px-3 py-1.5 shape-small border" data-testid="add-node-btn">+ Block</button>
            <button type="button" onClick={duplicateSelected} className="px-3 py-1.5 shape-small border">Copy Node</button>
            <button type="button" onClick={deleteSelected} className="px-3 py-1.5 shape-small border">Delete Node</button>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as ExportFormat)} className="app-select py-1">
            <option value="text">Text</option>
            <option value="markdown">Markdown</option>
            <option value="html">HTML</option>
          </select>
          <button
            type="button"
            onClick={() => {
              const content = exportCanvas(document, exportFormat);
              onExport?.({ format: exportFormat, content });
            }}
            className="px-3 py-1.5 shape-small border"
          >
            Export
          </button>
        </div>
      </div>

      {mode === 'canvas' ? (
        <div
          ref={canvasRef}
          className="relative overflow-auto bg-[color:var(--md-sys-color-surface)] p-4"
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          style={{ minHeight: 440 }}
        >
          <div className="relative mx-auto bg-white shadow-sm" style={{ width: document.width, height: document.height }} data-testid="canvas-root">
            {centerGuide?.vertical && <div className="absolute top-0 bottom-0 w-px bg-blue-300" style={{ left: `${document.width / 2}px` }} />}
            {centerGuide?.horizontal && <div className="absolute left-0 right-0 h-px bg-blue-300" style={{ top: `${document.height / 2}px` }} />}
            {document.nodes.map((node) => (
              <div
                key={node.id}
                data-testid={`node-${node.id}`}
                className={`absolute border bg-white ${selectedId === node.id ? 'border-blue-500' : 'border-transparent'}`}
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                  zIndex: node.zIndex,
                  padding: 8,
                  fontSize: node.style.fontSize,
                  fontWeight: node.style.fontWeight,
                  textAlign: node.style.textAlign,
                  color: node.style.color,
                  background: node.style.background,
                }}
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).dataset.resizeHandle === 'true') return;
                  setSelectedId(node.id);
                  setDragging({ kind: 'move', id: node.id, startX: e.clientX, startY: e.clientY, baseX: node.x, baseY: node.y });
                }}
              >
                <div
                  contentEditable={node.type !== 'image'}
                  suppressContentEditableWarning
                  onInput={(e) => updateNode(node.id, (current) => ({ ...current, text: (e.currentTarget.textContent ?? '').trim() }))}
                >
                  {node.text}
                </div>
                <button
                  type="button"
                  data-resize-handle="true"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedId(node.id);
                    setDragging({ kind: 'resize', id: node.id, startX: e.clientX, startY: e.clientY, baseW: node.width, baseH: node.height });
                  }}
                  className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-blue-500"
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-4 bg-[color:var(--md-sys-color-surface)]">
          <textarea
            className="w-full min-h-[360px] rounded border p-3 font-mono"
            value={sourceValue}
            onChange={(e) => setSourceValue(e.target.value)}
          />
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={applySource} className="px-3 py-1.5 shape-small border">Apply Source</button>
            {sourceError && <p className="text-sm text-red-600">{sourceError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

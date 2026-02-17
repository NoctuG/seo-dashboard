import type { CanvasDocument, CanvasNode, CanvasNodeType, ExportFormat } from './canvasTypes';
import type { AiContentBlock } from '../../api';

const DEFAULT_WIDTH = 760;
const DEFAULT_HEIGHT = 900;

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const baseStyleByType: Record<CanvasNodeType, CanvasNode['style']> = {
  heading: { fontSize: 30, fontWeight: 700, textAlign: 'left' },
  paragraph: { fontSize: 16, fontWeight: 400, textAlign: 'left' },
  image: { background: '#f2f4f7' },
  cta: { fontSize: 16, fontWeight: 600, background: '#dbeafe', textAlign: 'center' },
  hashtag: { fontSize: 14, fontWeight: 500, color: '#2563eb' },
};

function makeNode(type: CanvasNodeType, text: string, y: number, zIndex: number): CanvasNode {
  const isHeading = type === 'heading';
  const isHashtag = type === 'hashtag';
  return {
    id: uid(),
    type,
    text,
    x: 24,
    y,
    width: isHeading ? 700 : isHashtag ? 360 : 700,
    height: isHeading ? 68 : isHashtag ? 44 : 96,
    zIndex,
    style: { ...baseStyleByType[type] },
  };
}


function blockTypeToNodeType(type: string): CanvasNodeType {
  if (type === 'heading') return 'heading';
  if (type === 'cta') return 'cta';
  if (type === 'hashtag') return 'hashtag';
  return 'paragraph';
}

function blockTextFromMeta(block: AiContentBlock): string {
  const text = block.text?.trim();
  if (text) return text;
  if (Array.isArray(block.meta?.items)) {
    return (block.meta.items as unknown[])
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export function articleBlocksToCanvas(blocks: AiContentBlock[], title?: string): CanvasDocument {
  const nodes: CanvasNode[] = [];
  let y = 24;
  let zIndex = 1;

  if (title?.trim()) {
    nodes.push(makeNode('heading', title.trim(), y, zIndex++));
    y += 84;
  }

  blocks.forEach((block) => {
    const nodeType = blockTypeToNodeType(block.type);
    const text = blockTextFromMeta(block);
    if (!text) return;

    const node = makeNode(nodeType, text, y, zIndex++);
    if (nodeType === 'heading') {
      const level = Math.min(Math.max(block.level ?? 2, 1), 6);
      node.style.fontSize = Math.max(20, 34 - level * 2);
      node.height = 68;
    } else if (nodeType === 'hashtag') {
      node.height = 44;
    } else {
      node.height = Math.max(80, Math.ceil(text.length / 48) * 30 + 32);
    }
    nodes.push(node);
    y += node.height + 16;
  });

  return {
    id: uid(),
    width: DEFAULT_WIDTH,
    height: Math.max(DEFAULT_HEIGHT, y + 40),
    nodes,
    edges: nodes.slice(1).map((node, i) => ({ id: uid(), from: nodes[i].id, to: node.id, kind: 'flow' })),
    metadata: { sourceType: 'article' },
  };
}

export function socialBlocksToCanvas(blocks: AiContentBlock[], hashtags: string[]): CanvasDocument {
  const doc = articleBlocksToCanvas(blocks);
  doc.metadata = { sourceType: 'social' };
  const hasHashtagNode = doc.nodes.some((node) => node.type === 'hashtag');
  if (!hasHashtagNode && hashtags.length > 0) {
    const bottomY = doc.nodes.reduce((max, n) => Math.max(max, n.y + n.height), 24) + 14;
    doc.nodes.push(makeNode('hashtag', hashtags.map((h) => `#${h}`).join(' '), bottomY, doc.nodes.length + 1));
  }
  return doc;
}

export function articleMarkdownToCanvas(markdown: string, title?: string): CanvasDocument {
  const lines = markdown.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  const nodes: CanvasNode[] = [];
  let y = 24;
  let zIndex = 1;

  if (title?.trim()) {
    nodes.push(makeNode('heading', title.trim(), y, zIndex++));
    y += 84;
  }

  lines.forEach((line) => {
    const type: CanvasNodeType = line.startsWith('#') ? 'heading' : 'paragraph';
    const cleanText = line.replace(/^#{1,3}\s+/, '');
    const node = makeNode(type, cleanText, y, zIndex++);
    node.height = type === 'heading' ? 68 : Math.max(80, Math.ceil(cleanText.length / 48) * 30 + 32);
    nodes.push(node);
    y += node.height + 16;
  });

  return {
    id: uid(),
    width: DEFAULT_WIDTH,
    height: Math.max(DEFAULT_HEIGHT, y + 40),
    nodes,
    edges: nodes.slice(1).map((node, i) => ({ id: uid(), from: nodes[i].id, to: node.id, kind: 'flow' })),
    metadata: { sourceType: 'article' },
  };
}

export function socialToCanvas(content: string, hashtags: string[]): CanvasDocument {
  const doc = articleMarkdownToCanvas(content);
  doc.metadata = { sourceType: 'social' };
  const bottomY = doc.nodes.reduce((max, n) => Math.max(max, n.y + n.height), 24) + 14;
  if (hashtags.length > 0) {
    doc.nodes.push(makeNode('hashtag', hashtags.map((h) => `#${h}`).join(' '), bottomY, doc.nodes.length + 1));
  }
  return doc;
}

export function canvasToText(doc: CanvasDocument): string {
  return [...doc.nodes]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((node) => node.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

export function canvasToMarkdown(doc: CanvasDocument): string {
  return [...doc.nodes]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((node) => {
      if (node.type === 'heading') return `## ${node.text.trim()}`;
      if (node.type === 'hashtag') return node.text.trim();
      if (node.type === 'cta') return `> ${node.text.trim()}`;
      return node.text.trim();
    })
    .filter(Boolean)
    .join('\n\n');
}

export function canvasToHtml(doc: CanvasDocument): string {
  return [...doc.nodes]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((node) => {
      const escaped = node.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (node.type === 'heading') return `<h2>${escaped}</h2>`;
      if (node.type === 'hashtag') return `<p class="hashtags">${escaped}</p>`;
      if (node.type === 'cta') return `<blockquote>${escaped}</blockquote>`;
      return `<p>${escaped}</p>`;
    })
    .join('\n');
}

export function exportCanvas(doc: CanvasDocument, format: ExportFormat): string {
  if (format === 'markdown') return canvasToMarkdown(doc);
  if (format === 'html') return canvasToHtml(doc);
  return canvasToText(doc);
}

export function sourceToCanvas(source: string, mode: 'markdown' | 'json'): CanvasDocument {
  if (mode === 'json') {
    return JSON.parse(source) as CanvasDocument;
  }
  return articleMarkdownToCanvas(source);
}

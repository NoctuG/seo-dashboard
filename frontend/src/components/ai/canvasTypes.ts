export type CanvasNodeType = 'heading' | 'paragraph' | 'image' | 'cta' | 'hashtag';

export interface CanvasNodeStyle {
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  background?: string;
  textAlign?: 'left' | 'center' | 'right';
}

export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  text: string;
  style: CanvasNodeStyle;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  kind: 'flow' | 'group';
}

export interface CanvasDocument {
  id: string;
  width: number;
  height: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  metadata?: {
    sourceType?: 'article' | 'social';
    language?: string;
  };
}

export type SourceMode = 'canvas' | 'markdown' | 'json';
export type ExportFormat = 'text' | 'markdown' | 'html';

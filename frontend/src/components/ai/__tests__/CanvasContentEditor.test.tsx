import { render, screen, fireEvent } from '@testing-library/react';
import CanvasContentEditor from '../CanvasContentEditor';
import type { CanvasDocument } from '../canvasTypes';

const createDoc = (): CanvasDocument => ({
  id: 'doc-1',
  width: 760,
  height: 600,
  edges: [],
  nodes: [
    {
      id: 'node-1',
      type: 'paragraph',
      x: 20,
      y: 20,
      width: 320,
      height: 90,
      zIndex: 1,
      text: 'hello world',
      style: { fontSize: 16 },
    },
  ],
});

describe('CanvasContentEditor', () => {
  it('creates a new node and updates state', () => {
    let doc = createDoc();
    const onChange = (next: CanvasDocument) => {
      doc = next;
    };

    render(<CanvasContentEditor document={doc} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('add-node-btn'));

    expect(doc.nodes.length).toBe(2);
  });

  it('moves a node and updates coordinates', () => {
    let doc = createDoc();
    const onChange = (next: CanvasDocument) => {
      doc = next;
    };

    render(<CanvasContentEditor document={doc} onChange={onChange} />);
    const node = screen.getByTestId('node-node-1');
    const canvas = screen.getByTestId('canvas-root').parentElement as HTMLElement;

    fireEvent.mouseDown(node, { clientX: 40, clientY: 40 });
    fireEvent.mouseMove(canvas, { clientX: 80, clientY: 90 });
    fireEvent.mouseUp(canvas);

    expect(doc.nodes[0].x).toBeGreaterThan(20);
    expect(doc.nodes[0].y).toBeGreaterThan(20);
  });

  it('edits text and persists document state', () => {
    let doc = createDoc();
    const onChange = (next: CanvasDocument) => {
      doc = next;
    };

    render(<CanvasContentEditor document={doc} onChange={onChange} />);
    const editable = screen.getByText('hello world');
    fireEvent.input(editable, { target: { textContent: 'updated text' } });

    expect(doc.nodes[0].text).toBe('updated text');
  });
});

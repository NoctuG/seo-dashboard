import { useMemo } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export type DashboardWidget = {
  widgetId: string;
  title: string;
  defaultVisible?: boolean;
  content: React.ReactNode;
};

type LayoutState = {
  order: string[];
  hidden: string[];
};

type Props = {
  widgets: DashboardWidget[];
  layout: LayoutState;
  onLayoutChange: (layout: LayoutState) => void;
};

function SortableCard({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={className} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export default function DashboardLayout({ widgets, layout, onLayoutChange }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const widgetMap = useMemo(() => new Map(widgets.map((w) => [w.widgetId, w])), [widgets]);
  const normalizedOrder = useMemo(() => {
    const all = widgets.map((w) => w.widgetId);
    const preserved = layout.order.filter((id) => widgetMap.has(id));
    return [...preserved, ...all.filter((id) => !preserved.includes(id))];
  }, [layout.order, widgetMap, widgets]);

  const visibleIds = normalizedOrder.filter((id) => !layout.hidden.includes(id));

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = normalizedOrder.indexOf(String(active.id));
    const newIndex = normalizedOrder.indexOf(String(over.id));
    onLayoutChange({ ...layout, order: arrayMove(normalizedOrder, oldIndex, newIndex) });
  };

  const toggleWidget = (widgetId: string) => {
    const hidden = layout.hidden.includes(widgetId)
      ? layout.hidden.filter((id) => id !== widgetId)
      : [...layout.hidden, widgetId];
    onLayoutChange({ ...layout, hidden });
  };

  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {widgets.map((widget) => (
          <button
            key={widget.widgetId}
            type="button"
            onClick={() => toggleWidget(widget.widgetId)}
            className="app-btn app-btn-outline app-btn-sm"
          >
            {layout.hidden.includes(widget.widgetId) ? `显示 ${widget.title}` : `隐藏 ${widget.title}`}
          </button>
        ))}
        <button
          type="button"
          className="app-btn app-btn-outline app-btn-sm"
          onClick={() =>
            onLayoutChange({
              order: widgets.map((w) => w.widgetId),
              hidden: widgets.filter((w) => w.defaultVisible === false).map((w) => w.widgetId),
            })
          }
        >
          重置默认
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visibleIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {visibleIds.map((id, index) => {
              const widget = widgetMap.get(id);
              if (!widget) return null;
              const staggerClass = `animate-stagger-${(index % 5) + 1}`;
              return (
                <SortableCard
                  key={id}
                  id={id}
                  className={`animate-fade-slide-up ${staggerClass}`}
                >
                  {widget.content}
                </SortableCard>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

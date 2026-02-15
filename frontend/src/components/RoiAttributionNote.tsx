interface RoiAttributionNoteProps {
  attributionModel: 'linear' | 'first_click' | 'last_click';
  provider: string;
}

const copyMap = {
  linear: 'Linear：将辅助转化价值按全触点均摊，适合季度复盘。',
  first_click: 'First Click：偏向获客阶段，强调 SEO 首次触达的贡献。',
  last_click: 'Last Click：偏向收口阶段，强调最终成交前的 SEO 贡献。',
} as const;

export default function RoiAttributionNote({ attributionModel, provider }: RoiAttributionNoteProps) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold mb-1">口径说明（避免管理层误读）</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>当前数据源：{provider.toUpperCase()}，已统一映射到标准 revenue 字段。</li>
        <li>{copyMap[attributionModel]}</li>
        <li>ROI 公式：ROI = (收益 - 成本) / 成本；收益包含已实现收入 + 辅助转化折算价值。</li>
      </ul>
    </div>
  );
}

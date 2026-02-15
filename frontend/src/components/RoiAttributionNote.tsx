import { useTranslation } from 'react-i18next';

interface RoiAttributionNoteProps {
  attributionModel: 'linear' | 'first_click' | 'last_click';
  provider: string;
}

export default function RoiAttributionNote({ attributionModel, provider }: RoiAttributionNoteProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold mb-1">{t('roiNote.title')}</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>{t('roiNote.provider', { provider: provider.toUpperCase() })}</li>
        <li>{t(`roiNote.models.${attributionModel}`)}</li>
        <li>{t('roiNote.formula')}</li>
      </ul>
    </div>
  );
}

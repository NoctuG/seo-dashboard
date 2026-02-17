import type { KeywordGapResponse } from '../api';

type KeywordGapStats = KeywordGapResponse['stats'];

interface KeywordGapVennProps {
    stats: KeywordGapStats;
    myDomainLabel?: string;
    competitorLabel: string;
}

export default function KeywordGapVenn({
    stats,
    myDomainLabel = '我方',
    competitorLabel,
}: KeywordGapVennProps) {
    const intersection = stats.common;
    const myTotal = stats.common + stats.unique;
    const competitorTotal = stats.common + stats.gap;

    return (
        <div className="space-y-4" data-testid="keyword-gap-venn">
            <div className="rounded border bg-slate-50 p-4">
                <div className="relative mx-auto h-48 max-w-md">
                    <div className="absolute left-[10%] top-6 flex h-32 w-32 items-center justify-center rounded-full border-2 border-indigo-400 bg-indigo-200/50 text-center text-sm font-semibold text-indigo-900">
                        <div>
                            <div>{myDomainLabel}</div>
                            <div className="text-lg">{myTotal}</div>
                        </div>
                    </div>
                    <div className="absolute right-[10%] top-6 flex h-32 w-32 items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-200/50 text-center text-sm font-semibold text-emerald-900">
                        <div>
                            <div className="line-clamp-1">{competitorLabel}</div>
                            <div className="text-lg">{competitorTotal}</div>
                        </div>
                    </div>
                    <div className="absolute left-1/2 top-[4.25rem] flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full border-2 border-slate-500 bg-white text-center text-sm font-semibold text-slate-700 shadow-sm">
                        {intersection}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm text-gray-700 md:grid-cols-3">
                <div className="rounded border bg-white p-3">
                    <div className="font-medium">Common（交集）: {stats.common}</div>
                    <p className="text-gray-500">我方与当前竞品都覆盖到的关键词。</p>
                </div>
                <div className="rounded border bg-white p-3">
                    <div className="font-medium">Gap（差距）: {stats.gap}</div>
                    <p className="text-gray-500">竞品覆盖但我方未覆盖的关键词。</p>
                </div>
                <div className="rounded border bg-white p-3">
                    <div className="font-medium">Unique（我方独有）: {stats.unique}</div>
                    <p className="text-gray-500">我方覆盖但当前竞品未覆盖的关键词。</p>
                </div>
            </div>
        </div>
    );
}

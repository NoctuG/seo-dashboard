import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  generateSeoArticle,
  generateSocialContent,
  rewriteContent,
  analyzeSeoWithAi,
  importAiKeywordSuggestions,
  fetchAiSerpAnalysis,
  generateAiContentBrief,
  getAiDraftRetrospective,
  type AiArticleOnPageResult,
  type AiArticleQualityReviewResult,
  type AiContentDraft,
  type AiDraftContentBriefContext,
  type AiDraftKeywordPlanContext,
  type AiDraftPublishReviewMetadata,
  type AiDraftSerpSnapshotContext,
  type AiDraftPublicationStatus,
  type AiDraftRetrospectiveResponse,
  type AiGenerateArticleResponse,
  type AiKeywordSuggestionResponse,
  type AiSerpResearchResponse,
  type AiSocialPost,
  createAiContentDraft,
  listAiContentDrafts,
  updateAiContentDraft,
  executeAiCommand,
  type ExecuteAiCommandResponse,
  api,
} from '../api';
import { runWithUiState } from '../utils/asyncAction';
import { getErrorMessage } from '../utils/error';
import CanvasContentEditor from '../components/ai/CanvasContentEditor';
import {
  articleBlocksToCanvas,
  articleMarkdownToCanvas,
  canvasToText,
  exportCanvas,
  socialBlocksToCanvas,
  socialToCanvas,
} from '../components/ai/canvasConverters';
import type { CanvasDocument } from '../components/ai/canvasTypes';

type TabKey = 'article' | 'social' | 'analyze';
type ArticleStepKey = 'keyword_planning' | 'serp_analysis' | 'seo_brief' | 'execution';

const PLATFORMS = [
  { value: 'twitter', label: 'Twitter / X', icon: 'fa-brands fa-x-twitter' },
  { value: 'linkedin', label: 'LinkedIn', icon: 'fa-brands fa-linkedin' },
  { value: 'facebook', label: 'Facebook', icon: 'fa-brands fa-facebook' },
  { value: 'instagram', label: 'Instagram', icon: 'fa-brands fa-instagram' },
  { value: 'xiaohongshu', label: '小红书', icon: 'fa-solid fa-book-open' },
  { value: 'weibo', label: '微博', icon: 'fa-brands fa-weibo' },
];

const TONES_ARTICLE = [
  { value: 'professional', labelKey: 'aiContent.tones.professional' },
  { value: 'casual', labelKey: 'aiContent.tones.casual' },
  { value: 'authoritative', labelKey: 'aiContent.tones.authoritative' },
  { value: 'friendly', labelKey: 'aiContent.tones.friendly' },
];

const TONES_SOCIAL = [
  { value: 'engaging', labelKey: 'aiContent.tones.engaging' },
  { value: 'professional', labelKey: 'aiContent.tones.professional' },
  { value: 'humorous', labelKey: 'aiContent.tones.humorous' },
  { value: 'inspirational', labelKey: 'aiContent.tones.inspirational' },
];


type ArticleWorkflowStageKey = 'drafting' | 'on_page_optimization' | 'quality_review' | 'retrospective';

type ArticleKeywordPlanState = {
  primary_keyword: string;
  secondary_keywords: string[];
  long_tail_questions: string[];
};

type ArticleSerpEntryState = {
  rank: number;
  content_type: string;
  title_angle: string;
  structure: string;
  word_count: number;
  content_gap: string;
};

type ArticleSeoBriefState = {
  audience: string;
  intent: string;
  outline: string[];
  entities: string[];
  internal_links: string[];
  cta: string;
  metadata: {
    seo_title: string;
    meta_description: string;
    slug: string;
  };
};

type ArticleWorkflowStageState = {
  goal: string;
  notes: string;
};

const createDefaultSerpEntry = (rank: number): ArticleSerpEntryState => ({
  rank,
  content_type: '',
  title_angle: '',
  structure: '',
  word_count: 0,
  content_gap: '',
});

const DEFAULT_KEYWORD_PLAN: ArticleKeywordPlanState = {
  primary_keyword: '',
  secondary_keywords: ['', '', ''],
  long_tail_questions: ['', '', ''],
};

const DEFAULT_SERP_ANALYSIS = {
  summary: '',
  top_results: Array.from({ length: 10 }, (_, index) => createDefaultSerpEntry(index + 1)),
};

const DEFAULT_SEO_BRIEF: ArticleSeoBriefState = {
  audience: '',
  intent: '',
  outline: ['', '', ''],
  entities: ['', '', ''],
  internal_links: ['', ''],
  cta: '',
  metadata: {
    seo_title: '',
    meta_description: '',
    slug: '',
  },
};

const DEFAULT_WORKFLOW: Record<ArticleWorkflowStageKey, ArticleWorkflowStageState> = {
  drafting: { goal: '', notes: '' },
  on_page_optimization: { goal: '', notes: '' },
  quality_review: { goal: '', notes: '' },
  retrospective: { goal: '', notes: '' },
};

const DEFAULT_PUBLISH_REVIEW_PLAN = {
  pre_publish_checks: [] as string[],
  post_publish_metrics: [] as string[],
  iteration_ideas: [] as string[],
};

const padValues = (values: string[] | undefined, size: number) => {
  const normalized = values?.map((value) => value.trim()).filter(Boolean) ?? [];
  return [...normalized.slice(0, size), ...Array.from({ length: size }, () => '')].slice(0, size);
};

const buildOnPageFallback = (draftTitle: string, brief: ArticleSeoBriefState): AiArticleOnPageResult => ({
  title_tag: brief.metadata.seo_title || draftTitle,
  meta_description: brief.metadata.meta_description || '—',
  url_slug: brief.metadata.slug || '—',
  heading_tree: filterNonEmpty(brief.outline).map((text) => ({ level: 2, text })),
  internal_links: filterNonEmpty(brief.internal_links),
  image_alt: [],
  schema_recommendations: [],
  checklist: [],
});

const buildQualityReviewFallback = (): AiArticleQualityReviewResult => ({
  verdict: '草稿已加载，待重新审校',
  fluff: '未评估',
  missing_examples: '未评估',
  experience_evidence: '未评估',
  skim_friendly: '未评估',
  strengths: [],
  risks: [],
  fixes: [],
});

const buildKeywordPlanStateFromContext = (context?: AiDraftKeywordPlanContext): ArticleKeywordPlanState => ({
  primary_keyword: context?.plan?.primary_keyword ?? '',
  secondary_keywords: padValues(context?.plan?.secondary_keywords, 5),
  long_tail_questions: padValues(context?.plan?.long_tail_questions, 5),
});

const buildSerpAnalysisFromContext = (context?: AiDraftSerpSnapshotContext) => {
  const topResults = context?.analysis?.top_results ?? [];
  return {
    summary: context?.analysis?.summary ?? '',
    top_results: Array.from({ length: 10 }, (_, index) => {
      const entry = topResults[index];
      return entry
        ? {
            rank: entry.rank ?? index + 1,
            content_type: entry.content_type ?? '',
            title_angle: entry.title_angle ?? '',
            structure: entry.structure ?? '',
            word_count: entry.word_count ?? 0,
            content_gap: entry.content_gap ?? '',
          }
        : createDefaultSerpEntry(index + 1);
    }),
  };
};

const buildSeoBriefFromContext = (context?: AiDraftContentBriefContext): ArticleSeoBriefState => ({
  audience: context?.brief?.audience ?? '',
  intent: context?.brief?.intent ?? '',
  outline: padValues(context?.brief?.outline, 6),
  entities: padValues(context?.brief?.entities, 5),
  internal_links: padValues(context?.brief?.internal_links, 4),
  cta: context?.brief?.cta ?? '',
  metadata: {
    seo_title: context?.brief?.metadata.seo_title ?? '',
    meta_description: context?.brief?.metadata.meta_description ?? '',
    slug: context?.brief?.metadata.slug ?? '',
  },
});

const buildWorkflowFromContext = (context?: AiDraftContentBriefContext): Record<ArticleWorkflowStageKey, ArticleWorkflowStageState> => ({
  drafting: {
    goal: context?.workflow?.draft_generation.goal ?? '',
    notes: context?.workflow?.draft_generation.notes ?? '',
  },
  on_page_optimization: {
    goal: context?.workflow?.on_page_optimization.goal ?? '',
    notes: context?.workflow?.on_page_optimization.notes ?? '',
  },
  quality_review: {
    goal: context?.workflow?.quality_review.goal ?? '',
    notes: context?.workflow?.quality_review.notes ?? '',
  },
  retrospective: {
    goal: context?.workflow?.retrospective_record.goal ?? '',
    notes: context?.workflow?.retrospective_record.notes ?? '',
  },
});

const buildResultFromDraft = (
  draft: AiContentDraft,
  briefState: ArticleSeoBriefState,
): AiGenerateArticleResponse => {
  const keywordContext = draft.keyword_plan;
  const serpContext = draft.serp_snapshot;
  const contentBriefContext = draft.content_brief;
  const storedOnPage = draft.on_page_recommendations as Partial<AiArticleOnPageResult> | undefined;
  const storedQualityReview = draft.quality_review as Partial<AiArticleQualityReviewResult> | undefined;
  const onPage = storedOnPage && 'title_tag' in storedOnPage
    ? storedOnPage as AiArticleOnPageResult
    : buildOnPageFallback(draft.title, briefState);
  const qualityReview = storedQualityReview && 'verdict' in storedQualityReview
    ? storedQualityReview as AiArticleQualityReviewResult
    : buildQualityReviewFallback();

  return {
    keyword_plan: {
      primary_keyword: keywordContext?.plan?.primary_keyword ?? '',
      secondary_keywords: keywordContext?.plan?.secondary_keywords ?? [],
      long_tail_questions: keywordContext?.plan?.long_tail_questions ?? [],
      intent: keywordContext?.intent ?? {
        summary: contentBriefContext?.brief?.intent || '—',
        target_audience: contentBriefContext?.brief?.audience || '—',
      },
    },
    serp_summary: serpContext?.summary ?? {
      summary: serpContext?.analysis?.summary || '草稿已从保存版本载入。',
      key_patterns: [],
      information_gain: [],
      differentiators: [],
    },
    brief: {
      title_tag: briefState.metadata.seo_title || draft.title,
      meta_description: briefState.metadata.meta_description || '—',
      url_slug: briefState.metadata.slug || '—',
      heading_tree: filterNonEmpty(briefState.outline).map((text) => ({ level: 2, text })),
      internal_links: filterNonEmpty(briefState.internal_links),
      image_alt: [],
      schema_recommendations: [],
    },
    draft: {
      title: draft.title,
      summary: '草稿已从保存版本载入。',
      content: draft.export_text,
      keywords_used: filterNonEmpty([
        keywordContext?.plan?.primary_keyword ?? '',
        ...(keywordContext?.plan?.secondary_keywords ?? []),
      ]),
      blocks: [],
    },
    on_page: onPage,
    quality_review: qualityReview,
    publish_review_plan: draft.publish_review_metadata?.plan ?? DEFAULT_PUBLISH_REVIEW_PLAN,
  };
};

const WORKFLOW_STAGE_CONFIG: { key: ArticleWorkflowStageKey; title: string; description: string; icon: string }[] = [
  { key: 'drafting', title: '初稿生成', description: '定义初稿要覆盖的核心论点、信息密度与语气。', icon: 'fa-solid fa-pen-nib' },
  { key: 'on_page_optimization', title: 'On-page 优化', description: '明确标题、链接、关键词布局、可读性和结构优化要求。', icon: 'fa-solid fa-screwdriver-wrench' },
  { key: 'quality_review', title: '质量审校', description: '记录事实核验、品牌一致性、E-E-A-T 与风险检查标准。', icon: 'fa-solid fa-shield-heart' },
  { key: 'retrospective', title: '复盘记录', description: '说明文章发布后要复盘的数据、假设和后续迭代方向。', icon: 'fa-solid fa-clipboard-list' },
];

const ARTICLE_STEP_CONFIG: { key: ArticleStepKey; title: string; description: string; icon: string }[] = [
  { key: 'keyword_planning', title: '1. 关键词规划', description: '主关键词、3-5 个次关键词与长尾问题。', icon: 'fa-solid fa-key' },
  { key: 'serp_analysis', title: '2. SERP 分析', description: '前 10 名内容类型、标题角度、结构、字数和缺口。', icon: 'fa-solid fa-chart-line' },
  { key: 'seo_brief', title: '3. SEO Brief', description: '受众、意图、大纲、实体、内链、CTA 与 metadata。', icon: 'fa-solid fa-file-circle-check' },
  { key: 'execution', title: '4. 执行工作流', description: '初稿、on-page、质检与复盘的操作目标。', icon: 'fa-solid fa-route' },
];

const filterNonEmpty = (values: string[]) => values.map((value) => value.trim()).filter(Boolean);

function ResultCard({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`shape-medium border bg-[color:var(--md-sys-color-surface)] p-4 ${className}`} style={{ borderColor: 'var(--md-sys-color-outline)' }}>
      <div className="mb-3 flex items-center gap-2">
        <i className={icon} style={{ color: 'var(--md-sys-color-primary)' }} />
        <h3 className="md-title-medium">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function ResultList({ items, emptyText = '—' }: { items: string[]; emptyText?: string }) {
  if (items.length === 0) {
    return <p className="md-body-small opacity-60">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex items-start gap-2 md-body-small opacity-85">
          <i className="fa-solid fa-check mt-1 text-[10px]" style={{ color: 'var(--md-sys-color-primary)' }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function HeadingTreeList({ items }: { items: { level: number; text: string }[] }) {
  if (items.length === 0) {
    return <p className="md-body-small opacity-60">—</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={`${item.text}-${index}`} className="rounded-lg border px-3 py-2 md-body-small" style={{ borderColor: 'var(--md-sys-color-outline-variant)', marginLeft: `${Math.max(item.level - 1, 0) * 12}px` }}>
          <span className="mr-2 opacity-60">H{item.level}</span>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

export default function AiContentGeneration() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>('article');
  const [quickProjectId, setQuickProjectId] = useState('');
  const [quickCommand, setQuickCommand] = useState('/research');
  const [quickPayload, setQuickPayload] = useState('{\n  "seed_term": ""\n}');
  const [quickContext, setQuickContext] = useState('{}');
  const [quickCommandLoading, setQuickCommandLoading] = useState(false);
  const [quickCommandError, setQuickCommandError] = useState('');
  const [quickCommandHistory, setQuickCommandHistory] = useState<ExecuteAiCommandResponse[]>([]);

  const tabs: { key: TabKey; icon: string; labelKey: string }[] = [
    { key: 'article', icon: 'fa-solid fa-file-lines', labelKey: 'aiContent.tabs.article' },
    { key: 'social', icon: 'fa-solid fa-share-nodes', labelKey: 'aiContent.tabs.social' },
    { key: 'analyze', icon: 'fa-solid fa-magnifying-glass-chart', labelKey: 'aiContent.tabs.analyze' },
  ];


  const handleQuickCommandSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setQuickCommandError('');

    const parsedProjectId = Number(quickProjectId);
    if (!Number.isFinite(parsedProjectId) || parsedProjectId <= 0) {
      setQuickCommandError('请输入有效的项目 ID。');
      return;
    }

    let parsedPayload: Record<string, unknown> = {};
    let parsedContext: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(quickPayload) as Record<string, unknown>;
      parsedContext = JSON.parse(quickContext) as Record<string, unknown>;
    } catch {
      setQuickCommandError('payload/context 必须是合法 JSON。');
      return;
    }

    await runWithUiState(async () => {
      const res = await executeAiCommand({
        project_id: parsedProjectId,
        command: quickCommand.trim(),
        payload: parsedPayload,
        context: parsedContext,
      });
      setQuickCommandHistory((prev) => [res, ...prev].slice(0, 10));
    }, {
      setLoading: setQuickCommandLoading,
      setError: setQuickCommandError,
      clearErrorValue: '',
      formatError: (err: unknown) => getErrorMessage(err, '执行命令失败。'),
    });
  };
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="md-headline-large flex items-center gap-4">
          <i className="fa-solid fa-wand-magic-sparkles" style={{ color: 'var(--md-sys-color-primary)' }} />
          {t('aiContent.title')}
        </h1>
        <p className="md-body-medium mt-1 opacity-60">{t('aiContent.subtitle')}</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <form onSubmit={handleQuickCommandSubmit} className="shape-large border bg-[color:var(--md-sys-color-surface)] p-4 shadow-sm" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
          <h2 className="md-title-medium mb-3 flex items-center gap-2">
            <i className="fa-solid fa-terminal" style={{ color: 'var(--md-sys-color-primary)' }} />
            AI 命令输入
          </h2>
          <div className="space-y-3">
            <input className="app-input w-full" placeholder="project_id" value={quickProjectId} onChange={(e) => setQuickProjectId(e.target.value)} />
            <input className="app-input w-full" placeholder="command，如 /research" value={quickCommand} onChange={(e) => setQuickCommand(e.target.value)} />
            <textarea className="app-textarea h-24 w-full" value={quickPayload} onChange={(e) => setQuickPayload(e.target.value)} />
            <textarea className="app-textarea h-20 w-full" value={quickContext} onChange={(e) => setQuickContext(e.target.value)} />
            {quickCommandError ? <p className="md-body-small text-red-500">{quickCommandError}</p> : null}
            <button type="submit" className="app-btn app-btn-primary" disabled={quickCommandLoading}>
              <i className={quickCommandLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-play'} />
              执行命令
            </button>
          </div>
        </form>

        <div className="shape-large border bg-[color:var(--md-sys-color-surface)] p-4 shadow-sm" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
          <h2 className="md-title-medium mb-3 flex items-center gap-2">
            <i className="fa-solid fa-clock-rotate-left" style={{ color: 'var(--md-sys-color-primary)' }} />
            命令历史
          </h2>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {quickCommandHistory.length === 0 ? (
              <p className="md-body-small opacity-70">暂无历史记录。</p>
            ) : quickCommandHistory.map((item, index) => (
              <div key={`${item.command}-${index}`} className="rounded-lg border p-2" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                <p className="md-label-large">{item.command} · {item.status}</p>
                <p className="md-body-small opacity-70">next: {item.next_actions.join(', ') || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Material Design Tabs */}
      <div className="mb-6 flex border-b border-[color:var(--md-sys-color-outline)]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative -mb-px flex items-center gap-2 border-b-2 px-6 py-4 md-label-large transition-colors ${
              activeTab === tab.key
                ? 'border-[color:var(--md-sys-color-primary)] text-[color:var(--md-sys-color-primary)]'
                : 'border-transparent text-[color:var(--md-sys-color-on-surface-variant)]'
            }`}
          >
            <i className={tab.icon} />
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {activeTab === 'article' && <ArticleGenerator />}
      {activeTab === 'social' && <SocialGenerator />}
      {activeTab === 'analyze' && <SeoAnalyzer />}
    </div>
  );
}


type LightweightProject = { id: number; name: string };

function useProjectOptions() {
  const [projects, setProjects] = useState<LightweightProject[]>([]);

  useEffect(() => {
    api.get<LightweightProject[]>('/projects')
      .then((res) => setProjects(res.data))
      .catch(() => setProjects([]));
  }, []);

  return projects;
}

/* ───────────────────── SEO Article Generator Tab ───────────────────── */

function ArticleGenerator() {
  const { t } = useTranslation();
  const [activeStep, setActiveStep] = useState<ArticleStepKey>('keyword_planning');
  const [topic, setTopic] = useState('');
  const [keywordPlan, setKeywordPlan] = useState<ArticleKeywordPlanState>(DEFAULT_KEYWORD_PLAN);
  const [serpAnalysis, setSerpAnalysis] = useState(DEFAULT_SERP_ANALYSIS);
  const [seoBrief, setSeoBrief] = useState<ArticleSeoBriefState>(DEFAULT_SEO_BRIEF);
  const [workflow, setWorkflow] = useState<Record<ArticleWorkflowStageKey, ArticleWorkflowStageState>>(DEFAULT_WORKFLOW);
  const [tone, setTone] = useState('professional');
  const [wordCount, setWordCount] = useState(1500);
  const [language, setLanguage] = useState('zh-CN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AiGenerateArticleResponse | null>(null);
  const [editableDocument, setEditableDocument] = useState<CanvasDocument | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState('');
  const projects = useProjectOptions();
  const [projectId, setProjectId] = useState<number | ''>('');
  const [drafts, setDrafts] = useState<AiContentDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [keywordSuggestionData, setKeywordSuggestionData] = useState<AiKeywordSuggestionResponse | null>(null);
  const [serpResearchData, setSerpResearchData] = useState<AiSerpResearchResponse | null>(null);
  const [retrospective, setRetrospective] = useState<AiDraftRetrospectiveResponse | null>(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [publicationStatus, setPublicationStatus] = useState<AiDraftPublicationStatus>('draft');
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [serpLoading, setSerpLoading] = useState(false);
  const [briefLoading, setBriefLoading] = useState(false);
  const [retrospectiveLoading, setRetrospectiveLoading] = useState(false);

  const activeDraft = useMemo(() => drafts.find((item) => item.id === activeDraftId) ?? null, [drafts, activeDraftId]);
  const activeStepIndex = ARTICLE_STEP_CONFIG.findIndex((step) => step.key === activeStep);
  const inferredMarket = useMemo(() => (language.toLowerCase().startsWith('zh') ? 'cn' : 'us'), [language]);

  const goToStep = (step: ArticleStepKey) => setActiveStep(step);
  const goToPreviousStep = () => {
    if (activeStepIndex <= 0) return;
    setActiveStep(ARTICLE_STEP_CONFIG[activeStepIndex - 1].key);
  };
  const goToNextStep = () => {
    if (activeStepIndex >= ARTICLE_STEP_CONFIG.length - 1) return;
    setActiveStep(ARTICLE_STEP_CONFIG[activeStepIndex + 1].key);
  };

  const updateKeywordPlanField = (field: 'secondary_keywords' | 'long_tail_questions', index: number, value: string) => {
    setKeywordPlan((prev) => {
      const next = [...prev[field]];
      next[index] = value;
      return { ...prev, [field]: next };
    });
  };

  const updateSerpEntry = (index: number, field: keyof ArticleSerpEntryState, value: string | number) => {
    setSerpAnalysis((prev) => ({
      ...prev,
      top_results: prev.top_results.map((entry, entryIndex) => entryIndex === index ? { ...entry, [field]: value } : entry),
    }));
  };

  const updateSeoBriefList = (field: 'outline' | 'entities' | 'internal_links', index: number, value: string) => {
    setSeoBrief((prev) => {
      const next = [...prev[field]];
      next[index] = value;
      return { ...prev, [field]: next };
    });
  };

  const updateWorkflowStage = (stage: ArticleWorkflowStageKey, field: keyof ArticleWorkflowStageState, value: string) => {
    setWorkflow((prev) => ({
      ...prev,
      [stage]: {
        ...prev[stage],
        [field]: value,
      },
    }));
  };

  const handleImportKeywordSuggestions = async () => {
    if (!topic.trim()) {
      setError('请先填写文章主题，再导入关键词建议。');
      return;
    }
    await runWithUiState(async () => {
      const data = await importAiKeywordSuggestions({
        seed_term: topic.trim(),
        locale: language,
        market: inferredMarket,
        limit: 20,
      });
      setKeywordSuggestionData(data);
      setKeywordPlan({
        primary_keyword: data.primary_keyword,
        secondary_keywords: [...data.secondary_keywords.slice(0, 5), '', '', '', '', ''].slice(0, 5),
        long_tail_questions: [...data.long_tail_questions.slice(0, 5), '', '', '', '', ''].slice(0, 5),
      });
      setActiveStep('keyword_planning');
    }, {
      setLoading: setKeywordLoading,
      setError,
      clearErrorValue: '',
      formatError: (err: unknown) => getErrorMessage(err, '导入关键词建议失败。'),
    });
  };

  const handleFetchSerp = async () => {
    const term = keywordPlan.primary_keyword.trim() || topic.trim();
    if (!term) {
      setError('请先填写文章主题或主关键词，再拉取 SERP。');
      return;
    }
    await runWithUiState(async () => {
      const data = await fetchAiSerpAnalysis({
        term,
        locale: language,
        market: inferredMarket,
        limit: 10,
      });
      setSerpResearchData(data);
      setSerpAnalysis({
        summary: data.summary,
        top_results: data.top_results.map((entry) => ({
          rank: entry.rank,
          content_type: entry.content_type,
          title_angle: entry.title_angle,
          structure: entry.structure,
          word_count: entry.word_count,
          content_gap: entry.content_gap,
        })),
      });
      setActiveStep('serp_analysis');
    }, {
      setLoading: setSerpLoading,
      setError,
      clearErrorValue: '',
      formatError: (err: unknown) => getErrorMessage(err, '拉取 SERP 失败。'),
    });
  };

  const handleGenerateBrief = async () => {
    const topicValue = topic.trim();
    if (!topicValue || !keywordPlan.primary_keyword.trim()) {
      setError('请先准备文章主题和主关键词，再生成 brief。');
      return;
    }
    await runWithUiState(async () => {
      const data = await generateAiContentBrief({
        project_id: typeof projectId === 'number' ? projectId : undefined,
        topic: topicValue,
        tone,
        language,
        target_word_count: wordCount,
        keyword_plan: {
          primary_keyword: keywordPlan.primary_keyword.trim(),
          secondary_keywords: filterNonEmpty(keywordPlan.secondary_keywords).slice(0, 5),
          long_tail_questions: filterNonEmpty(keywordPlan.long_tail_questions).slice(0, 5),
        },
        serp_analysis: {
          summary: serpAnalysis.summary.trim() || undefined,
          top_results: serpAnalysis.top_results.map((entry) => ({
            rank: entry.rank,
            content_type: entry.content_type.trim(),
            title_angle: entry.title_angle.trim(),
            structure: entry.structure.trim(),
            word_count: entry.word_count,
            content_gap: entry.content_gap.trim(),
          })),
        },
      });
      setSeoBrief({
        audience: data.audience,
        intent: data.intent,
        outline: [...data.outline.slice(0, 6), '', '', '', '', '', ''].slice(0, 6),
        entities: [...data.entities.slice(0, 5), '', '', '', '', ''].slice(0, 5),
        internal_links: [...data.internal_links.slice(0, 4), '', '', '', ''].slice(0, 4),
        cta: data.cta,
        metadata: data.metadata,
      });
      setWorkflow({
        drafting: { goal: data.execution.draft_generation.goal, notes: data.execution.draft_generation.notes ?? '' },
        on_page_optimization: { goal: data.execution.on_page_optimization.goal, notes: data.execution.on_page_optimization.notes ?? '' },
        quality_review: { goal: data.execution.quality_review.goal, notes: data.execution.quality_review.notes ?? '' },
        retrospective: { goal: data.execution.retrospective_record.goal, notes: data.execution.retrospective_record.notes ?? '' },
      });
      setActiveStep('seo_brief');
    }, {
      setLoading: setBriefLoading,
      setError,
      clearErrorValue: '',
      formatError: (err: unknown) => getErrorMessage(err, '生成 brief 失败。'),
    });
  };

  const handleLoadRetrospective = async () => {
    const pid = typeof projectId === 'number' ? projectId : null;
    if (!pid || !activeDraft) {
      setError('请先选择项目并保存草稿，再查看复盘数据。');
      return;
    }
    await runWithUiState(async () => {
      const data = await getAiDraftRetrospective(pid, activeDraft.id, '30d');
      setRetrospective(data);
    }, {
      setLoading: setRetrospectiveLoading,
      setError,
      clearErrorValue: '',
      formatError: (err: unknown) => getErrorMessage(err, '读取复盘数据失败。'),
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    await runWithUiState(async () => {
      const data = await generateSeoArticle({
        article_mode: 'workflow_v2',
        strategy: {
          topic,
          tone,
          language,
          target_word_count: wordCount,
          keyword_plan: {
            primary_keyword: keywordPlan.primary_keyword.trim(),
            secondary_keywords: filterNonEmpty(keywordPlan.secondary_keywords).slice(0, 5),
            long_tail_questions: filterNonEmpty(keywordPlan.long_tail_questions),
          },
        },
        research: {
          serp_analysis: {
            summary: serpAnalysis.summary.trim() || undefined,
            top_results: serpAnalysis.top_results.map((entry) => ({
              rank: entry.rank,
              content_type: entry.content_type.trim(),
              title_angle: entry.title_angle.trim(),
              structure: entry.structure.trim(),
              word_count: entry.word_count,
              content_gap: entry.content_gap.trim(),
            })),
          },
        },
        brief: {
          audience: seoBrief.audience.trim(),
          intent: seoBrief.intent.trim(),
          outline: filterNonEmpty(seoBrief.outline),
          entities: filterNonEmpty(seoBrief.entities),
          internal_links: filterNonEmpty(seoBrief.internal_links),
          cta: seoBrief.cta.trim(),
          metadata: {
            seo_title: seoBrief.metadata.seo_title.trim(),
            meta_description: seoBrief.metadata.meta_description.trim(),
            slug: seoBrief.metadata.slug.trim(),
          },
        },
        execution: {
          draft_generation: { goal: workflow.drafting.goal.trim(), notes: workflow.drafting.notes.trim() || undefined },
          on_page_optimization: { goal: workflow.on_page_optimization.goal.trim(), notes: workflow.on_page_optimization.notes.trim() || undefined },
          quality_review: { goal: workflow.quality_review.goal.trim(), notes: workflow.quality_review.notes.trim() || undefined },
          retrospective_record: { goal: workflow.retrospective.goal.trim(), notes: workflow.retrospective.notes.trim() || undefined },
        },
      });
      setResult(data);
      const structuredBlocks = data.draft.blocks ?? [];
      setEditableDocument(
        structuredBlocks.length > 0
          ? articleBlocksToCanvas(structuredBlocks, data.draft.title)
          : articleMarkdownToCanvas(data.draft.content, data.draft.title),
      );
    }, {
      setLoading,
      setError,
      clearErrorValue: '',
      formatError: (error: unknown) => getErrorMessage(error, t('aiContent.errors.generateFailed')),
    });
  };

  const handleRewrite = async () => {
    if (!editableDocument) return;
    await runWithUiState(async () => {
      const data = await rewriteContent({
        content: canvasToText(editableDocument),
        instruction: rewriteInstruction,
        language,
      });
      setEditableDocument(articleMarkdownToCanvas(data.result, result?.draft.title));
      setResult((prev) => prev ? {
        ...prev,
        draft: {
          ...prev.draft,
          content: data.result,
          blocks: [],
        },
      } : prev);
    }, {
      setLoading: setRewriting,
      setError,
      formatError: (error: unknown) => getErrorMessage(error, t('aiContent.errors.rewriteFailed')),
    });
  };

  const refreshDrafts = useCallback(async (targetProjectId?: number) => {
    const pid = targetProjectId ?? (typeof projectId === 'number' ? projectId : null);
    if (!pid) return;
    const data = await listAiContentDrafts(pid, { content_type: 'article' });
    setDrafts(data);
  }, [projectId]);

  const handleSaveDraft = async (saveAsNewVersion = false) => {
    const pid = typeof projectId === 'number' ? projectId : null;
    if (!pid || !editableDocument) return;

    const keywordPlanPayload: AiDraftKeywordPlanContext = {
      topic: topic.trim() || undefined,
      tone,
      language,
      target_word_count: wordCount,
      plan: {
        primary_keyword: keywordPlan.primary_keyword.trim(),
        secondary_keywords: filterNonEmpty(keywordPlan.secondary_keywords).slice(0, 5),
        long_tail_questions: filterNonEmpty(keywordPlan.long_tail_questions).slice(0, 5),
      },
      intent: result?.keyword_plan.intent,
      suggestions: keywordSuggestionData,
    };
    const serpSnapshotPayload: AiDraftSerpSnapshotContext = {
      analysis: {
        summary: serpAnalysis.summary.trim() || undefined,
        top_results: serpAnalysis.top_results.map((entry) => ({
          rank: entry.rank,
          content_type: entry.content_type.trim(),
          title_angle: entry.title_angle.trim(),
          structure: entry.structure.trim(),
          word_count: entry.word_count,
          content_gap: entry.content_gap.trim(),
        })),
      },
      summary: result?.serp_summary,
      research_data: serpResearchData,
    };
    const contentBriefPayload: AiDraftContentBriefContext = {
      brief: {
        audience: seoBrief.audience.trim(),
        intent: seoBrief.intent.trim(),
        outline: filterNonEmpty(seoBrief.outline),
        entities: filterNonEmpty(seoBrief.entities),
        internal_links: filterNonEmpty(seoBrief.internal_links),
        cta: seoBrief.cta.trim(),
        metadata: {
          seo_title: seoBrief.metadata.seo_title.trim(),
          meta_description: seoBrief.metadata.meta_description.trim(),
          slug: seoBrief.metadata.slug.trim(),
        },
      },
      workflow: {
        draft_generation: { goal: workflow.drafting.goal.trim(), notes: workflow.drafting.notes.trim() || undefined },
        on_page_optimization: { goal: workflow.on_page_optimization.goal.trim(), notes: workflow.on_page_optimization.notes.trim() || undefined },
        quality_review: { goal: workflow.quality_review.goal.trim(), notes: workflow.quality_review.notes.trim() || undefined },
        retrospective_record: { goal: workflow.retrospective.goal.trim(), notes: workflow.retrospective.notes.trim() || undefined },
      },
    };
    const onPagePayload = result?.on_page ?? buildOnPageFallback(result?.draft.title || topic || activeDraft?.title || 'Untitled Article Draft', seoBrief);
    const qualityReviewPayload = result?.quality_review ?? buildQualityReviewFallback();
    const publishReviewMetadata: AiDraftPublishReviewMetadata = {
      plan: result?.publish_review_plan ?? DEFAULT_PUBLISH_REVIEW_PLAN,
      retrospective,
    };

    await runWithUiState(async () => {
      if (activeDraft) {
        const updated = await updateAiContentDraft(activeDraft.id, {
          title: result?.draft.title || topic || activeDraft.title,
          canvas_document_json: editableDocument as unknown as Record<string, unknown>,
          export_text: exportCanvas(editableDocument, 'text'),
          keyword_plan: keywordPlanPayload,
          serp_snapshot: serpSnapshotPayload,
          content_brief: contentBriefPayload,
          on_page_recommendations: onPagePayload,
          quality_review: qualityReviewPayload,
          publish_review_metadata: publishReviewMetadata,
          target_url: targetUrl.trim() || undefined,
          publication_status: publicationStatus,
          expected_version: activeDraft.version,
          save_as_new_version: saveAsNewVersion,
        });
        setActiveDraftId(updated.id);
      } else {
        const created = await createAiContentDraft(pid, {
          content_type: 'article',
          title: result?.draft.title || topic || 'Untitled Article Draft',
          canvas_document_json: editableDocument as unknown as Record<string, unknown>,
          export_text: exportCanvas(editableDocument, 'text'),
          keyword_plan: keywordPlanPayload,
          serp_snapshot: serpSnapshotPayload,
          content_brief: contentBriefPayload,
          on_page_recommendations: onPagePayload,
          quality_review: qualityReviewPayload,
          publish_review_metadata: publishReviewMetadata,
          target_url: targetUrl.trim() || undefined,
          publication_status: publicationStatus,
        });
        setActiveDraftId(created.id);
      }
      await refreshDrafts(pid);
    }, {
      setLoading: setSavingDraft,
      setError,
      formatError: (err: unknown) => getErrorMessage(err, '保存草稿失败，可能存在版本冲突。'),
    });
  };

  const handleLoadDraft = (draft: AiContentDraft) => {
    const restoredKeywordPlan = buildKeywordPlanStateFromContext(draft.keyword_plan);
    const restoredSerpAnalysis = buildSerpAnalysisFromContext(draft.serp_snapshot);
    const restoredSeoBrief = buildSeoBriefFromContext(draft.content_brief);
    const restoredWorkflow = buildWorkflowFromContext(draft.content_brief);

    setActiveDraftId(draft.id);
    setTopic(draft.keyword_plan.topic ?? draft.title);
    setTone(draft.keyword_plan.tone ?? 'professional');
    setLanguage(draft.keyword_plan.language ?? 'zh-CN');
    setWordCount(draft.keyword_plan.target_word_count ?? 1500);
    setKeywordPlan(restoredKeywordPlan);
    setKeywordSuggestionData(draft.keyword_plan.suggestions ?? null);
    setSerpAnalysis(restoredSerpAnalysis);
    setSerpResearchData(draft.serp_snapshot.research_data ?? null);
    setSeoBrief(restoredSeoBrief);
    setWorkflow(restoredWorkflow);
    setTargetUrl(draft.target_url ?? '');
    setPublicationStatus(draft.publication_status);
    setRetrospective(draft.publish_review_metadata?.retrospective ?? null);
    setEditableDocument(draft.canvas_document_json as unknown as CanvasDocument);
    setResult(buildResultFromDraft(draft, restoredSeoBrief));
    setActiveStep('execution');
  };

  const handleRollback = async (targetVersion: number) => {
    if (!activeDraft) return;
    await runWithUiState(async () => {
      const rolled = await updateAiContentDraft(activeDraft.id, {
        expected_version: activeDraft.version,
        rollback_to_version: targetVersion,
      });
      setActiveDraftId(rolled.id);
      await refreshDrafts(rolled.project_id);
      handleLoadDraft(rolled);
    }, {
      setLoading: setSavingDraft,
      setError,
      formatError: (err: unknown) => getErrorMessage(err, '版本回滚失败。'),
    });
  };

  const handleExport = (content: string) => navigator.clipboard.writeText(content);

  useEffect(() => {
    if (typeof projectId !== 'number') return;
    const timeoutId = window.setTimeout(() => {
      void refreshDrafts(projectId);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [projectId, refreshDrafts]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <div className="shape-large border bg-[color:var(--md-sys-color-surface)] p-6 shadow-md" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
          <h2 className="md-title-medium mb-4 flex items-center gap-2">
            <i className="fa-solid fa-diagram-project" style={{ color: 'var(--md-sys-color-primary)' }} />
            文章工作流配置
          </h2>
          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <label className="mb-1 block md-label-large">项目（用于草稿保存）</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')}
                className="app-select w-full"
                style={{ borderColor: 'var(--md-sys-color-outline)' }}
              >
                <option value="">请选择项目</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>

            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
              <div className="mb-3 flex items-center gap-2">
                <i className="fa-solid fa-bullseye" style={{ color: 'var(--md-sys-color-primary)' }} />
                <div>
                  <p className="md-title-small">基础配置</p>
                  <p className="md-body-small opacity-70">设置文章主题、语言、语气和字数目标。</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block md-label-large">文章主题</label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="app-input w-full"
                    style={{ borderColor: 'var(--md-sys-color-outline)' }}
                    placeholder={t('aiContent.article.topicPlaceholder')}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block md-label-large">{t('aiContent.article.tone')}</label>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      className="app-select w-full"
                      style={{ borderColor: 'var(--md-sys-color-outline)' }}
                    >
                      {TONES_ARTICLE.map((t_) => (
                        <option key={t_.value} value={t_.value}>{t(t_.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block md-label-large">{t('aiContent.article.language')}</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="app-select w-full"
                      style={{ borderColor: 'var(--md-sys-color-outline)' }}
                    >
                      <option value="zh-CN">中文</option>
                      <option value="en-US">English</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block md-label-large">{t('aiContent.article.wordCount')}</label>
                  <input
                    type="range"
                    min={300}
                    max={5000}
                    step={100}
                    value={wordCount}
                    onChange={(e) => setWordCount(Number(e.target.value))}
                    className="w-full accent-[var(--md-sys-color-primary)]"
                  />
                  <div className="mt-1 text-center md-label-medium opacity-60">{wordCount} {t('aiContent.article.words')}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="md-title-small">文章模式多步骤流程</p>
                  <p className="md-body-small opacity-70">按步骤完善研究与 brief，再统一生成文章。</p>
                </div>
                <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}>
                  Step {activeStepIndex + 1} / {ARTICLE_STEP_CONFIG.length}
                </span>
              </div>

              <div className="mb-4 grid gap-2">
                {ARTICLE_STEP_CONFIG.map((step, index) => {
                  const isActive = step.key === activeStep;
                  const isCompleted = index < activeStepIndex;
                  return (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => goToStep(step.key)}
                      className="flex items-start gap-3 rounded-xl border p-3 text-left transition-colors"
                      style={{
                        borderColor: isActive ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)',
                        background: isActive ? 'color-mix(in srgb, var(--md-sys-color-primary-container) 45%, white)' : 'transparent',
                      }}
                    >
                      <span
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm"
                        style={{
                          background: isCompleted || isActive ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-surface-variant)',
                          color: isCompleted || isActive ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)',
                        }}
                      >
                        {isCompleted ? <i className="fa-solid fa-check" /> : index + 1}
                      </span>
                      <div>
                        <p className="md-label-large flex items-center gap-2">
                          <i className={step.icon} />
                          {step.title}
                        </p>
                        <p className="md-body-small opacity-70">{step.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeStep === 'keyword_planning' && (
                <div className="space-y-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-key" style={{ color: 'var(--md-sys-color-primary)' }} />
                      <div>
                        <p className="md-title-small">1. 关键词规划</p>
                        <p className="md-body-small opacity-70">填写主关键词、3-5 个次关键词，以及长尾问题列表。</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => void handleImportKeywordSuggestions()} disabled={keywordLoading} className="app-btn app-btn-outline">
                      <i className={keywordLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-import'} />
                      导入关键词建议
                    </button>
                  </div>
                  <div>
                    <label className="mb-1 block md-label-large">主关键词</label>
                    <input type="text" value={keywordPlan.primary_keyword} onChange={(e) => setKeywordPlan((prev) => ({ ...prev, primary_keyword: e.target.value }))} className="app-input w-full" required />
                  </div>
                  <div>
                    <label className="mb-1 block md-label-large">次关键词（至少 3 个，最多 5 个）</label>
                    <div className="space-y-2">
                      {Array.from({ length: 5 }, (_, index) => (
                        <input
                          key={`secondary-${index}`}
                          type="text"
                          value={keywordPlan.secondary_keywords[index] ?? ''}
                          onChange={(e) => updateKeywordPlanField('secondary_keywords', index, e.target.value)}
                          className="app-input w-full"
                          placeholder={`次关键词 ${index + 1}`}
                          required={index < 3}
                        />
                      ))}
                    </div>
                  </div>
                  {keywordSuggestionData && (
                    <div className="rounded-xl border p-3 md-body-small" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                      <p className="md-label-large">关键词建议来源：{keywordSuggestionData.provider}</p>
                      <p className="mt-1 opacity-70">意图信号：{keywordSuggestionData.intent_signals.join(' / ') || '—'}</p>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {keywordSuggestionData.supporting_metrics.slice(0, 4).map((item) => (
                          <div key={item.keyword} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                            <p className="md-label-medium">{item.keyword}</p>
                            <p className="opacity-70">SV {item.search_volume} · KD {item.difficulty} · {item.intent}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block md-label-large">长尾问题列表</label>
                    <div className="space-y-2">
                      {Array.from({ length: 5 }, (_, index) => (
                        <input
                          key={`question-${index}`}
                          type="text"
                          value={keywordPlan.long_tail_questions[index] ?? ''}
                          onChange={(e) => updateKeywordPlanField('long_tail_questions', index, e.target.value)}
                          className="app-input w-full"
                          placeholder={`长尾问题 ${index + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 'serp_analysis' && (
                <div className="space-y-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-chart-line" style={{ color: 'var(--md-sys-color-primary)' }} />
                      <div>
                        <p className="md-title-small">2. SERP 分析</p>
                        <p className="md-body-small opacity-70">记录前 10 名的内容类型、标题角度、结构、字数和内容缺口。</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => void handleFetchSerp()} disabled={serpLoading} className="app-btn app-btn-outline">
                      <i className={serpLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-magnifying-glass-chart'} />
                      拉取 SERP
                    </button>
                  </div>
                  {serpResearchData && (
                    <div className="rounded-xl border p-3 md-body-small" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                      <p className="md-label-large">SERP 洞察速览</p>
                      <p className="mt-1 opacity-80">内容类型：{serpResearchData.patterns.join(' / ') || '—'}</p>
                      <p className="mt-1 opacity-80">标题角度：{serpResearchData.title_angles.join(' / ') || '—'}</p>
                      <p className="mt-1 opacity-80">结构特征：{serpResearchData.structure_features.join(' / ') || '—'}</p>
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="mb-1 block md-label-large">SERP 总结</label>
                    <textarea value={serpAnalysis.summary} onChange={(e) => setSerpAnalysis((prev) => ({ ...prev, summary: e.target.value }))} className="app-textarea h-24 w-full resize-y" placeholder="例如：结果页以教程与对比文章为主，但缺少面向新手的执行清单。" />
                  </div>
                  <div className="space-y-3">
                    {serpAnalysis.top_results.map((entry, index) => (
                      <div key={entry.rank} className="rounded-xl border p-3" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm" style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}>#{entry.rank}</span>
                          <span className="md-label-large">SERP 第 {entry.rank} 名</span>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <input type="text" value={entry.content_type} onChange={(e) => updateSerpEntry(index, 'content_type', e.target.value)} className="app-input w-full" placeholder="内容类型：指南 / 清单 / 产品页" required />
                          <input type="text" value={entry.title_angle} onChange={(e) => updateSerpEntry(index, 'title_angle', e.target.value)} className="app-input w-full" placeholder="标题角度：终极指南 / 对比 / 模板" required />
                          <input type="text" value={entry.structure} onChange={(e) => updateSerpEntry(index, 'structure', e.target.value)} className="app-input w-full md:col-span-2" placeholder="结构：痛点 -> 步骤 -> FAQ -> CTA" required />
                          <input type="number" min={0} value={entry.word_count} onChange={(e) => updateSerpEntry(index, 'word_count', Number(e.target.value) || 0)} className="app-input w-full" placeholder="字数" required />
                          <input type="text" value={entry.content_gap} onChange={(e) => updateSerpEntry(index, 'content_gap', e.target.value)} className="app-input w-full" placeholder="内容缺口：缺少案例 / 更新不及时 / 没有模板" required />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeStep === 'seo_brief' && (
                <div className="space-y-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-file-circle-check" style={{ color: 'var(--md-sys-color-primary)' }} />
                      <div>
                        <p className="md-title-small">3. SEO Brief</p>
                        <p className="md-body-small opacity-70">整理 audience、intent、outline、entities、internal links、CTA 和 metadata。</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => void handleGenerateBrief()} disabled={briefLoading} className="app-btn app-btn-outline">
                      <i className={briefLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-file-circle-check'} />
                      生成 SEO Brief
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input type="text" value={seoBrief.audience} onChange={(e) => setSeoBrief((prev) => ({ ...prev, audience: e.target.value }))} className="app-input w-full" placeholder="Audience：目标受众" required />
                    <input type="text" value={seoBrief.intent} onChange={(e) => setSeoBrief((prev) => ({ ...prev, intent: e.target.value }))} className="app-input w-full" placeholder="Intent：搜索意图" required />
                  </div>
                  <div>
                    <label className="mb-1 block md-label-large">Outline</label>
                    <div className="space-y-2">
                      {Array.from({ length: 6 }, (_, index) => (
                        <input
                          key={`outline-${index}`}
                          type="text"
                          value={seoBrief.outline[index] ?? ''}
                          onChange={(e) => updateSeoBriefList('outline', index, e.target.value)}
                          className="app-input w-full"
                          placeholder={`大纲段落 ${index + 1}`}
                          required={index === 0}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block md-label-large">Entities</label>
                      <div className="space-y-2">
                        {Array.from({ length: 5 }, (_, index) => (
                          <input
                            key={`entity-${index}`}
                            type="text"
                            value={seoBrief.entities[index] ?? ''}
                            onChange={(e) => updateSeoBriefList('entities', index, e.target.value)}
                            className="app-input w-full"
                            placeholder={`实体 ${index + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block md-label-large">Internal Links</label>
                      <div className="space-y-2">
                        {Array.from({ length: 4 }, (_, index) => (
                          <input
                            key={`link-${index}`}
                            type="text"
                            value={seoBrief.internal_links[index] ?? ''}
                            onChange={(e) => updateSeoBriefList('internal_links', index, e.target.value)}
                            className="app-input w-full"
                            placeholder={`内部链接建议 ${index + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block md-label-large">CTA</label>
                    <input type="text" value={seoBrief.cta} onChange={(e) => setSeoBrief((prev) => ({ ...prev, cta: e.target.value }))} className="app-input w-full" placeholder="例如：预约演示 / 下载模板 / 联系顾问" required />
                  </div>
                  <div className="rounded-xl border p-3" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                    <p className="mb-2 md-label-large">Metadata</p>
                    <div className="space-y-2">
                      <input type="text" value={seoBrief.metadata.seo_title} onChange={(e) => setSeoBrief((prev) => ({ ...prev, metadata: { ...prev.metadata, seo_title: e.target.value } }))} className="app-input w-full" placeholder="SEO title" required />
                      <textarea value={seoBrief.metadata.meta_description} onChange={(e) => setSeoBrief((prev) => ({ ...prev, metadata: { ...prev.metadata, meta_description: e.target.value } }))} className="app-textarea h-20 w-full resize-y" placeholder="Meta description" required />
                      <input type="text" value={seoBrief.metadata.slug} onChange={(e) => setSeoBrief((prev) => ({ ...prev, metadata: { ...prev.metadata, slug: e.target.value } }))} className="app-input w-full" placeholder="slug，例如 seo-brief-template" required />
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 'execution' && (
                <div className="space-y-3">
                  <div className="mb-3 flex items-center gap-2">
                    <i className="fa-solid fa-route" style={{ color: 'var(--md-sys-color-primary)' }} />
                    <div>
                      <p className="md-title-small">4. 生成与优化工作流</p>
                      <p className="md-body-small opacity-70">分别记录初稿生成、on-page 优化、质量审校与复盘记录的目标和备注。</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {WORKFLOW_STAGE_CONFIG.map((stage) => (
                      <div key={stage.key} className="rounded-xl border p-3" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                        <div className="mb-2 flex items-start gap-3">
                          <i className={`${stage.icon} mt-1`} style={{ color: 'var(--md-sys-color-primary)' }} />
                          <div>
                            <p className="md-label-large">{stage.title}</p>
                            <p className="md-body-small opacity-70">{stage.description}</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={workflow[stage.key].goal}
                            onChange={(e) => updateWorkflowStage(stage.key, 'goal', e.target.value)}
                            className="app-input w-full"
                            placeholder={`${stage.title}目标`}
                            required
                          />
                          <textarea
                            value={workflow[stage.key].notes}
                            onChange={(e) => updateWorkflowStage(stage.key, 'notes', e.target.value)}
                            className="app-textarea h-20 w-full resize-y"
                            placeholder={`${stage.title}备注（可选）`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={goToPreviousStep} disabled={activeStepIndex === 0} className="app-btn app-btn-outline">
                  上一步
                </button>
                {activeStepIndex < ARTICLE_STEP_CONFIG.length - 1 && (
                  <button type="button" onClick={goToNextStep} className="app-btn app-btn-outline">
                    下一步
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="app-btn w-full py-2 md-label-large transition-all duration-200 hover:shadow-lg disabled:opacity-60"
              style={{ background: loading ? 'var(--md-sys-state-disabled-text)' : 'var(--md-sys-color-primary)' }}
            >
              <i className={loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-wand-magic-sparkles'} />
              {loading ? t('aiContent.generating') : '根据 Brief 生成初稿'}
            </button>
          </form>
        </div>
      </div>

      <div className="lg:col-span-2">
        {error && (
          <div className="mb-4 flex items-center gap-2 p-4 md-body-medium shape-medium" style={{ background: 'color-mix(in srgb, var(--md-sys-color-error) 14%, transparent)', color: 'var(--md-sys-color-error)', border: '1px solid color-mix(in srgb, var(--md-sys-color-error) 35%, white)' }}>
            <i className="fa-solid fa-circle-exclamation" />
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="shape-large border bg-[color:var(--md-sys-color-surface)] p-6 shadow-md" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="md-title-large">{result.draft.title}</h2>
                  <p className="mt-2 md-body-medium opacity-70">{result.draft.summary}</p>
                </div>
                <button
                  onClick={() => editableDocument && handleExport(exportCanvas(editableDocument, 'text'))}
                  className="flex items-center gap-1 px-3 py-2 md-label-medium shape-small transition-colors hover:shadow"
                  style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                >
                  <i className="fa-regular fa-copy" />
                  {t('aiContent.copy')}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {result.draft.keywords_used.map((kw, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2.5 py-1 md-label-medium shape-full"
                    style={{ background: 'color-mix(in srgb, var(--md-sys-color-primary-container) 70%, white)', color: 'var(--md-sys-color-on-primary-container)' }}
                  >
                    <i className="fa-solid fa-tag mr-1 text-[10px]" />
                    {kw}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <ResultCard title="Keyword Plan" icon="fa-solid fa-key">
                <p className="md-body-small opacity-80">主关键词：{result.keyword_plan.primary_keyword || '—'}</p>
                <p className="mt-2 md-body-small opacity-80">搜索意图：{result.keyword_plan.intent.summary || '—'}</p>
                <p className="mt-1 md-body-small opacity-80">目标读者：{result.keyword_plan.intent.target_audience || '—'}</p>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">次关键词</p>
                  <ResultList items={result.keyword_plan.secondary_keywords} />
                </div>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">长尾问题</p>
                  <ResultList items={result.keyword_plan.long_tail_questions} />
                </div>
              </ResultCard>

              <ResultCard title="SERP Summary" icon="fa-solid fa-magnifying-glass-chart">
                <p className="md-body-small opacity-85">{result.serp_summary.summary}</p>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">共性模式</p>
                  <ResultList items={result.serp_summary.key_patterns} />
                </div>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">信息增量</p>
                  <ResultList items={result.serp_summary.information_gain} />
                </div>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">差异化角度</p>
                  <ResultList items={result.serp_summary.differentiators} />
                </div>
              </ResultCard>

              <ResultCard title="Brief" icon="fa-solid fa-file-circle-check">
                <p className="md-body-small opacity-80">Title tag：{result.brief.title_tag || '—'}</p>
                <p className="mt-1 md-body-small opacity-80">Meta description：{result.brief.meta_description || '—'}</p>
                <p className="mt-1 md-body-small opacity-80">URL slug：{result.brief.url_slug || '—'}</p>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">Heading Tree</p>
                  <HeadingTreeList items={result.brief.heading_tree} />
                </div>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">Internal Links</p>
                  <ResultList items={result.brief.internal_links} />
                </div>
              </ResultCard>

              <ResultCard title="On-page" icon="fa-solid fa-screwdriver-wrench">
                <p className="md-body-small opacity-80">优化标题：{result.on_page.title_tag || '—'}</p>
                <p className="mt-1 md-body-small opacity-80">优化描述：{result.on_page.meta_description || '—'}</p>
                <p className="mt-1 md-body-small opacity-80">URL：{result.on_page.url_slug || '—'}</p>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">Image Alt 建议</p>
                  <ResultList items={result.on_page.image_alt} />
                </div>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">Schema 建议</p>
                  <ResultList items={result.on_page.schema_recommendations} />
                </div>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">执行清单</p>
                  <ResultList items={result.on_page.checklist} />
                </div>
              </ResultCard>

              <ResultCard title="Quality Review" icon="fa-solid fa-shield-heart">
                <p className="md-body-small opacity-80">结论：{result.quality_review.verdict || '—'}</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="rounded-lg border p-3 md-body-small" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>废话：{result.quality_review.fluff || '—'}</div>
                  <div className="rounded-lg border p-3 md-body-small" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>例子：{result.quality_review.missing_examples || '—'}</div>
                  <div className="rounded-lg border p-3 md-body-small" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>经验/证据：{result.quality_review.experience_evidence || '—'}</div>
                  <div className="rounded-lg border p-3 md-body-small" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>适合扫读：{result.quality_review.skim_friendly || '—'}</div>
                </div>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">亮点</p>
                  <ResultList items={result.quality_review.strengths} />
                </div>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">风险</p>
                  <ResultList items={result.quality_review.risks} />
                </div>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">修正建议</p>
                  <ResultList items={result.quality_review.fixes} />
                </div>
              </ResultCard>

              <ResultCard title="Publish Review Plan" icon="fa-solid fa-rocket">
                <div>
                  <p className="mb-2 md-label-large">发布前检查</p>
                  <ResultList items={result.publish_review_plan.pre_publish_checks} />
                </div>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">发布后指标</p>
                  <ResultList items={result.publish_review_plan.post_publish_metrics} />
                </div>
                <div className="mt-3">
                  <p className="mb-2 md-label-large">后续迭代</p>
                  <ResultList items={result.publish_review_plan.iteration_ideas} />
                </div>
              </ResultCard>
            </div>

            <ResultCard title="工作流检查点" icon="fa-solid fa-list-check">
              <div className="grid gap-3 md:grid-cols-2">
                {WORKFLOW_STAGE_CONFIG.map((stage) => (
                  <div key={stage.key} className="rounded-xl border p-3" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                    <p className="md-label-large">{stage.title}</p>
                    <p className="mt-2 md-body-small opacity-80">目标：{workflow[stage.key].goal || '—'}</p>
                    <p className="mt-1 md-body-small opacity-70">备注：{workflow[stage.key].notes || '—'}</p>
                  </div>
                ))}
              </div>
            </ResultCard>

            <div className="shape-medium border bg-[color:var(--md-sys-color-surface)] p-4" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
              <div className="flex items-center gap-4">
                <i className="fa-solid fa-rotate" style={{ color: 'var(--md-sys-color-error)' }} />
                <input
                  type="text"
                  value={rewriteInstruction}
                  onChange={(e) => setRewriteInstruction(e.target.value)}
                  className="flex-1 border-0 bg-transparent text-[color:var(--md-sys-color-on-surface)] focus:outline-none md-body-medium"
                  placeholder={t('aiContent.article.rewritePlaceholder')}
                />
                <button
                  onClick={handleRewrite}
                  disabled={rewriting}
                  className="app-btn app-btn-danger px-4 py-2 md-label-large transition-all hover:shadow"
                  style={{ background: 'var(--md-sys-color-error)' }}
                >
                  {rewriting ? <i className="fa-solid fa-spinner fa-spin" /> : t('aiContent.article.rewrite')}
                </button>
              </div>
            </div>

            <div className="shape-medium border bg-[color:var(--md-sys-color-surface)] p-4 space-y-4" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block md-label-large">目标 URL</label>
                  <input
                    type="url"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="app-input w-full"
                    placeholder="https://example.com/blog/your-article"
                  />
                </div>
                <div>
                  <label className="mb-1 block md-label-large">发布状态</label>
                  <select value={publicationStatus} onChange={(e) => setPublicationStatus(e.target.value as AiDraftPublicationStatus)} className="app-select w-full">
                    <option value="draft">草稿</option>
                    <option value="saved">已保存</option>
                    <option value="published">已发布</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => void handleSaveDraft(false)} disabled={savingDraft || !editableDocument || !projectId} className="app-btn app-btn-outline">
                  保存草稿
                </button>
                <button onClick={() => void handleSaveDraft(true)} disabled={savingDraft || !activeDraft || !editableDocument} className="app-btn app-btn-outline">
                  另存版本
                </button>
                {activeDraft && (
                  <button onClick={() => void handleRollback(Math.max(1, activeDraft.version - 1))} disabled={savingDraft || activeDraft.version <= 1} className="app-btn app-btn-outline">
                    回滚到上一版本
                  </button>
                )}
                <button onClick={() => void handleLoadRetrospective()} disabled={retrospectiveLoading || !activeDraft || !projectId} className="app-btn app-btn-outline">
                  <i className={retrospectiveLoading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-chart-column'} />
                  查看复盘数据
                </button>
              </div>
              <div>
                <label className="mb-1 block md-label-large">加载草稿</label>
                <select
                  value={activeDraftId ?? ''}
                  onChange={(e) => {
                    const selected = drafts.find((item) => item.id === Number(e.target.value));
                    if (selected) handleLoadDraft(selected);
                  }}
                  className="app-select w-full"
                >
                  <option value="">选择草稿版本</option>
                  {drafts.map((draft) => (
                    <option key={draft.id} value={draft.id}>{`${draft.title} (v${draft.version})`}</option>
                  ))}
                </select>
              </div>
            </div>

            {retrospective && (
              <ResultCard title="Retrospective" icon="fa-solid fa-chart-column">
                <p className="md-body-small opacity-80">目标 URL：{retrospective.target_url || '—'}</p>
                <p className="mt-1 md-body-small opacity-80">发布状态：{retrospective.publication_status}</p>
                {retrospective.content_performance && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="rounded-lg border p-3 md-body-small" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>30 天会话：{retrospective.content_performance.sessions}</div>
                    <div className="rounded-lg border p-3 md-body-small" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>30 天转化率：{retrospective.content_performance.conversion_rate}%</div>
                    <div className="rounded-lg border p-3 md-body-small" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>7 天变化：{retrospective.content_performance.change_7d}%</div>
                    <div className="rounded-lg border p-3 md-body-small" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>30 天变化：{retrospective.content_performance.change_30d}%</div>
                  </div>
                )}
                {retrospective.ranking && (
                  <div className="mt-3 rounded-lg border p-3 md-body-small" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                    已跟踪关键词：{retrospective.ranking.tracked_keywords} · 平均排名：{retrospective.ranking.avg_rank ?? '—'} · Top 10：{retrospective.ranking.top_10}
                  </div>
                )}
                {retrospective.traffic && (
                  <div className="mt-3 rounded-lg border p-3 md-body-small" style={{ borderColor: 'var(--md-sys-color-outline-variant)' }}>
                    最近流量快照：{retrospective.traffic.latest_date || '—'} · 近 7 天会话：{retrospective.traffic.sessions_7d} · 近 30 天会话：{retrospective.traffic.sessions_30d}
                  </div>
                )}
                <div className="mt-3">
                  <p className="mb-2 md-label-large">复盘洞察</p>
                  <ResultList items={retrospective.insights} />
                </div>
              </ResultCard>
            )}

            {editableDocument && (
              <CanvasContentEditor
                document={editableDocument}
                onChange={setEditableDocument}
                placeholder={t('aiContent.article.editorPlaceholder')}
                onExport={({ content }) => handleExport(content)}
              />
            )}
          </div>
        )}

        {!result && !loading && (
          <div className="shape-large flex flex-col items-center justify-center border-2 border-dashed p-16 text-center" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
            <i className="fa-solid fa-diagram-project mb-4 text-5xl" style={{ color: 'var(--md-sys-color-primary-container)' }} />
            <p className="md-title-large mb-1">先完成文章工作流，再生成内容</p>
            <p className="md-body-medium opacity-50">左侧已按关键词规划、SERP 分析、SEO brief 与执行流程拆分为多步骤输入。</p>
          </div>
        )}

        {loading && !result && (
          <div className="shape-large flex flex-col items-center justify-center border bg-[color:var(--md-sys-color-surface)] p-16 text-center" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
            <i className="fa-solid fa-spinner fa-spin mb-4 text-4xl" style={{ color: 'var(--md-sys-color-primary)' }} />
            <p className="md-label-large">{t('aiContent.generating')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────── Social Media Content Generator Tab ───────────────────── */

function SocialGenerator() {
  const { t } = useTranslation();
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState('twitter');
  const [tone, setTone] = useState('engaging');
  const [language, setLanguage] = useState('zh-CN');
  const [includeHashtags, setIncludeHashtags] = useState(true);
  const [count, setCount] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [posts, setPosts] = useState<AiSocialPost[]>([]);
  const [postDocuments, setPostDocuments] = useState<CanvasDocument[]>([]);
  const projects = useProjectOptions();
  const [projectId, setProjectId] = useState<number | ''>('');
  const [drafts, setDrafts] = useState<AiContentDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPosts([]);
    await runWithUiState(async () => {
      const data = await generateSocialContent({
        topic,
        platform,
        tone,
        language,
        include_hashtags: includeHashtags,
        count,
      });
      setPosts(data.posts);
      setPostDocuments(
        data.posts.map((post) => {
          const structuredBlocks = post.blocks ?? [];
          return structuredBlocks.length > 0
            ? socialBlocksToCanvas(structuredBlocks, post.hashtags)
            : socialToCanvas(post.content, post.hashtags);
        }),
      );
    }, {
      setLoading,
      setError,
      clearErrorValue: '',
      formatError: (error: unknown) => getErrorMessage(error, t('aiContent.errors.generateFailed')),
    });
  };

  const copyPost = (index: number) => {
    const doc = postDocuments[index];
    if (!doc) return;
    navigator.clipboard.writeText(exportCanvas(doc, 'text'));
  };

  const updatePostDocument = (index: number, doc: CanvasDocument) => {
    setPostDocuments((prev) => prev.map((item, i) => (i === index ? doc : item)));
  };

  const refreshDrafts = useCallback(async (pid: number) => {
    const data = await listAiContentDrafts(pid, { content_type: 'social' });
    setDrafts(data);
  }, []);

  const saveSocialDraft = async (saveAsNewVersion = false) => {
    if (typeof projectId !== 'number' || !postDocuments[0]) return;
    const payload = {
      title: topic || 'Untitled Social Draft',
      canvas_document_json: postDocuments[0] as unknown as Record<string, unknown>,
      export_text: exportCanvas(postDocuments[0], 'text'),
    };
    if (activeDraftId) {
      const current = drafts.find((item) => item.id === activeDraftId);
      if (!current) return;
      const updated = await updateAiContentDraft(activeDraftId, { ...payload, expected_version: current.version, save_as_new_version: saveAsNewVersion });
      setActiveDraftId(updated.id);
    } else {
      const created = await createAiContentDraft(projectId, { ...payload, content_type: 'social' });
      setActiveDraftId(created.id);
    }
    await refreshDrafts(projectId);
  };

  useEffect(() => {
    if (typeof projectId !== 'number') return;
    const timeoutId = window.setTimeout(() => {
      void refreshDrafts(projectId);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [projectId, refreshDrafts]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Settings panel */}
      <div className="lg:col-span-1">
        <div className="shape-large shadow-md border p-6 bg-[color:var(--md-sys-color-surface)] border-[color:var(--md-sys-color-outline)]" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
          <h2 className="md-title-medium mb-4 flex items-center gap-2">
            <i className="fa-solid fa-share-nodes" style={{ color: 'var(--md-sys-color-primary)' }} />
            {t('aiContent.social.settings')}
          </h2>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block md-label-large mb-1">项目（用于草稿保存）</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')} className="app-select w-full">
                <option value="">请选择项目</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block md-label-large mb-1">{t('aiContent.social.topic')}</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="app-input w-full"
                style={{ borderColor: 'var(--md-sys-color-outline)' }}
                placeholder={t('aiContent.social.topicPlaceholder')}
                required
              />
            </div>

            <div>
              <label className="block md-label-large mb-2">{t('aiContent.social.platform')}</label>
              <div className="grid grid-cols-3 gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPlatform(p.value)}
                    className="flex flex-col items-center gap-1 p-2 shape-small border md-label-medium transition-all"
                    style={{
                      borderColor: platform === p.value ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline)',
                      background: platform === p.value ? 'var(--md-sys-color-primary-container)' : 'transparent',
                      color: platform === p.value ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)',
                    }}
                  >
                    <i className={`${p.icon} text-lg`} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block md-label-large mb-1">{t('aiContent.social.tone')}</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="app-select w-full"
                  style={{ borderColor: 'var(--md-sys-color-outline)' }}
                >
                  {TONES_SOCIAL.map((t_) => (
                    <option key={t_.value} value={t_.value}>{t(t_.labelKey)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block md-label-large mb-1">{t('aiContent.social.count')}</label>
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="app-select w-full"
                  style={{ borderColor: 'var(--md-sys-color-outline)' }}
                >
                  {[1, 2, 3, 5, 10].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block md-label-large mb-1">{t('aiContent.article.language')}</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="app-select w-full"
                style={{ borderColor: 'var(--md-sys-color-outline)' }}
              >
                <option value="zh-CN">中文</option>
                <option value="en-US">English</option>
              </select>
            </div>

            <label className="flex items-center gap-2 md-label-large cursor-pointer">
              <input
                type="checkbox"
                checked={includeHashtags}
                onChange={(e) => setIncludeHashtags(e.target.checked)}
                className="h-4 w-4 rounded accent-[var(--md-sys-color-primary)]"
              />
              {t('aiContent.social.includeHashtags')}
            </label>

            <button
              type="submit"
              disabled={loading}
              className="app-btn w-full shape-medium py-2 md-label-large transition-all duration-200 hover:shadow-lg disabled:opacity-60"
              style={{ background: loading ? 'var(--md-sys-state-disabled-text)' : 'var(--md-sys-color-primary)' }}
            >
              <i className={loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-paper-plane'} />
              {loading ? t('aiContent.generating') : t('aiContent.social.generate')}
            </button>
          </form>
        </div>
      </div>

      {/* Posts results */}
      <div className="lg:col-span-2 space-y-4">
        {error && (
          <div className="shape-medium p-4 flex items-center gap-2 md-body-medium" style={{ background: 'color-mix(in srgb, var(--md-sys-color-error) 14%, transparent)', color: 'var(--md-sys-color-error)', border: '1px solid color-mix(in srgb, var(--md-sys-color-error) 35%, white)' }}>
            <i className="fa-solid fa-circle-exclamation" />
            {error}
          </div>
        )}


        {postDocuments[0] && (
          <div className="shape-medium border p-4 bg-[color:var(--md-sys-color-surface)] border-[color:var(--md-sys-color-outline)] space-y-2" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
            <div className="flex gap-2 flex-wrap">
              <button className="app-btn app-btn-outline" onClick={() => void saveSocialDraft(false)} disabled={!projectId}>保存草稿</button>
              <button className="app-btn app-btn-outline" onClick={() => void saveSocialDraft(true)} disabled={!activeDraftId}>另存版本</button>
            </div>
            <select
              value={activeDraftId ?? ''}
              onChange={(e) => {
                const selected = drafts.find((item) => item.id === Number(e.target.value));
                if (selected) {
                  setActiveDraftId(selected.id);
                  setPostDocuments([selected.canvas_document_json as unknown as CanvasDocument]);
                }
              }}
              className="app-select w-full"
            >
              <option value="">加载草稿版本</option>
              {drafts.map((draft) => (
                <option key={draft.id} value={draft.id}>{`${draft.title} (v${draft.version})`}</option>
              ))}
            </select>
          </div>
        )}

        {posts.map((post, i) => {
          const platformInfo = PLATFORMS.find((p) => p.value === post.platform);
          return (
            <div
              key={i}
              className="shape-large shadow-md border p-6 bg-[color:var(--md-sys-color-surface)] border-[color:var(--md-sys-color-outline)] transition-all hover:shadow-lg"
              style={{ borderColor: 'var(--md-sys-color-outline)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 md-label-large">
                  <i className={platformInfo?.icon || 'fa-solid fa-share-nodes'} style={{ color: 'var(--md-sys-color-primary)' }} />
                  {platformInfo?.label || post.platform}
                  <span className="md-label-medium opacity-40">#{i + 1}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyPost(i)}
                    className="flex items-center gap-1 px-4 py-2 shape-small md-label-medium border transition-colors hover:bg-gray-50 dark:hover:bg-slate-800"
                    style={{ borderColor: 'var(--md-sys-color-outline)' }}
                  >
                    <i className="fa-regular fa-copy" />
                    {t('aiContent.copy')}
                  </button>
                </div>
              </div>

              {postDocuments[i] && (
                <CanvasContentEditor
                  document={postDocuments[i]}
                  onChange={(doc) => updatePostDocument(i, doc)}
                  placeholder={t('aiContent.social.topicPlaceholder')}
                  onExport={({ content }) => navigator.clipboard.writeText(content)}
                />
              )}

              {post.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {post.hashtags.map((tag, j) => (
                    <span
                      key={j}
                      className="inline-flex items-center px-2 py-1 shape-full md-label-medium"
                      style={{ background: 'color-mix(in srgb, var(--md-sys-color-primary-container) 50%, white)', color: 'var(--md-sys-color-on-primary-container)' }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {posts.length === 0 && !loading && (
          <div className="shape-large border-2 border-dashed p-16 flex flex-col items-center justify-center text-center" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
            <i className="fa-solid fa-comments text-5xl mb-4" style={{ color: 'var(--md-sys-color-primary-container)' }} />
            <p className="md-title-large mb-1">{t('aiContent.social.emptyTitle')}</p>
            <p className="md-body-medium opacity-50">{t('aiContent.social.emptySubtitle')}</p>
          </div>
        )}

        {loading && posts.length === 0 && (
          <div className="shape-large border border-[color:var(--md-sys-color-outline)] bg-[color:var(--md-sys-color-surface)] p-16 text-center flex flex-col items-center justify-center" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
            <i className="fa-solid fa-spinner fa-spin text-4xl mb-4" style={{ color: 'var(--md-sys-color-primary)' }} />
            <p className="md-label-large">{t('aiContent.generating')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────── SEO Analyzer Tab ───────────────────── */

function SeoAnalyzer() {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult('');
    await runWithUiState(async () => {
      const data = await analyzeSeoWithAi(content);
      setResult(data.result);
    }, {
      setLoading,
      setError,
      clearErrorValue: '',
      formatError: (error: unknown) => getErrorMessage(error, t('aiContent.errors.analyzeFailed')),
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Input panel */}
      <div>
        <div className="shape-large shadow-md border p-6 bg-[color:var(--md-sys-color-surface)] border-[color:var(--md-sys-color-outline)]" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
          <h2 className="md-title-medium mb-4 flex items-center gap-2">
            <i className="fa-solid fa-magnifying-glass-chart" style={{ color: 'var(--md-sys-color-primary)' }} />
            {t('aiContent.analyze.title')}
          </h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <textarea
              className="w-full shape-medium border px-4 py-3 h-64 md-body-medium focus:outline-none focus:ring-2 resize-y bg-[color:var(--md-sys-color-surface)] border-[color:var(--md-sys-color-outline)] text-[color:var(--md-sys-color-on-surface)]"
              style={{ borderColor: 'var(--md-sys-color-outline)' }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('aiContent.analyze.placeholder')}
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="app-btn w-full shape-medium py-2 md-label-large transition-all duration-200 hover:shadow-lg disabled:opacity-60"
              style={{ background: loading ? 'var(--md-sys-state-disabled-text)' : 'var(--md-sys-color-primary)' }}
            >
              <i className={loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-magnifying-glass'} />
              {loading ? t('aiContent.analyzing') : t('aiContent.analyze.submit')}
            </button>
          </form>
        </div>
      </div>

      {/* Result panel */}
      <div>
        {error && (
          <div className="mb-4 shape-medium p-4 flex items-center gap-2 md-body-medium" style={{ background: 'color-mix(in srgb, var(--md-sys-color-error) 14%, transparent)', color: 'var(--md-sys-color-error)', border: '1px solid color-mix(in srgb, var(--md-sys-color-error) 35%, white)' }}>
            <i className="fa-solid fa-circle-exclamation" />
            {error}
          </div>
        )}

        {result ? (
          <div className="shape-large shadow-md border p-6 bg-[color:var(--md-sys-color-surface)] border-[color:var(--md-sys-color-outline)]" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="md-title-medium flex items-center gap-2">
                <i className="fa-solid fa-chart-line" style={{ color: 'var(--md-sys-color-primary-container)' }} />
                {t('aiContent.analyze.result')}
              </h2>
              <button
                onClick={() => navigator.clipboard.writeText(result)}
                className="flex items-center gap-1 px-3 py-2 shape-small md-label-medium transition-colors"
                style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
              >
                <i className="fa-regular fa-copy" />
                {t('aiContent.copy')}
              </button>
            </div>
            <pre className="whitespace-pre-wrap md-body-medium leading-7 opacity-80">{result}</pre>
          </div>
        ) : (
          !loading && (
            <div className="shape-large border-2 border-dashed p-16 flex flex-col items-center justify-center text-center" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
              <i className="fa-solid fa-chart-pie text-5xl mb-4" style={{ color: 'var(--md-sys-color-primary-container)' }} />
              <p className="md-title-large mb-1">{t('aiContent.analyze.emptyTitle')}</p>
              <p className="md-body-medium opacity-50">{t('aiContent.analyze.emptySubtitle')}</p>
            </div>
          )
        )}

        {loading && !result && (
          <div className="shape-large border border-[color:var(--md-sys-color-outline)] bg-[color:var(--md-sys-color-surface)] p-16 text-center flex flex-col items-center justify-center" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
            <i className="fa-solid fa-spinner fa-spin text-4xl mb-4" style={{ color: 'var(--md-sys-color-primary)' }} />
            <p className="md-label-large">{t('aiContent.analyzing')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

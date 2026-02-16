import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  generateSeoArticle,
  generateSocialContent,
  rewriteContent,
  analyzeSeoWithAi,
  type AiGenerateArticleResponse,
  type AiSocialPost,
} from '../api';

type TabKey = 'article' | 'social' | 'analyze';

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

export default function AiContentGeneration() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>('article');

  const tabs: { key: TabKey; icon: string; labelKey: string }[] = [
    { key: 'article', icon: 'fa-solid fa-file-lines', labelKey: 'aiContent.tabs.article' },
    { key: 'social', icon: 'fa-solid fa-share-nodes', labelKey: 'aiContent.tabs.social' },
    { key: 'analyze', icon: 'fa-solid fa-magnifying-glass-chart', labelKey: 'aiContent.tabs.analyze' },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="md-headline-large flex items-center gap-4">
          <i className="fa-solid fa-wand-magic-sparkles" style={{ color: 'var(--md-sys-color-primary)' }} />
          {t('aiContent.title')}
        </h1>
        <p className="md-body-medium mt-1 opacity-60">{t('aiContent.subtitle')}</p>
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

/* ───────────────────── Rich Text Editor ───────────────────── */

function RichTextEditor({
  content,
  onChange,
  placeholder,
}: {
  content: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const [isMarkdownMode, setIsMarkdownMode] = useState(false);

  const execCmd = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleEditorInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleMarkdownChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  const toolbarButtons = [
    { icon: 'fa-solid fa-bold', cmd: 'bold', title: t('aiContent.editor.bold') },
    { icon: 'fa-solid fa-italic', cmd: 'italic', title: t('aiContent.editor.italic') },
    { icon: 'fa-solid fa-underline', cmd: 'underline', title: t('aiContent.editor.underline') },
    { icon: 'fa-solid fa-strikethrough', cmd: 'strikeThrough', title: t('aiContent.editor.strikethrough') },
    { divider: true },
    { icon: 'fa-solid fa-heading', cmd: 'formatBlock', value: 'h2', title: 'H2' },
    { icon: 'fa-solid fa-h', cmd: 'formatBlock', value: 'h3', title: 'H3' },
    { divider: true },
    { icon: 'fa-solid fa-list-ul', cmd: 'insertUnorderedList', title: t('aiContent.editor.bulletList') },
    { icon: 'fa-solid fa-list-ol', cmd: 'insertOrderedList', title: t('aiContent.editor.numberedList') },
    { divider: true },
    { icon: 'fa-solid fa-quote-left', cmd: 'formatBlock', value: 'blockquote', title: t('aiContent.editor.quote') },
    { icon: 'fa-solid fa-link', cmd: 'createLink', title: t('aiContent.editor.link') },
    { icon: 'fa-solid fa-eraser', cmd: 'removeFormat', title: t('aiContent.editor.clearFormat') },
  ];

  return (
    <div className="shape-medium overflow-hidden border border-[color:var(--md-sys-color-outline)]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[color:var(--md-sys-color-outline)] bg-[color:var(--md-sys-color-surface-variant)] px-4 py-2">
        {toolbarButtons.map((btn, i) => {
          if ('divider' in btn) {
            return <div key={i} className="w-px h-5 mx-1" style={{ background: 'var(--md-sys-color-outline)' }} />;
          }
          return (
            <button
              key={i}
              type="button"
              title={btn.title}
              onClick={() => {
                if (btn.cmd === 'createLink') {
                  const url = prompt(t('aiContent.editor.enterUrl'));
                  if (url) execCmd(btn.cmd, url);
                } else if (btn.value) {
                  execCmd(btn.cmd!, `<${btn.value}>`);
                } else {
                  execCmd(btn.cmd!);
                }
              }}
              className="w-8 h-8 rounded flex items-center justify-center md-body-medium hover:bg-white transition-colors"
              style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
            >
              <i className={btn.icon} />
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setIsMarkdownMode(!isMarkdownMode)}
          className="shape-small flex items-center gap-1 px-4 py-2 md-label-medium transition-colors"
          style={{
            background: isMarkdownMode ? 'var(--md-sys-color-primary)' : 'transparent',
            color: isMarkdownMode ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)',
            border: `1px solid ${isMarkdownMode ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline)'}`,
          }}
        >
          <i className="fa-solid fa-code" />
          {t('aiContent.editor.markdown')}
        </button>
      </div>

      {/* Editor area */}
      {isMarkdownMode ? (
        <textarea
          className="w-full min-h-[400px] px-4 py-4 md-body-medium font-mono resize-y focus:outline-none bg-[color:var(--md-sys-color-surface)] text-[color:var(--md-sys-color-on-surface)]"
          value={content}
          onChange={handleMarkdownChange}
          placeholder={placeholder}
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleEditorInput}
          dangerouslySetInnerHTML={{ __html: content }}
          className="w-full min-h-[400px] max-w-none px-4 py-4 md-body-medium prose prose-sm focus:outline-none bg-[color:var(--md-sys-color-surface)] text-[color:var(--md-sys-color-on-surface)]"
          data-placeholder={placeholder}
          
        />
      )}
    </div>
  );
}

/* ───────────────────── SEO Article Generator Tab ───────────────────── */

function ArticleGenerator() {
  const { t } = useTranslation();
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [tone, setTone] = useState('professional');
  const [wordCount, setWordCount] = useState(1500);
  const [outline, setOutline] = useState('');
  const [language, setLanguage] = useState('zh-CN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AiGenerateArticleResponse | null>(null);
  const [editableContent, setEditableContent] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState('');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const data = await generateSeoArticle({
        topic,
        keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
        tone,
        language,
        word_count: wordCount,
        outline: outline || undefined,
      });
      setResult(data);
      setEditableContent(data.content);
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('aiContent.errors.generateFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleRewrite = async () => {
    if (!editableContent) return;
    setRewriting(true);
    try {
      const data = await rewriteContent({
        content: editableContent,
        instruction: rewriteInstruction,
        language,
      });
      setEditableContent(data.result);
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('aiContent.errors.rewriteFailed'));
    } finally {
      setRewriting(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editableContent);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left panel - Settings */}
      <div className="lg:col-span-1">
        <div className="shape-large shadow-md border p-6 bg-[color:var(--md-sys-color-surface)] border-[color:var(--md-sys-color-outline)]" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
          <h2 className="md-title-medium mb-4 flex items-center gap-2">
            <i className="fa-solid fa-sliders" style={{ color: 'var(--md-sys-color-primary)' }} />
            {t('aiContent.article.settings')}
          </h2>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block md-label-large mb-1">{t('aiContent.article.topic')}</label>
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

            <div>
              <label className="block md-label-large mb-1">{t('aiContent.article.keywords')}</label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="app-input w-full"
                style={{ borderColor: 'var(--md-sys-color-outline)' }}
                placeholder={t('aiContent.article.keywordsPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block md-label-large mb-1">{t('aiContent.article.tone')}</label>
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
            </div>

            <div>
              <label className="block md-label-large mb-1">{t('aiContent.article.wordCount')}</label>
              <input
                type="range"
                min={300}
                max={5000}
                step={100}
                value={wordCount}
                onChange={(e) => setWordCount(Number(e.target.value))}
                className="w-full accent-[var(--md-sys-color-primary)]"
              />
              <div className="md-label-medium text-center mt-1 opacity-60">{wordCount} {t('aiContent.article.words')}</div>
            </div>

            <div>
              <label className="block md-label-large mb-1">{t('aiContent.article.outline')}</label>
              <textarea
                value={outline}
                onChange={(e) => setOutline(e.target.value)}
                className="app-textarea h-24 w-full resize-y"
                style={{ borderColor: 'var(--md-sys-color-outline)' }}
                placeholder={t('aiContent.article.outlinePlaceholder')}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="app-btn w-full shape-medium py-2 md-label-large transition-all duration-200 hover:shadow-lg disabled:opacity-60"
              style={{ background: loading ? 'var(--md-sys-state-disabled-text)' : 'var(--md-sys-color-primary)' }}
            >
              <i className={loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-wand-magic-sparkles'} />
              {loading ? t('aiContent.generating') : t('aiContent.article.generate')}
            </button>
          </form>
        </div>
      </div>

      {/* Right panel - Editor */}
      <div className="lg:col-span-2">
        {error && (
          <div className="mb-4 shape-medium p-4 flex items-center gap-2 md-body-medium" style={{ background: 'color-mix(in srgb, var(--md-sys-color-error) 14%, transparent)', color: 'var(--md-sys-color-error)', border: '1px solid color-mix(in srgb, var(--md-sys-color-error) 35%, white)' }}>
            <i className="fa-solid fa-circle-exclamation" />
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Article meta info card */}
            <div className="shape-large shadow-md border p-6 bg-[color:var(--md-sys-color-surface)] border-[color:var(--md-sys-color-outline)]" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
              <div className="flex items-start justify-between mb-4">
                <h2 className="md-title-large">{result.title}</h2>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-3 py-2 shape-small md-label-medium transition-colors hover:shadow"
                  style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                >
                  <i className="fa-regular fa-copy" />
                  {t('aiContent.copy')}
                </button>
              </div>
              <p className="md-body-medium opacity-70 mb-2">{result.meta_description}</p>
              <div className="flex flex-wrap gap-2">
                {result.keywords_used.map((kw, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2.5 py-1 shape-full md-label-medium"
                    style={{ background: 'color-mix(in srgb, var(--md-sys-color-primary-container) 70%, white)', color: 'var(--md-sys-color-on-primary-container)' }}
                  >
                    <i className="fa-solid fa-tag mr-1 text-[10px]" />
                    {kw}
                  </span>
                ))}
              </div>
            </div>

            {/* AI Rewrite bar */}
            <div className="shape-medium border p-4 flex items-center gap-4 bg-[color:var(--md-sys-color-surface)] border-[color:var(--md-sys-color-outline)]" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
              <i className="fa-solid fa-rotate" style={{ color: 'var(--md-sys-color-error)' }} />
              <input
                type="text"
                value={rewriteInstruction}
                onChange={(e) => setRewriteInstruction(e.target.value)}
                className="flex-1 border-0 bg-transparent md-body-medium text-[color:var(--md-sys-color-on-surface)] focus:outline-none"
                placeholder={t('aiContent.article.rewritePlaceholder')}
              />
              <button
                onClick={handleRewrite}
                disabled={rewriting}
                className="app-btn app-btn-danger px-4 py-2 md-label-large transition-all hover:shadow"
                style={{ background: 'var(--md-sys-color-error)' }}
              >
                {rewriting ? (
                  <i className="fa-solid fa-spinner fa-spin" />
                ) : (
                  t('aiContent.article.rewrite')
                )}
              </button>
            </div>

            {/* Rich text editor */}
            <RichTextEditor
              content={editableContent}
              onChange={setEditableContent}
              placeholder={t('aiContent.article.editorPlaceholder')}
            />
          </div>
        )}

        {!result && !loading && (
          <div className="shape-large border-2 border-dashed p-16 flex flex-col items-center justify-center text-center" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
            <i className="fa-solid fa-file-pen text-5xl mb-4" style={{ color: 'var(--md-sys-color-primary-container)' }} />
            <p className="md-title-large mb-1">{t('aiContent.article.emptyTitle')}</p>
            <p className="md-body-medium opacity-50">{t('aiContent.article.emptySubtitle')}</p>
          </div>
        )}

        {loading && !result && (
          <div className="shape-large border border-[color:var(--md-sys-color-outline)] bg-[color:var(--md-sys-color-surface)] p-16 text-center flex flex-col items-center justify-center" style={{ borderColor: 'var(--md-sys-color-outline)' }}>
            <i className="fa-solid fa-spinner fa-spin text-4xl mb-4" style={{ color: 'var(--md-sys-color-primary)' }} />
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
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPosts([]);
    setLoading(true);
    try {
      const data = await generateSocialContent({
        topic,
        platform,
        tone,
        language,
        include_hashtags: includeHashtags,
        count,
      });
      setPosts(data.posts);
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('aiContent.errors.generateFailed'));
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditContent(posts[index].content);
  };

  const saveEditing = () => {
    if (editingIndex !== null) {
      const updated = [...posts];
      updated[editingIndex] = { ...updated[editingIndex], content: editContent };
      setPosts(updated);
      setEditingIndex(null);
    }
  };

  const copyPost = (post: AiSocialPost) => {
    const text = post.content + (post.hashtags.length ? '\n\n' + post.hashtags.map((h) => `#${h}`).join(' ') : '');
    navigator.clipboard.writeText(text);
  };

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
                  {editingIndex === i ? (
                    <button
                      onClick={saveEditing}
                      className="flex items-center gap-1 px-4 py-2 shape-small md-label-medium"
                      style={{ background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)' }}
                    >
                      <i className="fa-solid fa-check" />
                      {t('aiContent.save')}
                    </button>
                  ) : (
                    <button
                      onClick={() => startEditing(i)}
                      className="flex items-center gap-1 px-4 py-2 shape-small md-label-medium border transition-colors hover:bg-gray-50 dark:hover:bg-slate-800"
                      style={{ borderColor: 'var(--md-sys-color-outline)' }}
                    >
                      <i className="fa-solid fa-pen" />
                      {t('aiContent.edit')}
                    </button>
                  )}
                  <button
                    onClick={() => copyPost(post)}
                    className="flex items-center gap-1 px-4 py-2 shape-small md-label-medium border transition-colors hover:bg-gray-50 dark:hover:bg-slate-800"
                    style={{ borderColor: 'var(--md-sys-color-outline)' }}
                  >
                    <i className="fa-regular fa-copy" />
                    {t('aiContent.copy')}
                  </button>
                </div>
              </div>

              {editingIndex === i ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full shape-small border px-3 py-2 md-body-medium h-32 resize-y focus:outline-none bg-[color:var(--md-sys-color-surface)] border-[color:var(--md-sys-color-outline)] text-[color:var(--md-sys-color-on-surface)]"
                  style={{ borderColor: 'var(--md-sys-color-primary)' }}
                />
              ) : (
                <p className="md-body-medium leading-7 whitespace-pre-wrap">{post.content}</p>
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
    setError('');
    setResult('');
    setLoading(true);
    try {
      const data = await analyzeSeoWithAi(content);
      setResult(data.result);
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('aiContent.errors.analyzeFailed'));
    } finally {
      setLoading(false);
    }
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

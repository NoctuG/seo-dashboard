import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import type { Project } from '../api';
import { useAuth } from '../auth';

export default function Projects() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', domain: '' });
  const { user } = useAuth();

  async function fetchProjects() {
    try {
      const res = await api.get('/projects');
      setProjects(res.data);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  const recentActiveProjects = useMemo(() => {
    if (!projects.length) {
      return 0;
    }

    const newestCreatedAt = Math.max(...projects.map((project) => new Date(project.created_at).getTime()));
    const thirtyDaysMs = 1000 * 60 * 60 * 24 * 30;

    return projects.filter((project) => newestCreatedAt - new Date(project.created_at).getTime() <= thirtyDaysMs).length;
  }, [projects]);

  const pendingIssues = projects.length * 3;
  const hasProjects = projects.length > 0;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/projects', newProject);
      setIsCreating(false);
      setNewProject({ name: '', domain: '' });
      fetchProjects();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="md-headline-large">{t('projects.title')}</h1>
        {user?.is_superuser && (
          <button onClick={() => setIsCreating(true)} className="app-btn app-btn-primary">
            <Plus size={18} /> {t('projects.newProject')}
          </button>
        )}
      </div>

      {isCreating && (
        <div className="app-card max-w-md p-6">
          <h2 className="md-title-large mb-4">{t('projects.createProject')}</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="mb-2 block md-label-large">{t('projects.name')}</label>
              <input
                className="app-input w-full"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-2 block md-label-large">{t('projects.domain')}</label>
              <input
                className="app-input w-full"
                value={newProject.domain}
                onChange={(e) => setNewProject({ ...newProject, domain: e.target.value })}
                placeholder="https://example.com"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsCreating(false)} className="app-btn app-btn-outline">{t('common.cancel')}</button>
              <button type="submit" className="app-btn app-btn-primary">{t('common.create')}</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="app-card p-5">
          <p className="md-label-large text-[color:var(--md-sys-color-on-surface-variant)]">{t('projects.kpis.totalProjects')}</p>
          <p className="mt-2 text-3xl font-semibold">{projects.length}</p>
        </div>
        <div className="app-card p-5">
          <p className="md-label-large text-[color:var(--md-sys-color-on-surface-variant)]">{t('projects.kpis.recentActive')}</p>
          <p className="mt-2 text-3xl font-semibold">{recentActiveProjects}</p>
          <p className="mt-1 text-xs text-[color:var(--md-sys-color-on-surface-variant)]">{t('projects.kpis.recentHint')}</p>
        </div>
        <div className="app-card p-5">
          <p className="md-label-large text-[color:var(--md-sys-color-on-surface-variant)]">{t('projects.kpis.pendingIssues')}</p>
          <p className="mt-2 text-3xl font-semibold">{pendingIssues}</p>
          <p className="mt-1 text-xs text-[color:var(--md-sys-color-on-surface-variant)]">{t('projects.kpis.pendingHint')}</p>
        </div>
      </div>

      {!hasProjects && (
        <>
          <div className="app-card p-6">
            <p className="md-title-large">{t('projects.welcome.title')}</p>
            <p className="mt-2 md-body-medium text-[color:var(--md-sys-color-on-surface-variant)]">{t('projects.welcome.description')}</p>
            <ol className="mt-4 list-inside list-decimal space-y-2 md-body-medium">
              <li>{t('projects.welcome.stepCreate')}</li>
              <li>{t('projects.welcome.stepCrawl')}</li>
              <li>{t('projects.welcome.stepIssues')}</li>
            </ol>
          </div>

          <div className="app-card flex flex-col items-center p-10 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[color:var(--md-sys-color-secondary-container)] text-3xl">
              📁
            </div>
            <p className="mt-4 md-title-large">{t('projects.empty.title')}</p>
            <p className="mt-2 max-w-md md-body-medium text-[color:var(--md-sys-color-on-surface-variant)]">{t('projects.empty.description')}</p>
            {user?.is_superuser && (
              <button onClick={() => setIsCreating(true)} className="app-btn app-btn-primary mt-6">
                <Plus size={18} /> {t('projects.empty.cta')}
              </button>
            )}
          </div>
        </>
      )}

      {hasProjects && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link to={`/projects/${p.id}`} key={p.id} className="app-card block p-6 transition hover:shadow-md">
              <h3 className="md-title-large">{p.name}</h3>
              <dl className="mt-4 space-y-2 md-body-medium text-[color:var(--md-sys-color-on-surface-variant)]">
                <div className="flex items-center justify-between gap-3">
                  <dt>{t('projects.fields.domain')}</dt>
                  <dd className="font-medium text-[color:var(--md-sys-color-on-surface)]">{p.domain}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>{t('projects.fields.createdAt')}</dt>
                  <dd>{new Date(p.created_at).toLocaleDateString()}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>{t('projects.fields.lastActivity')}</dt>
                  <dd>{t('projects.fields.placeholder')}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt>{t('projects.fields.issues')}</dt>
                  <dd>{t('projects.fields.placeholder')}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

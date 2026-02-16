import { useEffect, useState } from 'react';
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

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await api.get('/projects');
      setProjects(res.data);
    } catch (error) {
      console.error(error);
    }
  };

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
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{t('projects.title')}</h1>
        {user?.is_superuser && (
          <button onClick={() => setIsCreating(true)} className="app-btn app-btn-primary">
            <Plus size={18} /> {t('projects.newProject')}
          </button>
        )}
      </div>

      {isCreating && (
        <div className="app-card mb-6 max-w-md p-6">
          <h2 className="text-lg font-semibold mb-4">{t('projects.createProject')}</h2>
          <form onSubmit={handleCreate}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">{t('projects.name')}</label>
              <input
                className="app-input w-full"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">{t('projects.domain')}</label>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((p) => (
          <Link to={`/projects/${p.id}`} key={p.id} className="app-card block p-6 transition hover:shadow-md">
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="text-[color:var(--md-sys-color-on-surface-variant)]">{p.domain}</p>
            <p className="mt-4 text-sm text-[color:var(--md-sys-color-on-surface-variant)]">{t('projects.createdAt', { date: new Date(p.created_at).toLocaleDateString() })}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

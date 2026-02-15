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
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            <Plus size={18} /> {t('projects.newProject')}
          </button>
        )}
      </div>

      {isCreating && (
        <div className="bg-white p-6 rounded shadow mb-6 max-w-md">
          <h2 className="text-lg font-semibold mb-4">{t('projects.createProject')}</h2>
          <form onSubmit={handleCreate}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">{t('projects.name')}</label>
              <input
                className="w-full border rounded p-2"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">{t('projects.domain')}</label>
              <input
                className="w-full border rounded p-2"
                value={newProject.domain}
                onChange={(e) => setNewProject({ ...newProject, domain: e.target.value })}
                placeholder="https://example.com"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsCreating(false)} className="text-gray-600 px-4 py-2">{t('common.cancel')}</button>
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">{t('common.create')}</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((p) => (
          <Link to={`/projects/${p.id}`} key={p.id} className="block bg-white p-6 rounded shadow hover:shadow-md transition">
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="text-gray-500">{p.domain}</p>
            <p className="text-sm text-gray-400 mt-4">{t('projects.createdAt', { date: new Date(p.created_at).toLocaleDateString() })}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

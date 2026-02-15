import { useEffect, useState } from 'react';
import { getProjectPermissions } from './api';

export function useProjectRole(projectId?: string) {
  const [role, setRole] = useState<'admin' | 'viewer' | null>(null);

  useEffect(() => {
    if (!projectId) return;
    getProjectPermissions(projectId)
      .then((res) => setRole(res.role))
      .catch(() => setRole('viewer'));
  }, [projectId]);

  return {
    role,
    isAdmin: role === 'admin',
  };
}

import type { ScriptMeta } from '../services/api';

/** Route that opens a script, the same way Manage Projects (ProjectView) does. */
export function scriptRoute(projectId: string, script: Pick<ScriptMeta, 'id' | 'format'>): string {
  return script.format === 'treatment'
    ? `/project/${projectId}/treatment/${script.id}`
    : `/project/${projectId}/edit/${script.id}`;
}

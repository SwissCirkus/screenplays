import type { ScriptMeta } from '../services/api';

/** Route that opens a script, the same way Manage Projects (ProjectView) does. */
export function scriptRoute(projectId: string, script: Pick<ScriptMeta, 'id' | 'format'>): string {
  return script.format === 'treatment'
    ? `/project/${projectId}/treatment/${script.id}`
    : `/project/${projectId}/edit/${script.id}`;
}

/** Manage Projects' colour swatches (ProjectList ITEM_COLORS), '' = none. */
export const PROJECT_COLORS = [
  '#e06060', '#e89b4f', '#f4d35e', '#6abf69',
  '#4a9eff', '#6fa8dc', '#b58ee0', '#9370DB',
  '#e06c9f', '#d4a373', '#95a5a6', '',
];

/** An empty screenplay, as a new script starts: one blank scene heading. */
export const EMPTY_SCREENPLAY = { type: 'doc', content: [{ type: 'sceneHeading' }] };

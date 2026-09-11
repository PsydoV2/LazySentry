// Settings tab (docs/CONCEPT.md 8.2): secret-scanning toggles, full rescan,
// remove project.

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project } from '@lazysentry/shared';
import { api, ApiError } from '../lib/api';

export function SettingsTab({
  project,
  onRemoved,
}: {
  project: Project;
  onRemoved: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const updateSettings = useMutation({
    mutationFn: (input: Partial<Pick<Project, 'scanSecretsEnabled' | 'verifySecretsEnabled'>>) =>
      api.patch(`/api/projects/${project.id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const fullRescan = useMutation({
    mutationFn: () => api.post(`/api/projects/${project.id}/scans`, { full: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const removeProject = useMutation({
    mutationFn: () => api.delete(`/api/projects/${project.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onRemoved();
    },
  });

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Secret scanning</h2>

        <div className="settings-row">
          <span className="stack" style={{ gap: 2 }}>
            <strong>Scan for secrets</strong>
            <span className="subtle">
              Runs TruffleHog against the working tree and full git history.
            </span>
          </span>
          <Switch
            checked={project.scanSecretsEnabled}
            disabled={updateSettings.isPending}
            onChange={(checked) =>
              updateSettings.mutate({ scanSecretsEnabled: checked })
            }
          />
        </div>

        <div className="settings-row">
          <span className="stack" style={{ gap: 2 }}>
            <strong>Verify found credentials</strong>
            <span className="subtle">
              Tests each credential live against its provider's API. This sends
              outbound requests from this server to third parties.
            </span>
          </span>
          <Switch
            checked={project.verifySecretsEnabled}
            disabled={updateSettings.isPending || !project.scanSecretsEnabled}
            onChange={(checked) =>
              updateSettings.mutate({ verifySecretsEnabled: checked })
            }
          />
        </div>
      </div>

      <div className="card stack">
        <h2>Full rescan</h2>
        <p className="subtle">
          Normal scans only look at commits since the last scan. A full rescan
          walks the entire git history again — useful if a secret was missed
          or a detector was updated.
        </p>
        <div>
          <button
            type="button"
            className="btn-secondary"
            disabled={fullRescan.isPending || project.scanState !== 'idle'}
            onClick={() => fullRescan.mutate()}
          >
            {fullRescan.isPending ? 'Queuing…' : 'Run full rescan'}
          </button>
        </div>
        {fullRescan.isError && (
          <p className="notice notice-error">
            {fullRescan.error instanceof ApiError
              ? fullRescan.error.message
              : 'Could not queue a full rescan'}
          </p>
        )}
      </div>

      <div className="card stack">
        <h2>Remove project</h2>
        <p className="subtle">
          Stops scanning this repository and deletes its scan history,
          findings and settings from LazySentry. The repository itself is
          untouched.
        </p>
        {!confirmingRemove ? (
          <div>
            <button
              type="button"
              className="btn-danger"
              onClick={() => setConfirmingRemove(true)}
            >
              Remove project
            </button>
          </div>
        ) : (
          <div className="row">
            <span className="muted">Remove {project.fullName}?</span>
            <button
              type="button"
              className="btn-danger"
              disabled={removeProject.isPending}
              onClick={() => removeProject.mutate()}
            >
              {removeProject.isPending ? 'Removing…' : 'Confirm removal'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmingRemove(false)}
            >
              Cancel
            </button>
          </div>
        )}
        {removeProject.isError && (
          <p className="notice notice-error">
            {removeProject.error instanceof ApiError
              ? removeProject.error.message
              : 'Could not remove this project'}
          </p>
        )}
      </div>
    </div>
  );
}

function Switch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-track" />
    </label>
  );
}

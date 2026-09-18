// Dashboard grid (docs/CONCEPT.md 8.1) plus homepage organization: pinned
// projects, collapsible user-defined sections, and everything else, each
// group manually ordered by drag-and-drop. Within an untouched group
// (nothing pinned/moved/dragged yet) cards still fall back to the original
// urgency order, so an instance nobody has organized looks exactly like it
// did before this existed.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project, ProjectSection } from '@lazysentry/shared';
import { AddSectionRow } from '../components/AddSectionRow';
import { DashboardGroup } from '../components/DashboardGroup';
import { ImportDialog } from '../components/ImportDialog';
import { ProjectCard } from '../components/ProjectCard';
import { SectionHeader } from '../components/SectionHeader';
import { UpdateBanner } from '../components/UpdateBanner';
import { IconFolder, IconPin, IconPlus } from '../components/icons';
import { api } from '../lib/api';
import { sortByUrgency } from '../lib/card-state';
import { useDashboardDnd } from '../lib/dashboard-dnd';
import { groupProjects } from '../lib/dashboard-groups';
import { useScanEvents } from '../lib/events';
import { relativeTime } from '../lib/format';
import type { Route } from '../lib/router';

export function Dashboard({
  navigate,
}: {
  navigate: (route: Route) => void;
}) {
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);

  // Scan progress arrives over SSE instead of being polled (3.5).
  useScanEvents();

  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<Project[]>('/api/projects'),
    // Counters refresh over SSE rather than on every tab focus (8.4).
    staleTime: 30_000,
  });

  const sections = useQuery({
    queryKey: ['sections'],
    queryFn: () => api.get<ProjectSection[]>('/api/sections'),
    staleTime: 30_000,
  });

  const triggerScan = useMutation({
    mutationFn: (projectId: number) =>
      api.post(`/api/projects/${projectId}/scans`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const cancelScan = useMutation({
    mutationFn: (projectId: number) =>
      api.post(`/api/projects/${projectId}/scans/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const replaceProject = (updated: Project) =>
    queryClient.setQueryData<Project[]>(['projects'], (old) =>
      old?.map((p) => (p.id === updated.id ? updated : p)),
    );

  const togglePin = useMutation({
    mutationFn: (project: Project) =>
      api.patch<Project>(`/api/projects/${project.id}`, { pinned: !project.pinned }),
    onSuccess: replaceProject,
  });

  const moveToSection = useMutation({
    mutationFn: ({ project, sectionId }: { project: Project; sectionId: number | null }) =>
      api.patch<Project>(`/api/projects/${project.id}`, { sectionId }),
    onSuccess: replaceProject,
  });

  const reorderProjects = useMutation({
    mutationFn: (body: { ids: number[]; pinned: boolean; sectionId: number | null }) =>
      api.post<Project[]>('/api/projects/reorder', body),
    onSuccess: (data) => queryClient.setQueryData(['projects'], data),
  });

  const replaceSection = (updated: ProjectSection) =>
    queryClient.setQueryData<ProjectSection[]>(['sections'], (old) =>
      old?.map((s) => (s.id === updated.id ? updated : s)),
    );

  const createSection = useMutation({
    mutationFn: (name: string) => api.post<ProjectSection>('/api/sections', { name }),
    onSuccess: (created) =>
      queryClient.setQueryData<ProjectSection[]>(['sections'], (old) => [...(old ?? []), created]),
  });

  const toggleSectionCollapse = useMutation({
    mutationFn: (section: ProjectSection) =>
      api.patch<ProjectSection>(`/api/sections/${section.id}`, { collapsed: !section.collapsed }),
    onSuccess: replaceSection,
  });

  const renameSection = useMutation({
    mutationFn: ({ section, name }: { section: ProjectSection; name: string }) =>
      api.patch<ProjectSection>(`/api/sections/${section.id}`, { name }),
    onSuccess: replaceSection,
  });

  const deleteSection = useMutation({
    mutationFn: (section: ProjectSection) => api.delete(`/api/sections/${section.id}`),
    onSuccess: (_data, section) => {
      queryClient.setQueryData<ProjectSection[]>(['sections'], (old) =>
        old?.filter((s) => s.id !== section.id),
      );
      // Its former members fall back to sectionId: null server-side.
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const reorderSections = useMutation({
    mutationFn: (ids: number[]) => api.post<ProjectSection[]>('/api/sections/reorder', { ids }),
    onSuccess: (data) => queryClient.setQueryData(['sections'], data),
  });

  const allProjects = projects.data ?? [];
  const allSections = sections.data ?? [];

  // Secondary sort key for a group nobody has manually ordered yet — the
  // dashboard's original urgency order (card-state.ts), so pinning one
  // project doesn't scramble the rest of an otherwise untouched grid.
  const urgencyIndex = new Map(sortByUrgency(allProjects).map((p, i) => [p.id, i]));
  const compare = (a: Project, b: Project) =>
    a.sortOrder - b.sortOrder || (urgencyIndex.get(a.id) ?? 0) - (urgencyIndex.get(b.id) ?? 0);

  const groups = groupProjects(allProjects, allSections, compare);
  const dnd = useDashboardDnd(
    groups,
    (ids, pinned, sectionId) => reorderProjects.mutate({ ids, pinned, sectionId }),
    (ids) => reorderSections.mutate(ids),
  );

  const lastScan = allProjects
    .map((project) => project.lastScanAt)
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a)[0];

  const isLoading = projects.isLoading || sections.isLoading;
  const isEmpty = !isLoading && allProjects.length === 0;
  const organized = groups.pinned.length > 0 || groups.sections.length > 0;

  const renderCard = (project: Project) => (
    <ProjectCard
      project={project}
      sections={allSections}
      onOpen={() => navigate({ name: 'project', id: project.id })}
      onOpenSettings={() =>
        navigate({ name: 'project', id: project.id, tab: 'settings' })
      }
      onScanNow={() => triggerScan.mutate(project.id)}
      onCancelScan={() => cancelScan.mutate(project.id)}
      onTogglePin={() => togglePin.mutate(project)}
      onMoveToSection={(sectionId) => moveToSection.mutate({ project, sectionId })}
      scanDisabled={triggerScan.isPending}
    />
  );

  return (
    <main className="page stack">
      <UpdateBanner />

      <div className="dashboard-heading">
        <div>
          <h1>Projects</h1>
          <span className="subtle">
            {!isLoading &&
              `${allProjects.length} project${allProjects.length === 1 ? '' : 's'}` +
                (lastScan ? ` · last scan ${relativeTime(lastScan)}` : '')}
          </span>
        </div>
        <button
          type="button"
          className="btn-text-icon"
          onClick={() => setImporting(true)}
        >
          <IconPlus />
          Import project
        </button>
      </div>

      {isLoading && <p className="muted">Loading…</p>}

      {isEmpty && (
        <div className="tab-empty-state dashboard-empty-state">
          <span className="tab-empty-state-icon dashboard-empty-state-icon" aria-hidden="true">
            <IconFolder />
          </span>
          <p className="tab-empty-state-text dashboard-empty-state-text muted">
            No projects yet. Import your first repository to get started.
          </p>
        </div>
      )}

      {!isLoading && allProjects.length > 0 && (
        <div className="dashboard-groups">
          {groups.pinned.length > 0 && (
            <DashboardGroup
              groupKey={{ kind: 'pinned' }}
              projects={groups.pinned}
              dnd={dnd}
              renderCard={renderCard}
              header={
                <div className="dashboard-group-header">
                  <IconPin className="dashboard-group-icon" />
                  <span className="dashboard-group-title">Pinned</span>
                </div>
              }
            />
          )}

          {groups.sections.map(({ section, projects: sectionProjects }) => (
            <DashboardGroup
              key={section.id}
              groupKey={{ kind: 'section', sectionId: section.id }}
              projects={section.collapsed ? [] : sectionProjects}
              dnd={dnd}
              renderCard={renderCard}
              header={
                <SectionHeader
                  section={section}
                  count={sectionProjects.length}
                  dnd={dnd}
                  onToggleCollapse={() => toggleSectionCollapse.mutate(section)}
                  onRename={(name) => renameSection.mutate({ section, name })}
                  onDelete={() => deleteSection.mutate(section)}
                />
              }
              emptyPlaceholder={
                section.collapsed ? undefined : (
                  <span>Drag projects here, or use a card's organize menu.</span>
                )
              }
            />
          ))}

          <AddSectionRow onCreate={(name) => createSection.mutate(name)} />

          <DashboardGroup
            groupKey={{ kind: 'rest' }}
            projects={groups.rest}
            dnd={dnd}
            renderCard={renderCard}
            header={
              organized ? (
                <div className="dashboard-group-header">
                  <span className="dashboard-group-title">Other projects</span>
                </div>
              ) : undefined
            }
            emptyPlaceholder={
              organized ? <span>Drop here to remove from pinned or a section.</span> : undefined
            }
          />
        </div>
      )}

      {importing && (
        <ImportDialog onClose={() => setImporting(false)} navigate={navigate} />
      )}
    </main>
  );
}

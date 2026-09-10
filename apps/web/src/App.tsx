// Implementation step 1: unstyled listing of real scan results. The actual
// dashboard UI (docs/CONCEPT.md section 8) is built in step 6.

import { useQuery } from '@tanstack/react-query';

interface Project {
  id: number;
  fullName: string;
  lastScanStatus: string | null;
  lastScanAt: number | null;
}

interface Vulnerability {
  id: number;
  osvId: string;
  aliases: string[] | null;
  severity: string;
  cvssScore: number | null;
  summary: string | null;
  fixedVersion: string | null;
  status: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function ProjectVulnerabilities({ project }: { project: Project }) {
  const { data: vulns } = useQuery({
    queryKey: ['project', project.id, 'vulnerabilities'],
    queryFn: () => fetchJson<Vulnerability[]>(`/api/projects/${project.id}/vulnerabilities`),
  });

  return (
    <section>
      <h2>{project.fullName}</h2>
      <p>
        Last scan: {project.lastScanStatus ?? 'never'}
        {project.lastScanAt ? ` (${new Date(project.lastScanAt).toLocaleString()})` : ''}
      </p>
      <ul>
        {vulns?.map((v) => (
          <li key={v.id}>
            [{v.severity}
            {v.cvssScore !== null ? ` ${v.cvssScore}` : ''}] {v.osvId}
            {v.aliases?.length ? ` (${v.aliases.join(', ')})` : ''} — {v.summary ?? 'no summary'}
            {v.fixedVersion ? ` — fixed in ${v.fixedVersion}` : ''}
            {v.status === 'resolved' ? ' [resolved]' : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function App() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchJson<Project[]>('/api/projects'),
  });

  return (
    <main>
      <h1>LazySentry</h1>
      {isLoading && <p>Loading…</p>}
      {projects?.length === 0 && <p>No projects yet.</p>}
      {projects?.map((p) => <ProjectVulnerabilities key={p.id} project={p} />)}
    </main>
  );
}

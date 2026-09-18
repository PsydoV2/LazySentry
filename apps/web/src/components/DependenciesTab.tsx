// Dependencies tab (docs/CONCEPT.md 8.2): package inventory with CVE status
// and update classification, filterable and sortable, direct vs transitive
// visibly separated.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from './EmptyState';
import { api, type PackageEntry, type Project, type Vulnerability } from '../lib/api';
import { IconAlertTriangle, IconBug, IconChevronDown, IconFolder, IconPackage } from './icons';

type SortKey = 'name' | 'ecosystem' | 'versionInstalled' | 'updateType' | 'vulnerabilities';

const UPDATE_LABEL: Record<PackageEntry['updateType'], string> = {
  none: 'up to date',
  patch: 'patch',
  minor: 'minor',
  major: 'major',
  unknown: 'unknown',
};

const UPDATE_PILL: Record<PackageEntry['updateType'], string> = {
  none: 'pill-ok',
  patch: 'pill-ok',
  minor: 'pill-info',
  major: 'pill-high',
  unknown: 'pill-neutral',
};

const SEVERITY_PILL: Record<Vulnerability['severity'], string> = {
  critical: 'pill-critical',
  high: 'pill-high',
  medium: 'pill-medium',
  low: 'pill-info',
  unknown: 'pill-neutral',
};

export function DependenciesTab({ project }: { project: Project }) {
  const projectId = project.id;
  const [search, setSearch] = useState('');
  const [ecosystem, setEcosystem] = useState('');
  const [directOnly, setDirectOnly] = useState(false);
  const [vulnerableOnly, setVulnerableOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [expanded, setExpanded] = useState<number | null>(null);

  const packages = useQuery({
    queryKey: ['project', projectId, 'packages'],
    queryFn: () => api.get<PackageEntry[]>(`/api/projects/${projectId}/packages`),
  });

  const vulnerabilities = useQuery({
    queryKey: ['project', projectId, 'vulnerabilities'],
    queryFn: () =>
      api.get<Vulnerability[]>(`/api/projects/${projectId}/vulnerabilities`),
  });

  const vulnsByPackage = useMemo(() => {
    const map = new Map<string, Vulnerability[]>();
    for (const vuln of vulnerabilities.data ?? []) {
      if (vuln.status !== 'open') continue;
      const key = `${vuln.packageEcosystem ?? ''}::${vuln.packageName ?? ''}`;
      const list = map.get(key) ?? [];
      list.push(vuln);
      map.set(key, list);
    }
    return map;
  }, [vulnerabilities.data]);

  const ecosystems = useMemo(
    () => [...new Set((packages.data ?? []).map((pkg) => pkg.ecosystem))].sort(),
    [packages.data],
  );

  const rows = useMemo(() => {
    const filtered = (packages.data ?? []).filter((pkg) => {
      if (directOnly && !pkg.isDirect) return false;
      if (ecosystem && pkg.ecosystem !== ecosystem) return false;
      if (search && !pkg.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (vulnerableOnly && (vulnsByPackage.get(`${pkg.ecosystem}::${pkg.name}`)?.length ?? 0) === 0) {
        return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sortKey === 'updateType') {
        return updateRank(b.updateType) - updateRank(a.updateType);
      }
      if (sortKey === 'vulnerabilities') {
        return vulnRank(b, vulnsByPackage) - vulnRank(a, vulnsByPackage);
      }
      return String(a[sortKey]).localeCompare(String(b[sortKey]));
    });
  }, [packages.data, directOnly, ecosystem, search, vulnerableOnly, vulnsByPackage, sortKey]);

  if (packages.isLoading) return <p className="muted">Loading…</p>;

  if ((packages.data ?? []).length === 0) {
    // An empty inventory means different things depending on why there is
    // no finished scan to show — "no lockfiles" only when one actually ran
    // and looked (docs/CONCEPT.md 5.7: never claim a clean result for a scan
    // that never happened).
    if (project.lastScanId === null) {
      return (
        <EmptyState icon={IconFolder} message="This project has not been scanned yet." />
      );
    }
    if (project.lastScanStatus === 'failed') {
      return (
        <EmptyState
          icon={IconAlertTriangle}
          message="The last scan failed before dependencies could be scanned."
        />
      );
    }
    return (
      <EmptyState
        icon={IconPackage}
        message="No supported lockfiles found — dependency scanning skipped."
      />
    );
  }

  const filtersActive = search !== '' || ecosystem !== '' || directOnly || vulnerableOnly;
  const directCount = (packages.data ?? []).filter((pkg) => pkg.isDirect).length;
  const outdatedCount = (packages.data ?? []).filter(
    (pkg) => pkg.updateType !== 'none' && pkg.updateType !== 'unknown',
  ).length;
  const vulnerablePackages = (packages.data ?? []).filter(
    (pkg) => (vulnsByPackage.get(`${pkg.ecosystem}::${pkg.name}`)?.length ?? 0) > 0,
  );
  const criticalPackageCount = vulnerablePackages.filter(
    (pkg) =>
      highestSeverity(vulnsByPackage.get(`${pkg.ecosystem}::${pkg.name}`) ?? []) === 'critical',
  ).length;

  return (
    <div className="stack">
      {criticalPackageCount > 0 && (
        <p className="notice notice-error">
          {criticalPackageCount} package{criticalPackageCount === 1 ? '' : 's'} affected by a
          critical vulnerability.
        </p>
      )}

      <div className="filter-bar">
        <input
          type="search"
          placeholder="Filter by package name…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ maxWidth: 240 }}
        />
        {ecosystems.length > 1 && (
          <select value={ecosystem} onChange={(event) => setEcosystem(event.target.value)}>
            <option value="">All ecosystems</option>
            {ecosystems.map((eco) => (
              <option key={eco} value={eco}>
                {eco}
              </option>
            ))}
          </select>
        )}
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={directOnly}
            onChange={(event) => setDirectOnly(event.target.checked)}
          />
          Direct only
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={vulnerableOnly}
            onChange={(event) => setVulnerableOnly(event.target.checked)}
          />
          Vulnerable only
        </label>
        {filtersActive && (
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              setSearch('');
              setEcosystem('');
              setDirectOnly(false);
              setVulnerableOnly(false);
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="table-summary subtle">
        <span>
          {filtersActive
            ? `${rows.length} of ${packages.data?.length ?? 0} packages`
            : `${packages.data?.length ?? 0} packages`}
          {' · '}
          {directCount} direct
          {outdatedCount > 0 ? ` · ${outdatedCount} need updates` : ''}
          {vulnerablePackages.length > 0 ? ` · ${vulnerablePackages.length} vulnerable` : ''}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={IconPackage} message="No packages match these filters." />
      ) : (
        <div className="list">
          <div className="data-table-header">
            <SortableHeader label="Package" active={sortKey === 'name'} onClick={() => setSortKey('name')} />
            <SortableHeader
              label="Ecosystem"
              active={sortKey === 'ecosystem'}
              onClick={() => setSortKey('ecosystem')}
            />
            <span>Installed</span>
            <span>Latest</span>
            <SortableHeader
              label="Update"
              active={sortKey === 'updateType'}
              onClick={() => setSortKey('updateType')}
            />
            <SortableHeader
              label="Vulnerabilities"
              active={sortKey === 'vulnerabilities'}
              onClick={() => setSortKey('vulnerabilities')}
            />
          </div>

          {rows.map((pkg) => {
            const key = `${pkg.ecosystem}::${pkg.name}`;
            const vulns = vulnsByPackage.get(key) ?? [];
            const isExpanded = expanded === pkg.id;
            return (
              <div key={pkg.id}>
                <button
                  type="button"
                  className="data-table-row"
                  onClick={() => setExpanded(isExpanded ? null : pkg.id)}
                  disabled={vulns.length === 0}
                >
                  <span className="table-cell-stack">
                    <span className="table-cell-title">
                      <span title={pkg.name}>{pkg.name}</span>
                      {pkg.isDirect === false && (
                        <span className="pill pill-neutral">transitive</span>
                      )}
                    </span>
                    {pkg.sourceFile && (
                      <span className="table-cell-path subtle" title={pkg.sourceFile}>
                        {pkg.sourceFile}
                      </span>
                    )}
                  </span>
                  <span className="subtle">{pkg.ecosystem}</span>
                  <span className="mono">{pkg.versionInstalled}</span>
                  <span className="mono">{pkg.versionLatest ?? '—'}</span>
                  <span>
                    <span className={`pill ${UPDATE_PILL[pkg.updateType]}`}>
                      <IconPackage className="pill-icon" />
                      {UPDATE_LABEL[pkg.updateType]}
                    </span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    {vulns.length > 0 ? (
                      <>
                        <span className={`pill ${SEVERITY_PILL[highestSeverity(vulns)]}`}>
                          <IconBug className="pill-icon" />
                          {vulns.length} CVE{vulns.length === 1 ? '' : 's'}
                        </span>
                        <IconChevronDown
                          className={`row-chevron ${isExpanded ? 'is-expanded' : ''}`}
                        />
                      </>
                    ) : (
                      <span className="subtle">none</span>
                    )}
                  </span>
                </button>

                {isExpanded && vulns.length > 0 && (
                  <div className="vuln-details stack">
                    {vulns.map((vuln) => (
                      <div key={vuln.id} className="vuln-detail-row">
                        <span className={`pill ${SEVERITY_PILL[vuln.severity]}`}>
                          {vuln.severity}
                        </span>
                        <div className="stack" style={{ gap: 2, flex: 1 }}>
                          <span>
                            <a
                              href={`https://osv.dev/vulnerability/${encodeURIComponent(vuln.osvId)}`}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              {vuln.osvId}
                            </a>
                            {vuln.aliases.length > 0 && (
                              <span className="subtle"> · {vuln.aliases.join(', ')}</span>
                            )}
                          </span>
                          {vuln.summary && <span className="muted">{vuln.summary}</span>}
                          <span className="subtle">
                            {vuln.fixedVersion
                              ? `Fixed in ${vuln.fixedVersion}`
                              : 'No fixed version published yet'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SortableHeader({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`sort-header ${active ? 'is-active' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}

function updateRank(type: PackageEntry['updateType']): number {
  return { major: 3, minor: 2, patch: 1, unknown: 0, none: -1 }[type];
}

function highestSeverity(vulns: Vulnerability[]): Vulnerability['severity'] {
  const order: Vulnerability['severity'][] = ['critical', 'high', 'medium', 'low', 'unknown'];
  for (const severity of order) {
    if (vulns.some((vuln) => vuln.severity === severity)) return severity;
  }
  return 'unknown';
}

const SEVERITY_WEIGHT: Record<Vulnerability['severity'], number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
};

/** Worst severity first, then vulnerability count — so sorting the column
 * surfaces the packages that most need attention. */
function vulnRank(pkg: PackageEntry, vulnsByPackage: Map<string, Vulnerability[]>): number {
  const vulns = vulnsByPackage.get(`${pkg.ecosystem}::${pkg.name}`) ?? [];
  if (vulns.length === 0) return 0;
  return SEVERITY_WEIGHT[highestSeverity(vulns)] * 1000 + vulns.length;
}

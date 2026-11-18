import { useEffect, useState } from 'react';
import Header from '../components/Header';
import { usePageTitle } from '../hooks/usePageTitle';

// Shape mirrors db.js stats() return. Kept inline to this page — if the
// shape is needed elsewhere, move it to src/types/.
type Duration = { count: number; meanSecs: number; medianSecs: number; p95Secs: number; minSecs: number; maxSecs: number } | null;
type Stats = {
  generatedAt: number;
  totals: { total: number; resolved: number; canceled: number; resolutionRate: number; cancelRate: number };
  resolutionTimeOverall: Duration;
  resolutionTimeBuckets: { under1hr: number; under1day: number; under1week: number; under1month: number; over1month: number };
  byType: Array<{ typeName: string; count: number; resolvedCount: number; canceledCount: number; resolutionRate: number; resolutionTime: Duration }>;
  byResolution: Array<{ resolution: string; count: number; topTypes: Array<{ typeName: string; count: number }>; resolutionTime: Duration }>;
  byOfficer: Array<{ officer: string; count: number; resolvedCount: number; canceledCount: number; resolutionRate: number; resolutionTime: Duration }>;
  byMonth: Array<{ month: string; reported: number; resolved: number; canceled: number; resolutionTime: Duration }>;
};

const nfmt = new Intl.NumberFormat();
const pct = (x: number) => `${Math.round(x * 100)}%`;

function fmtDuration(secs: number | null | undefined) {
  if (secs == null) return '—';
  if (secs < 60) return `${Math.round(secs)}s`;
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

export default function StatsPage() {
  usePageTitle('WOTS++ · Stats');
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/stats')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((s: Stats) => { if (alive) setData(s); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, []);

  return (
    <>
      <Header hide="stats" />
      <main className="max-w-[1200px] mx-auto px-6 py-[clamp(24px,5vw,40px)] max-[640px]:px-4 max-[640px]:py-5 text-[15px] leading-normal">
        {error && <div className="py-16 text-center text-[#b91c1c]">Could not load stats: {error}</div>}
        {!error && !data && <div className="py-16 text-center text-muted">Loading stats…</div>}
        {data && <StatsBody s={data} />}
      </main>
    </>
  );
}

function StatsBody({ s }: { s: Stats }) {
  const t = s.totals;
  return (
    <>
      <h1 className="text-[clamp(22px,4vw,28px)] font-semibold tracking-tight mb-1.5">
        Insights from {nfmt.format(t.total)} closed reports
      </h1>
      <div className="text-muted text-sm mb-6">
        Site-wide aggregates across every terminal (resolved or canceled) incident cached on the
        server. Fully anonymized — no addresses, ids, or reporter info.
      </div>

      <div className="grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
        <StatCard n={nfmt.format(t.total)} label="Total (cached)" />
        <StatCard n={nfmt.format(t.resolved)} label={`Resolved · ${pct(t.resolutionRate)}`} />
        <StatCard n={nfmt.format(t.canceled)} label={`Canceled · ${pct(t.cancelRate)}`} />
        <StatCard n={fmtDuration(s.resolutionTimeOverall?.medianSecs)} label="Median time to resolve" />
        <StatCard n={fmtDuration(s.resolutionTimeOverall?.p95Secs)} label="p95 time to resolve" />
      </div>

      <BucketsTable b={s.resolutionTimeBuckets} />
      <ByTypeTable rows={s.byType} />
      <ResolutionsTable rows={s.byResolution} />
      {s.byOfficer.length > 0 && <OfficerTable rows={s.byOfficer} />}
      {s.byMonth.length > 0 && <MonthlyResolutionChart rows={s.byMonth} />}
      {s.byMonth.length > 0 && <MonthTable rows={s.byMonth} />}

      <div className="text-subtle text-xs mt-6 text-right">
        Generated {new Date(s.generatedAt).toLocaleString()} ·{' '}
        <a href="/api/stats" className="text-inherit">/api/stats</a>
      </div>
    </>
  );
}

function StatCard({ n, label }: { n: string; label: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-3.5">
      <div className="text-[22px] font-semibold tracking-tight tabular-nums">{n}</div>
      <div className="text-[11px] text-muted uppercase tracking-wider font-medium mt-1">{label}</div>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] uppercase tracking-wider text-muted font-semibold mt-8 mb-3">
      {children}
    </h2>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden overflow-x-auto">
      <table className="w-full border-collapse tabular-nums">{children}</table>
    </div>
  );
}

function Th({ children, right, sticky, style }: { children?: React.ReactNode; right?: boolean; sticky?: boolean; style?: React.CSSProperties }) {
  return (
    <th
      style={style}
      className={`text-[11px] uppercase tracking-wider text-muted font-semibold bg-surface-2 py-2.5 px-3.5 border-b border-border align-top ${right ? 'text-right whitespace-nowrap' : 'text-left'} ${sticky ? 'sticky top-0' : ''}`}
    >
      {children}
    </th>
  );
}

function Td({ children, right, muted, className = '' }: { children?: React.ReactNode; right?: boolean; muted?: boolean; className?: string }) {
  return (
    <td className={`py-2.5 px-3.5 border-b border-border align-top last:border-b-0 ${right ? 'text-right whitespace-nowrap' : ''} ${muted ? 'text-muted text-xs' : ''} ${className}`}>
      {children}
    </td>
  );
}

function Bar({ v, max }: { v: number; max: number }) {
  const p = max ? Math.round((v / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full bg-accent transition-[width] duration-200 ease-out" style={{ width: `${p}%` }} />
      </div>
      <span>{nfmt.format(v)}</span>
    </div>
  );
}

function BucketsTable({ b }: { b: Stats['resolutionTimeBuckets'] }) {
  const rows: Array<[string, number]> = [
    ['Under 1 hour', b.under1hr],
    ['Under 1 day', b.under1day],
    ['Under 1 week', b.under1week],
    ['Under 1 month', b.under1month],
    ['Over 1 month', b.over1month],
  ];
  const total = rows.reduce((a, [, n]) => a + n, 0);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <>
      <H2>Time to resolve — distribution</H2>
      <TableWrap>
        <thead>
          <tr>
            <Th>Bucket</Th>
            <Th right>Count</Th>
            <Th right>Share</Th>
            <Th style={{ width: '50%' }}>Distribution</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, n]) => (
            <tr key={label}>
              <Td>{label}</Td>
              <Td right>{nfmt.format(n)}</Td>
              <Td right>{total ? pct(n / total) : '—'}</Td>
              <Td><Bar v={n} max={max} /></Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}

function ByTypeTable({ rows }: { rows: Stats['byType'] }) {
  return (
    <>
      <H2>By type</H2>
      <TableWrap>
        <thead>
          <tr>
            <Th>Type</Th>
            <Th right>Reports</Th>
            <Th right>Resolved</Th>
            <Th right>Rate</Th>
            <Th right>Median time</Th>
            <Th right>p95</Th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 25).map((row) => (
            <tr key={row.typeName}>
              <Td>{row.typeName}</Td>
              <Td right>{nfmt.format(row.count)}</Td>
              <Td right>{nfmt.format(row.resolvedCount)}</Td>
              <Td right>{pct(row.resolutionRate)}</Td>
              <Td right>{fmtDuration(row.resolutionTime?.medianSecs)}</Td>
              <Td right>{fmtDuration(row.resolutionTime?.p95Secs)}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}

function ResolutionsTable({ rows }: { rows: Stats['byResolution'] }) {
  return (
    <>
      <H2>Common resolutions</H2>
      <TableWrap>
        <thead>
          <tr>
            <Th style={{ maxWidth: 620 }}>Resolution</Th>
            <Th right>Count</Th>
            <Th>Top types</Th>
            <Th right>Median time</Th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row, i) => {
            const excerpt = row.resolution.length > 240 ? row.resolution.slice(0, 240) + '…' : row.resolution;
            return (
              <tr key={i}>
                <Td className="max-w-[620px]">{excerpt}</Td>
                <Td right>{nfmt.format(row.count)}</Td>
                <Td muted>
                  {row.topTypes.map((tt, j) => (
                    <span key={j}>
                      {tt.typeName} <span className="text-muted">({tt.count})</span>
                      {j < row.topTypes.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </Td>
                <Td right>{fmtDuration(row.resolutionTime?.medianSecs)}</Td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
    </>
  );
}

function OfficerTable({ rows }: { rows: Stats['byOfficer'] }) {
  return (
    <>
      <H2>By officer</H2>
      <TableWrap>
        <thead>
          <tr>
            <Th>Officer</Th>
            <Th right>Reports</Th>
            <Th right>Resolved</Th>
            <Th right>Rate</Th>
            <Th right>Median time</Th>
            <Th right>p95</Th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 30).map((row) => (
            <tr key={row.officer}>
              <Td>{row.officer}</Td>
              <Td right>{nfmt.format(row.count)}</Td>
              <Td right>{nfmt.format(row.resolvedCount)}</Td>
              <Td right>{pct(row.resolutionRate)}</Td>
              <Td right>{fmtDuration(row.resolutionTime?.medianSecs)}</Td>
              <Td right>{fmtDuration(row.resolutionTime?.p95Secs)}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}

function MonthlyResolutionChart({ rows }: { rows: Stats['byMonth'] }) {
  const raw = rows
    .map((m) => ({
      month: m.month,
      median: m.resolutionTime?.medianSecs ?? 0,
      mean: m.resolutionTime?.meanSecs ?? 0,
      count: m.resolutionTime?.count ?? 0,
    }))
    .filter((p) => p.count > 0);

  // The oldest month absorbs legacy reports that sat open for years before being
  // resolved, so its median can dwarf every other bar. Drop it if it is >5x the
  // median of the remaining months.
  let dropped: typeof raw[number] | null = null;
  let kept = raw;
  if (raw.length >= 3) {
    const [oldest, ...rest] = raw;
    const sortedMedians = rest.map((p) => p.median).sort((a, b) => a - b);
    const typical = sortedMedians[Math.floor(sortedMedians.length / 2)] || 0;
    if (typical > 0 && oldest.median > typical * 5) {
      dropped = oldest;
      kept = rest;
    }
  }

  const points = kept.slice().reverse();
  if (points.length === 0) return null;
  const max = Math.max(1, ...points.map((p) => p.median));
  const fmtLabel = (key: string) => {
    const [y, mm] = key.split('-');
    return `${parseInt(mm, 10)}/${y}`;
  };
  return (
    <>
      <H2>Median time to resolve — by month</H2>
      <div className="bg-surface border border-border rounded-xl p-4 overflow-x-auto">
        <div className="flex items-end gap-2 h-[220px] min-w-max">
          {points.map((p) => {
            const h = Math.max(1, Math.round((p.median / max) * 100));
            return (
              <div key={p.month} className="w-14 flex flex-col items-center justify-end h-full">
                <div className="text-[10px] text-muted tabular-nums mb-1 whitespace-nowrap">
                  {fmtDuration(p.median)}
                </div>
                <div
                  className="w-10 bg-accent rounded-t transition-[height] duration-200 ease-out"
                  style={{ height: `${h}%` }}
                  title={`${fmtLabel(p.month)} · median ${fmtDuration(p.median)} · mean ${fmtDuration(p.mean)} · n=${nfmt.format(p.count)}`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 min-w-max mt-2 pt-2 border-t border-border">
          {points.map((p) => (
            <div key={p.month} className="w-14 text-[10px] text-muted text-center tabular-nums whitespace-nowrap">
              {fmtLabel(p.month)}
            </div>
          ))}
        </div>
      </div>
      {dropped && (
        <div className="text-subtle text-xs mt-2">
          {fmtLabel(dropped.month)} omitted as outlier (median {fmtDuration(dropped.median)} across{' '}
          {nfmt.format(dropped.count)} reports — likely legacy reports resolved after long delays).
        </div>
      )}
    </>
  );
}

function MonthTable({ rows }: { rows: Stats['byMonth'] }) {
  const max = Math.max(1, ...rows.map((m) => Math.max(m.reported, m.resolved, m.canceled)));
  return (
    <>
      <H2>Monthly activity</H2>
      <TableWrap>
        <thead>
          <tr>
            <Th>Month</Th>
            <Th right>Reported</Th>
            <Th right>Resolved</Th>
            <Th right>Canceled</Th>
            <Th style={{ width: '35%' }}>Reported</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.month}>
              <Td>{m.month}</Td>
              <Td right>{nfmt.format(m.reported)}</Td>
              <Td right>{nfmt.format(m.resolved)}</Td>
              <Td right>{nfmt.format(m.canceled)}</Td>
              <Td><Bar v={m.reported} max={max} /></Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}

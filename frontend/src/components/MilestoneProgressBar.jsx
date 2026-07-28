// Milestone progress for embeds (#596). Inline styles only — this renders
// inside the standalone embed bundle, which does not load the app stylesheet.

export const MILESTONE_STATUS_META = {
  released: { label: 'Released', color: '#10b981' },
  approved: { label: 'Approved', color: '#3b82f6' },
  submitted: { label: 'Submitted', color: '#f59e0b' },
  pending: { label: 'Pending', color: '#9ca3af' },
};

export const WIDGET_SIZES = ['small', 'medium', 'large'];

export function normalizeWidgetSize(size) {
  return WIDGET_SIZES.includes(size) ? size : 'medium';
}

function statusMeta(status) {
  return MILESTONE_STATUS_META[status] || MILESTONE_STATUS_META.pending;
}

export default function MilestoneProgressBar({ milestones, summary, size = 'medium' }) {
  const resolvedSize = normalizeWidgetSize(size);
  if (resolvedSize === 'small' || !milestones?.length) return null;

  const totalPercentage = milestones.reduce(
    (total, milestone) => total + (Number(milestone.release_percentage) || 0),
    0
  );

  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '0.5rem',
          marginBottom: '0.35rem',
          fontSize: '0.75rem',
          color: 'var(--color-text-hint, #6b7280)',
        }}
      >
        <span style={{ fontWeight: 700 }}>Milestones</span>
        <span>
          {summary?.released ?? 0} of {summary?.total ?? milestones.length} released
        </span>
      </div>

      <div
        style={{ display: 'flex', gap: '2px', height: '8px' }}
        role="img"
        aria-label={`${summary?.released ?? 0} of ${summary?.total ?? milestones.length} milestones released`}
      >
        {milestones.map((milestone) => {
          const share = totalPercentage
            ? (Number(milestone.release_percentage) || 0) / totalPercentage
            : 1 / milestones.length;
          return (
            <div
              key={milestone.id}
              title={`${milestone.title} — ${statusMeta(milestone.status).label}`}
              style={{
                flexGrow: Math.max(share, 0.05),
                flexBasis: 0,
                borderRadius: '99px',
                background: statusMeta(milestone.status).color,
                opacity: milestone.status === 'pending' ? 0.45 : 1,
              }}
            />
          );
        })}
      </div>

      {resolvedSize === 'large' && (
        <ul
          style={{
            listStyle: 'none',
            margin: '0.55rem 0 0',
            padding: 0,
            display: 'grid',
            gap: '0.3rem',
          }}
        >
          {milestones.map((milestone) => (
            <li
              key={milestone.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.5rem',
                fontSize: '0.78rem',
              }}
            >
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {milestone.title}
                <span style={{ color: 'var(--color-text-hint, #6b7280)' }}>
                  {' '}
                  · {Number(milestone.release_percentage)}%
                </span>
              </span>
              <span
                style={{
                  flexShrink: 0,
                  fontWeight: 600,
                  color: statusMeta(milestone.status).color,
                }}
              >
                {statusMeta(milestone.status).label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import React from 'react';

const BADGE_CONFIG = {
  dev: { label: 'Developer', className: 'badge-role dev', icon: '🛠️' },
  mod: { label: 'Moderator', className: 'badge-role mod', icon: '🛡️' },
};

export default function BadgeRole({ role }) {
  const config = BADGE_CONFIG[role];
  if (!config) return null;

  return (
    <span className={config.className} title={config.label}>
      <span className="badge-icon">{config.icon}</span>
      <span className="badge-label">{config.label}</span>
    </span>
  );
}

import React, { useEffect, useState } from 'react';
import { User } from '../../types/index.ts';

type Stats = { totalUsers: number; totalRuns: number; usersByTier: Record<string, number>; runsByTier: Record<string, number> };
type AdminUser = User & { lifetimeRuns?: number; createdAt?: string };

export const AdminView: React.FC<{ token: string | null; api: string; onNotice: (message: string) => void }> = ({ token, api, onNotice }) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [preview, setPreview] = useState<'demo' | 'free' | 'paid'>('free');
  const load = async () => {
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const [statResponse, userResponse] = await Promise.all([fetch(`${api}/admin/stats`, { headers, credentials: 'include' }), fetch(`${api}/admin/users?limit=100`, { headers, credentials: 'include' })]);
    if (!statResponse.ok || !userResponse.ok) throw new Error('Could not load administrator data.');
    setStats(await statResponse.json()); setUsers((await userResponse.json()).items || []);
  };
  useEffect(() => { load().catch(error => onNotice(error.message)); }, [token]);
  async function setTier(userId: string, tier: string) {
    const response = await fetch(`${api}/admin/users/${userId}/tier`, { method: 'PATCH', credentials: 'include', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ tier }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Tier update failed.');
    onNotice(`Updated ${result.user.email} to ${tier}.`); await load();
  }
  const previewText = preview === 'demo' ? '10 runs, 24 hour session, concurrency capped at 2.' : preview === 'free' ? '15 lifetime runs, saved history, no run deletion.' : 'Pro: 10,000 runs, run deletion, campaigns, and history comparisons.';
  return <div className="dev-card page-animate" style={{ padding: 24 }}>
    <div className="panel-header-row"><div><h2>Administrator Console</h2><p>Platform-wide aggregates and account plan controls.</p></div></div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '18px 0' }}>
      {[['Users', stats?.totalUsers], ['Saved runs', stats?.totalRuns], ['Free accounts', stats?.usersByTier?.free || 0], ['Pro accounts', stats?.usersByTier?.paid || 0]].map(([label, value]) => <div className="dev-card" key={String(label)} style={{ padding: 16, minWidth: 150 }}><small>{label}</small><h2>{value ?? '—'}</h2></div>)}
    </div>
    <div style={{ padding: 16, marginBottom: 18, border: '1px solid var(--border)', borderRadius: 10 }}>
      <label htmlFor="tier-preview">Preview tier experience</label>{' '}<select id="tier-preview" value={preview} onChange={event => setPreview(event.target.value as typeof preview)}><option value="demo">Demo</option><option value="free">Free</option><option value="paid">Pro</option></select>
      <p>{previewText}</p><small>This preview changes only this panel. Your administrator access remains active.</small>
    </div>
    <h3>Users</h3><div style={{ overflowX: 'auto' }}><table className="data-table"><thead><tr><th>Name</th><th>Email</th><th>Tier</th><th>Lifetime runs</th><th>Change tier</th></tr></thead><tbody>{users.map(account => <tr key={account.id}><td>{account.name}</td><td>{account.email}</td><td>{account.tier || 'free'}</td><td>{account.lifetimeRuns || 0}</td><td><select aria-label={`Tier for ${account.email}`} value={account.tier || 'free'} onChange={event => setTier(account.id, event.target.value).catch(error => onNotice(error.message))}><option value="free">Free</option><option value="paid">Pro</option><option value="admin">Admin</option></select></td></tr>)}</tbody></table></div>
  </div>;
};

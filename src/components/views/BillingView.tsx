import React, { useEffect, useState } from 'react';
import { Check, CreditCard, LockKeyhole, ShieldCheck } from 'lucide-react';
import { User } from '../../types/index.ts';
import { Button } from '../ui/Button.tsx';

interface BillingViewProps {
  user: User | null;
  token: string | null;
  api: string;
  onUserUpdated: (user: User) => void;
  onSignIn: () => void;
}

type CheckoutOptions = {
  key: string; amount: number; currency: string; name: string; description: string; order_id: string;
  prefill: { name: string; email: string };
  theme: { color: string };
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  modal: { ondismiss: () => void };
};
type CheckoutInstance = { open: () => void; on: (event: 'payment.failed', handler: (event: { error?: { description?: string } }) => void) => void };
declare global { interface Window { Razorpay?: new (options: CheckoutOptions) => CheckoutInstance } }

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Razorpay Checkout.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout.'));
    document.body.appendChild(script);
  });
}

export const BillingView: React.FC<BillingViewProps> = ({ user, token, api, onUserUpdated, onSignIn }) => {
  const [config, setConfig] = useState<{ enabled: boolean; amount: number | null; currency: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`${api}/billing/config`).then(response => response.json()).then(result => {
      if (!cancelled) setConfig({ enabled: Boolean(result.enabled), amount: Number.isSafeInteger(result.amount) ? result.amount : null, currency: result.currency || 'INR' });
    }).catch(() => { if (!cancelled) setConfig({ enabled: false, amount: null, currency: 'INR' }); });
    return () => { cancelled = true; };
  }, [api]);

  const currentTier = user?.tier || 'free';
  const isPro = currentTier === 'paid' || currentTier === 'admin';
  const amountLabel = config?.amount == null ? null : (config.amount / 100).toLocaleString(undefined, { style: 'currency', currency: config.currency });

  async function startCheckout() {
    if (!token) { onSignIn(); return; }
    setBusy(true);
    setMessage('');
    try {
      await loadRazorpayCheckout();
      const orderResponse = await fetch(`${api}/create-order`, { method: 'POST', credentials: 'include', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' });
      const order = await orderResponse.json();
      if (!orderResponse.ok) throw new Error(order.error || 'Could not create payment order.');
      if (!window.Razorpay) throw new Error('Razorpay Checkout did not initialize.');
      const checkout = new window.Razorpay({
        key: order.key_id, amount: order.amount, currency: order.currency, name: 'DevFlow', description: 'Pro access', order_id: order.order_id,
        prefill: { name: user?.name || '', email: user?.email || '' }, theme: { color: '#b7f34a' },
        handler: async payment => {
          try {
            const response = await fetch(`${api}/verify-payment`, { method: 'POST', credentials: 'include', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payment) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Payment verification failed.');
            onUserUpdated(result.user);
            setMessage('Payment verified. Pro access is now active.');
          } catch (error) { setMessage(error instanceof Error ? error.message : 'Payment verification failed.'); }
          finally { setBusy(false); }
        },
        modal: { ondismiss: () => { setBusy(false); setMessage('Checkout was cancelled.'); } },
      });
      checkout.on('payment.failed', event => { setBusy(false); setMessage(event.error?.description || 'Payment failed. Please try again.'); });
      checkout.open();
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : 'Could not start checkout.');
    }
  }

  return (
    <div className="page-animate" style={{ display: 'grid', gap: 20 }}>
      <section className="dev-card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Account billing</div>
            <h2 style={{ margin: '8px 0 4px' }}>Plans &amp; payment</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>Choose a DevFlow access plan and manage your upgrade in one place.</p>
          </div>
          <span className="env-pill">{user ? `Current plan: ${currentTier === 'paid' ? 'Pro' : currentTier[0].toUpperCase() + currentTier.slice(1)}` : 'Sign in to view account plan'}</span>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 18 }}>
        <article className="dev-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><span className="env-pill">{user && currentTier === 'free' ? 'CURRENT PLAN' : 'AVAILABLE PLAN'}</span><h3 style={{ fontSize: 24, margin: '12px 0 4px' }}>Free</h3><p style={{ margin: 0, color: 'var(--text-muted)' }}>For trying DevFlow and smaller workloads.</p></div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10, color: 'var(--text-secondary)' }}>
            {['15 accepted runs over the account lifetime', 'Saved run history and comparisons', 'Standard targets and reports'].map(item => <li key={item} style={{ display: 'flex', gap: 9, alignItems: 'center' }}><Check size={15} color="var(--color-lime)" />{item}</li>)}
          </ul>
          {user && currentTier === 'free' && <span style={{ marginTop: 'auto', color: 'var(--text-muted)', fontSize: 13 }}>Your current plan</span>}
        </article>

        <article className="dev-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14, borderColor: 'var(--color-blue)' }}>
          <div><span className="env-pill">{isPro ? 'ACTIVE' : 'ONE-TIME UPGRADE'}</span><h3 style={{ fontSize: 24, margin: '12px 0 4px' }}>DevFlow Pro</h3>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)' }}>{amountLabel || 'Price not configured'}{amountLabel && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}> one time</span>}</div>
            <p style={{ margin: '5px 0 0', color: 'var(--text-muted)' }}>A one-time payment. No recurring subscription.</p>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10, color: 'var(--text-secondary)' }}>
            {['10,000 runs by default, configurable by the operator', 'Benchmark campaigns and own-run deletion', 'All Free plan features'].map(item => <li key={item} style={{ display: 'flex', gap: 9, alignItems: 'center' }}><Check size={15} color="var(--color-lime)" />{item}</li>)}
          </ul>
          {user && !isPro ? <Button variant="primary" disabled={!config?.enabled || busy} loading={busy} onClick={() => void startCheckout()} icon={<CreditCard size={15} />}>
            {busy ? 'Opening secure checkout…' : config?.enabled ? 'Continue to secure checkout' : 'Checkout unavailable'}
          </Button> : isPro ? <span style={{ marginTop: 'auto', color: 'var(--text-muted)', fontSize: 13 }}>Pro access is active on your account.</span> : <Button variant="primary" onClick={onSignIn}>Sign in to continue</Button>}
          {!config?.enabled && !isPro && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>The operator must configure Razorpay test credentials and the Pro price on the server before checkout can start.</p>}
        </article>
      </section>

      {!isPro && <section className="dev-card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div><h3 style={{ margin: '0 0 5px' }}>Payment methods</h3><p style={{ margin: 0, color: 'var(--text-muted)' }}>Select one method. Checkout is verified automatically; QR payment requires manual review.</p></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-muted)', fontSize: 12 }}><LockKeyhole size={14} />Secure payment processing</div>
        </div>
        {message && <p role="status" aria-live="polite" style={{ margin: '14px 0 0' }}>{message}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 18, marginTop: 18 }}>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 18 }}>
            <h4 style={{ margin: '0 0 8px', display: 'flex', gap: 8, alignItems: 'center' }}><CreditCard size={17} />Razorpay Checkout</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Use available card, UPI, or net banking methods in the secure Razorpay payment window. A verified captured payment activates Pro.</p>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-muted)', fontSize: 12 }}><ShieldCheck size={14} />Automatic payment verification</span>
          </div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 18, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <img src="/assets/razorpay-upi-code.png" alt="Razorpay UPI payment QR for DevFlow Pro" loading="lazy" decoding="async" style={{ width: 180, maxWidth: '100%', borderRadius: 8, background: '#fff' }} />
            <div style={{ flex: '1 1 160px' }}><h4 style={{ margin: '0 0 8px' }}>UPI QR</h4><p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Scan with a UPI app and confirm the amount before paying. Then share the payment reference with an administrator for manual review.</p><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Pro activation is not automatic for QR payments.</span></div>
          </div>
        </div>
      </section>}

      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>Pro access is granted only after server-side verification. Checkout and QR payments are one-time; subscriptions and recurring billing are not enabled.</p>
    </div>
  );
};

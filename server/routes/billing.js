import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';
import { authenticateToken } from '../security/auth.js';
import { getStorage } from '../storage/index.js';
import { recordAuditEvent } from '../audit.js';

export const billingRouter = express.Router();

function getBillingSettings() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const priceInr = process.env.UPGRADE_PLAN_PRICE_INR;
  const amount = priceInr != null && priceInr.trim() !== ''
    ? Number(priceInr) * 100
    : Number(process.env.RAZORPAY_PRO_AMOUNT_PAISE);
  const validAmount = Number.isSafeInteger(amount) && amount >= 100;
  const configured = Boolean(keyId && keySecret && validAmount);
  return { keyId, keySecret, amount, validAmount, configured };
}

function getRazorpayClient({ keyId, keySecret }) {
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// Public checkout metadata. The amount and key id are safe to expose; the secret is not.
billingRouter.get('/billing/config', (_req, res) => {
  const settings = getBillingSettings();
  res.json({ enabled: settings.configured, keyId: settings.configured ? settings.keyId : null,
    amount: settings.validAmount ? settings.amount : null, currency: 'INR', plan: 'Pro' });
});

billingRouter.post('/create-order', authenticateToken, async (req, res) => {
  const settings = getBillingSettings();
  if (!settings.configured) return res.status(503).json({ error: 'Pro checkout is not configured. Set valid Razorpay keys and UPGRADE_PLAN_PRICE_INR (minimum ₹1).' });
  if (req.user.tier === 'demo') return res.status(403).json({ error: 'Sign in to purchase a plan.' });

  try {
    const receipt = `pro_${req.user.id.replaceAll('-', '').slice(0, 12)}_${Date.now()}`.slice(0, 40);
    const order = await getRazorpayClient(settings).orders.create({
      amount: settings.amount,
      currency: 'INR',
      receipt,
      notes: { userId: req.user.id, plan: 'Pro' },
    });
    res.status(201).json({ order_id: order.id, amount: order.amount, currency: order.currency, key_id: settings.keyId });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'razorpay_order_failed', message: String(error?.message || 'Razorpay order creation failed').slice(0, 200) }));
    res.status(500).json({ error: 'Could not create a Razorpay order. Check the payment configuration and try again.' });
  }
});

billingRouter.post('/verify-payment', authenticateToken, async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
  if ([orderId, paymentId, signature].some(value => typeof value !== 'string' || !value.trim())) {
    return res.status(400).json({ error: 'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.' });
  }

  const settings = getBillingSettings();
  if (!settings.configured) return res.status(503).json({ error: 'Payment verification is not configured.' });
  if (req.user.tier === 'demo') return res.status(403).json({ error: 'Sign in to activate a paid plan.' });

  const expected = createHmac('sha256', settings.keySecret).update(`${orderId}|${paymentId}`).digest();
  let supplied;
  try { supplied = Buffer.from(signature, 'hex'); } catch { supplied = Buffer.alloc(0); }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return res.status(400).json({ error: 'Payment signature is invalid. The account was not upgraded.' });
  }

  try {
    const client = getRazorpayClient(settings);
    const [order, initialPayment] = await Promise.all([client.orders.fetch(orderId), client.payments.fetch(paymentId)]);
    if (order.id !== orderId || order.amount !== settings.amount || order.currency !== 'INR'
      || order.notes?.userId !== req.user.id || order.notes?.plan !== 'Pro'
      || initialPayment.order_id !== orderId || initialPayment.amount !== settings.amount
      || initialPayment.currency !== 'INR') {
      return res.status(400).json({ error: 'Payment does not match this account or the configured Pro order. The account was not upgraded.' });
    }

    const payment = initialPayment.status === 'authorized'
      ? await client.payments.capture(paymentId, settings.amount, 'INR')
      : initialPayment;
    if (payment.status !== 'captured') return res.status(400).json({ error: 'Payment is not captured yet. The account was not upgraded.' });

    const user = await getStorage().updateUser(req.user.id, { tier: 'paid', plan: 'paid' });
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    await recordAuditEvent(getStorage(), { userId: req.user.id, action: 'PRO_PAYMENT_VERIFIED', resourceType: 'payment', resourceId: paymentId,
      details: { orderId, amount: settings.amount, currency: 'INR' }, ipAddress: req.ip });
    res.json({ success: true, user, paymentId, plan: 'Pro' });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'razorpay_verification_failed', message: String(error?.message || 'Payment verification failed').slice(0, 200) }));
    res.status(500).json({ error: 'Could not verify the payment with Razorpay. The account was not upgraded; retry verification.' });
  }
});

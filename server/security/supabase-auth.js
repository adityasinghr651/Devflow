import { config } from '../config.js';

export const isSupabaseAuthEnabled = () => Boolean(config.supabaseUrl && config.supabasePublishableKey);

async function authRequest(path, body, rejectedStatus) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: config.supabasePublishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(response.status >= 500
      ? 'Supabase authentication is temporarily unavailable.'
      : data.msg || data.message || data.error_description || data.error || 'Supabase rejected the authentication request.');
    error.statusCode = response.status >= 500 ? 503 : response.status === 429 ? 429 : rejectedStatus;
    throw error;
  }
  return data;
}

export async function supabaseSignUp({ email, password, name }) {
  return authRequest('signup', {
    email,
    password,
    data: { full_name: name },
  }, 400);
}

export async function supabaseSignIn({ email, password }) {
  return authRequest('token?grant_type=password', { email, password }, 401);
}

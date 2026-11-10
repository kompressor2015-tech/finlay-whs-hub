/**
 * Sign-in for the WHS app, using the same Supabase accounts as the fleet app.
 * Access comes from the shared `profiles` row: fleet admins, or anyone with a `whs_role`.
 */

import { supabase } from './supabase.ts';
import { whsAccessFor, type WhsAccess } from '../utils/access.ts';

export interface WhsUser {
  id: string;
  email: string;
  name: string;
  access: WhsAccess;
  /** Their usual yard or site, from the shared profile */
  location: string;
  initials: string;
}

function initialsFor(name: string): string {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

async function loadUser(userId: string): Promise<{ user?: WhsUser; error?: string }> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) return { error: 'Could not load your account. Please try again.' };
  if (!data) return { error: 'Your account is not set up yet. Ask an administrator.' };
  if (data.status === 'SUSPENDED') return { error: 'Your account has been suspended. Contact an administrator.' };

  const access = whsAccessFor(data);
  if (!access) {
    return { error: 'Your account does not have access to the WHS app yet. Ask an administrator to give you a WHS role.' };
  }
  const name: string = data.name || String(data.email || '').split('@')[0] || 'User';
  return {
    user: {
      id: data.id,
      email: data.email,
      name,
      access,
      location: data.location || '',
      initials: data.avatar_initials || initialsFor(name),
    },
  };
}

export async function getCurrentUser(): Promise<WhsUser | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const authUser = data.session?.user;
    if (!authUser) return null;
    const { user } = await loadUser(authUser.id);
    if (!user) {
      await supabase.auth.signOut();
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

export async function signIn(email: string, password: string): Promise<{ user?: WhsUser; error?: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error || !data.user) return { error: 'Incorrect email or password.' };
  const result = await loadUser(data.user.id);
  if (!result.user) await supabase.auth.signOut();
  return result;
}

export async function requestPasswordReset(email: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: window.location.origin,
  });
  return error ? { error: 'Could not send the reset email. Check the address and try again.' } : {};
}

export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // The app clears its own state regardless.
  }
}

export function onSignedOut(callback: () => void): () => void {
  const { data } = supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') callback();
  });
  return () => data.subscription.unsubscribe();
}

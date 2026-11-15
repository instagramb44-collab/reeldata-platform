import type { AuthError, Session, User } from '@supabase/supabase-js';
import { SUPABASE_CONFIG_ERROR, supabase } from '../lib/supabaseClient';

export interface AuthResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
  needsEmailVerification?: boolean;
}

export interface SignUpOutcome {
  user: User | null;
  session: Session | null;
  requiresEmailVerification: boolean;
}

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Email address is required.';
  if (!EMAIL_REGEX.test(trimmed)) return 'Please enter a valid email address.';
  return null;
}

export function validateFullName(fullName: string): string | null {
  const trimmed = fullName.trim();
  if (!trimmed) return 'Full name is required.';
  if (trimmed.length < 2) return 'Full name must be at least 2 characters.';
  return null;
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];
  if (password.length < 8) {
    errors.push('At least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('One uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('One lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('One number');
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getUserDisplayName(user: User | null): string {
  if (!user) return '';
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fullName =
    (typeof meta?.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta?.name === 'string' && meta.name.trim()) ||
    '';
  if (fullName) return fullName;
  if (user.email) {
    return user.email.split('@')[0] || user.email;
  }
  return 'Account User';
}

export function getUserEmail(user: User | null): string {
  return user?.email ?? '';
}

function formatAuthError(error: AuthError | Error | unknown): {
  message: string;
  needsEmailVerification?: boolean;
} {
  if (!error) {
    return { message: 'An unexpected authentication error occurred.' };
  }

  const errObj = error as { message?: string; code?: string; status?: number };
  const rawMessage = errObj.message || 'Authentication request failed.';
  const lower = rawMessage.toLowerCase();

  if (
    lower.includes('email not confirmed') ||
    errObj.code === 'email_not_confirmed'
  ) {
    return {
      message:
        'Your email address has not been verified yet. Please open the verification link sent to your inbox before signing in.',
      needsEmailVerification: true,
    };
  }

  if (
    lower.includes('invalid login credentials') ||
    errObj.code === 'invalid_credentials'
  ) {
    return {
      message: 'Incorrect email or password. Please verify your credentials and try again.',
    };
  }

  if (
    lower.includes('user already registered') ||
    lower.includes('already been registered') ||
    errObj.code === 'user_already_exists'
  ) {
    return {
      message:
        'An account with this email address already exists. Please sign in or reset your password.',
    };
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed')
  ) {
    return {
      message:
        'Unable to reach the authentication server. Check your internet connection and try again.',
    };
  }

  return { message: rawMessage };
}

export async function signUpWithEmail(params: {
  fullName: string;
  email: string;
  password: string;
}): Promise<AuthResult<SignUpOutcome>> {
  if (!supabase) {
    return { ok: false, error: SUPABASE_CONFIG_ERROR };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email: params.email.trim(),
      password: params.password,
      options: {
        data: {
          full_name: params.fullName.trim(),
        },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      return { ok: false, error: formatAuthError(error).message };
    }

    // When email confirmation is enabled, Supabase may return a user with empty identities
    // instead of an error if the email is already registered.
    if (
      data.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0
    ) {
      return {
        ok: false,
        error:
          'An account with this email address already exists. Please sign in or reset your password.',
      };
    }

    const requiresEmailVerification = Boolean(data.user && !data.session);
    return {
      ok: true,
      data: {
        user: data.user,
        session: data.session,
        requiresEmailVerification,
      },
    };
  } catch (err) {
    return { ok: false, error: formatAuthError(err).message };
  }
}

export async function signInWithEmail(params: {
  email: string;
  password: string;
}): Promise<AuthResult<{ user: User; session: Session }>> {
  if (!supabase) {
    return { ok: false, error: SUPABASE_CONFIG_ERROR };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: params.email.trim(),
      password: params.password,
    });

    if (error) {
      const formatted = formatAuthError(error);
      return {
        ok: false,
        error: formatted.message,
        needsEmailVerification: formatted.needsEmailVerification,
      };
    }

    if (!data.user || !data.session) {
      return {
        ok: false,
        error: 'Authentication did not return an active session. Please try again.',
      };
    }

    return {
      ok: true,
      data: {
        user: data.user,
        session: data.session,
      },
    };
  } catch (err) {
    return { ok: false, error: formatAuthError(err).message };
  }
}

export async function resendVerificationEmail(email: string): Promise<AuthResult> {
  if (!supabase) {
    return { ok: false, error: SUPABASE_CONFIG_ERROR };
  }

  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      return { ok: false, error: formatAuthError(error).message };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: formatAuthError(err).message };
  }
}

export async function sendPasswordResetEmail(email: string): Promise<AuthResult> {
  if (!supabase) {
    return { ok: false, error: SUPABASE_CONFIG_ERROR };
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });

    if (error) {
      return { ok: false, error: formatAuthError(error).message };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: formatAuthError(err).message };
  }
}

export async function updateUserPassword(newPassword: string): Promise<AuthResult<User>> {
  if (!supabase) {
    return { ok: false, error: SUPABASE_CONFIG_ERROR };
  }

  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return { ok: false, error: formatAuthError(error).message };
    }

    return { ok: true, data: data.user };
  } catch (err) {
    return { ok: false, error: formatAuthError(err).message };
  }
}

export async function signOutUser(): Promise<AuthResult> {
  if (!supabase) {
    return { ok: true };
  }

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { ok: false, error: formatAuthError(error).message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: formatAuthError(err).message };
  }
}

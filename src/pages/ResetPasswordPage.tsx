import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
} from 'lucide-react';
import {
  updateUserPassword,
  validatePasswordStrength,
} from '../services/authService';

interface ResetPasswordPageProps {
  hasSession: boolean;
  userEmail: string;
  onPasswordUpdated: () => void;
  onRequestNewLink: () => void;
  onBackToLogin: () => void;
}

export function ResetPasswordPage({
  hasSession,
  userEmail,
  onPasswordUpdated,
  onRequestNewLink,
  onBackToLogin,
}: ResetPasswordPageProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatedSuccess, setUpdatedSuccess] = useState(false);

  const passwordChecks = useMemo(
    () => [
      { label: 'At least 8 characters', met: newPassword.length >= 8 },
      { label: 'One uppercase letter', met: /[A-Z]/.test(newPassword) },
      { label: 'One lowercase letter', met: /[a-z]/.test(newPassword) },
      { label: 'One number', met: /[0-9]/.test(newPassword) },
    ],
    [newPassword]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      setErrorMessage(
        `Password must include: ${strength.errors.join(', ').toLowerCase()}.`
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation password do not match.');
      return;
    }

    setSubmitting(true);
    const result = await updateUserPassword(newPassword);
    setSubmitting(false);

    if (!result.ok) {
      setErrorMessage(result.error || 'Unable to update password.');
      return;
    }

    setUpdatedSuccess(true);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-10 bg-[#F8FAFC] dark:bg-slate-950 text-[#0F172A] dark:text-slate-100">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-sm shadow-indigo-600/20">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Set a new password
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {userEmail
              ? `Updating password for ${userEmail}`
              : 'Complete your Supabase password recovery'}
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm p-6 sm:p-8 space-y-5">
          {!hasSession && !updatedSuccess ? (
            <div className="space-y-4">
              <div
                role="alert"
                className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3.5 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span>
                  This password recovery session is missing or has expired. Request a fresh password reset link to continue.
                </span>
              </div>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={onRequestNewLink}
                  className="w-full h-10 inline-flex items-center justify-center px-4 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  Request new reset link
                </button>
                <button
                  type="button"
                  onClick={onBackToLogin}
                  className="w-full h-10 inline-flex items-center justify-center px-4 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Back to Sign in
                </button>
              </div>
            </div>
          ) : updatedSuccess ? (
            <div className="space-y-4 text-center">
              <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  Password updated
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Your password has been changed successfully and your session is active.
                </p>
              </div>
              <button
                type="button"
                onClick={onPasswordUpdated}
                className="w-full h-10 inline-flex items-center justify-center px-4 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                Continue to Dashboard
              </button>
            </div>
          ) : (
            <>
              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-3.5 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <label
                    htmlFor="reset-new-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    New password
                  </label>
                  <div className="relative">
                    <Lock
                      className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="reset-new-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full h-10 pl-10 pr-10 text-sm rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {passwordChecks.map((rule) => (
                      <div
                        key={rule.label}
                        className={`flex items-center gap-1.5 text-[11px] ${
                          rule.met
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        <Check className="w-3 h-3 shrink-0" />
                        <span>{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="reset-confirm-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Confirm new password
                  </label>
                  <div className="relative">
                    <Lock
                      className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="reset-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full h-10 pl-10 pr-10 text-sm rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={
                        showConfirmPassword
                          ? 'Hide confirm password'
                          : 'Show confirm password'
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-10 inline-flex items-center justify-center gap-2 px-4 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Updating password...</span>
                    </>
                  ) : (
                    <span>Update password</span>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

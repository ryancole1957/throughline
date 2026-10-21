import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema } from '@throughline/shared';

import { BrandMark, Wordmark } from '../components/GlobalHeader';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { Button, Field, Input } from '../components/ui';
import { ApiError, describeError, type LoginInput } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Icon } from '../lib/icons';

interface LoginLocationState {
  from?: { pathname?: string; search?: string };
}

export function LoginPage() {
  const { session, isLoading, login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const state = location.state as LoginLocationState | null;
  const destination = state?.from?.pathname
    ? `${state.from.pathname}${state.from.search ?? ''}`
    : '/teams';
  const joinCode = state?.from?.pathname?.startsWith('/join/')
    ? state.from.pathname.split('/').filter(Boolean).at(-1)
    : undefined;
  const registerTo = joinCode ? `/register?code=${encodeURIComponent(joinCode)}` : '/register';

  if (isLoading) return <LoginSplash />;
  if (session) return <Navigate to={destination} replace />;

  async function onSubmit(values: LoginInput) {
    setServerError('');
    try {
      await login(values);
      navigate(destination, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        for (const [field, message] of Object.entries(error.fields)) {
          if (field === 'identifier' || field === 'password') {
            setError(field, { message });
          }
        }
      }
      setServerError(describeError(error));
    }
  }

  return (
    <div className="login-page">
      <aside className="login-aside">
        <div className="login-brand">
          <BrandMark />
          <Wordmark />
        </div>
        <div className="login-aside-main">
          <div className="login-eyebrow">{t('OPEN SOURCE · DELIVERY WORKSPACE')}</div>
          <h1 className="login-title">
            {t('A shared delivery map for')}
            <br />
            <span>{t('product and engineering teams.')}</span>
          </h1>
          <p className="login-lead">
            {t(
              'Track ownership, evidence, reviews, and the page-to-API links that keep delivery moving.',
            )}
          </p>
        </div>
        <div className="login-aside-footer">
          <span>{t('Self-hosted · Your data stays on your infrastructure')}</span>
          <span>Throughline v{__APP_VERSION__}</span>
        </div>
      </aside>

      <main className="login-main">
        <div className="login-language">
          <LanguageSwitch />
        </div>
        <div className="login-card">
          <div className="login-brand login-mobile-brand">
            <BrandMark />
            <Wordmark />
          </div>
          <h2>{t('Sign in')}</h2>
          <p className="login-card-sub">{t('Use your account to access the workspace.')}</p>
          <form className="login-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            {serverError ? (
              <div className="login-error" role="alert">
                <Icon name="alert" size={14} />
                <span>{serverError}</span>
              </div>
            ) : null}
            <Field
              label={t('Email or username')}
              htmlFor="login-identifier"
              error={errors.identifier?.message}
            >
              <Input
                id="login-identifier"
                type="text"
                autoComplete="username"
                autoFocus
                placeholder="name@example.com"
                aria-invalid={Boolean(errors.identifier)}
                {...register('identifier')}
              />
            </Field>
            <Field label={t('Password')} htmlFor="login-password" error={errors.password?.message}>
              <div className="input-with-action">
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={t('Enter your password')}
                  aria-invalid={Boolean(errors.password)}
                  {...register('password')}
                />
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? t('Hide password') : t('Show password')}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={15} />
                </button>
              </div>
            </Field>
            <Button className="login-submit" type="submit" variant="primary" loading={isSubmitting}>
              {t('Sign in')}
            </Button>
          </form>
          <div className="login-footnote login-register-link">
            <span>{t('New to Throughline?')}</span>
            <Link className="text-link" to={registerTo}>
              {t('Create an account')}
            </Link>
          </div>
          <div className="login-meta">
            <span>{t('Open source under the MIT License')}</span>
            <span>v{__APP_VERSION__}</span>
          </div>
        </div>
      </main>
    </div>
  );
}

function LoginSplash() {
  return (
    <div className="standalone-center">
      <div className="login-brand">
        <BrandMark />
        <Wordmark />
      </div>
    </div>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { registerSchema } from '@throughline/shared';

import { BrandMark, Wordmark } from '../components/GlobalHeader';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { Button, Field, Input } from '../components/ui';
import { ApiError, describeError, errorFields, type RegisterInput } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from '../lib/icons';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/toast';

export function RegisterPage() {
  const { t } = useI18n();
  const { session, register: registerAccount } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const inviteCode = params.get('code') ?? '';
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      title: '',
      password: '',
      inviteCode,
    },
  });

  if (session) return <Navigate to="/teams" replace />;

  async function onSubmit(values: RegisterInput) {
    setServerError('');
    try {
      await registerAccount(values);
      toast.success(t('Account created'));
      navigate('/teams', { replace: true });
    } catch (error) {
      const fields = errorFields(error);
      for (const [field, message] of Object.entries(fields)) {
        if (
          field === 'name' ||
          field === 'email' ||
          field === 'password' ||
          field === 'inviteCode'
        ) {
          setError(field, { message });
        }
      }
      if (error instanceof ApiError && error.code === 'email_exists') {
        setError('email', { message: describeError(error) });
      } else if (error instanceof ApiError && error.code === 'invalid_invite_code') {
        setError('inviteCode', { message: describeError(error) });
      } else {
        setServerError(describeError(error));
      }
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
            {t('A shared delivery map for product and engineering teams.')}
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
        <div className="login-card" style={{ maxWidth: 400 }}>
          <div className="login-brand login-mobile-brand">
            <BrandMark />
            <Wordmark />
          </div>
          <h2>{t('Create your account')}</h2>
          <p className="login-card-sub">{t('Join a team or start your own.')}</p>
          <form className="login-form" onSubmit={handleSubmit(onSubmit)} noValidate>
            {serverError ? (
              <div className="login-error" role="alert">
                <Icon name="alert" size={14} />
                <span>{serverError}</span>
              </div>
            ) : null}
            <Field label={t('Full name')} htmlFor="register-name" error={errors.name?.message}>
              <Input
                id="register-name"
                autoComplete="name"
                autoFocus
                placeholder={t('e.g. Alex Morgan')}
                {...register('name')}
              />
            </Field>
            <Field label={t('Email')} htmlFor="register-email" error={errors.email?.message}>
              <Input
                id="register-email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                {...register('email')}
              />
            </Field>
            <Field
              label={t('Password')}
              htmlFor="register-password"
              error={errors.password?.message}
              hint={t('At least 12 characters.')}
            >
              <Input
                id="register-password"
                type="password"
                autoComplete="new-password"
                {...register('password')}
              />
            </Field>
            <Field
              label={t('Invite code (optional)')}
              htmlFor="register-invite"
              error={errors.inviteCode?.message}
              hint={t('Leave blank to create your own team later.')}
            >
              <Input
                id="register-invite"
                autoComplete="off"
                autoCapitalize="characters"
                placeholder={t('Enter the invite code you received')}
                {...register('inviteCode')}
              />
            </Field>
            <Button
              className="login-submit"
              type="submit"
              variant="primary"
              loading={isSubmitting}
            >
              {t('Create account')}
            </Button>
          </form>
          <div className="login-meta">
            <span>{t('Already have an account?')}</span>
            <Link className="text-link" to="/login">
              {t('Sign in')}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

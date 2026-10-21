import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { BrandMark, Wordmark } from '../components/GlobalHeader';
import { Button, Spinner } from '../components/ui';
import { api, describeError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';

export function JoinPage() {
  const { code = '' } = useParams<{ code: string }>();
  const { t } = useI18n();
  const { session, isLoading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const attempted = useRef<number | null>(null);

  useEffect(() => {
    if (!session || !code || attempted.current === attempt) return;
    attempted.current = attempt;
    setJoining(true);
    api.teams
      .join(code)
      .then((result) => {
        navigate(`/teams/${result.team.id}`, { replace: true });
      })
      .catch((err) => {
        setError(describeError(err));
      })
      .finally(() => {
        setJoining(false);
      });
  }, [attempt, code, navigate, session]);

  if (isLoading) {
    return (
      <div className="standalone-center">
        <Spinner size={20} />
      </div>
    );
  }
  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: { pathname: `/join/${encodeURIComponent(code)}` } }}
      />
    );
  }

  return (
    <div className="standalone-center">
      <div className="message-card">
        <BrandMark />
        <Wordmark />
        <h1>{error ? t('Could not join team') : t('Joining team…')}</h1>
        {error ? (
          <>
            <p>{error}</p>
            <div className="message-actions">
              <Button variant="primary" onClick={() => navigate('/teams')}>
                {t('Go to teams')}
              </Button>
              <Button
                onClick={() => {
                  setError('');
                  setAttempt((value) => value + 1);
                }}
              >
                {t('Retry')}
              </Button>
            </div>
          </>
        ) : (
          <p>{joining ? t('Joining team…') : t('Joined the team')}</p>
        )}
      </div>
    </div>
  );
}

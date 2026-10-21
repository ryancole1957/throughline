import { Link } from 'react-router-dom';

import { BrandMark } from '../components/GlobalHeader';
import { useI18n } from '../lib/i18n';

export function NotFoundPage() {
  const { t } = useI18n();

  return (
    <div className="standalone-center">
      <div className="message-card">
        <BrandMark />
        <h1>{t('Page not found')}</h1>
        <p>{t('This page may have been moved, or you may not have access.')}</p>
        <div className="message-actions">
          <Link className="btn btn-primary" to="/projects">
            {t('Back to projects')}
          </Link>
        </div>
      </div>
    </div>
  );
}

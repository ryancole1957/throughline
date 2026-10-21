import { cn } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { LOCALES, type Locale } from '../lib/locale';
import { Icon } from '../lib/icons';

export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className={cn('language-switch', className)} title={t('Language')}>
      <Icon name="globe" size={13} />
      <select
        className="language-select"
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label={t('Language')}
      >
        {LOCALES.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

import { useTranslation } from 'react-i18next';

const LANGUAGES = ['en', 'ar'];

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 4,
        background: 'var(--bg-surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-full)',
      }}
      aria-label={t('common.language', 'Language')}
    >
      {LANGUAGES.map((language) => {
        const active = i18n.language === language;
        return (
          <button
            key={language}
            type="button"
            onClick={() => i18n.changeLanguage(language)}
            aria-pressed={active}
            style={{
              border: 'none',
              borderRadius: 'var(--radius-full)',
              padding: '6px 12px',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#020810' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}
          >
            {language}
          </button>
        );
      })}
    </div>
  );
}

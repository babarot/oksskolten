import { useI18n, type Locale } from '../../../lib/i18n'
import { apiPatch } from '../../../lib/fetcher'
import { RadioGroup } from '@/components/ui/radio-group'

export function LanguageSection() {
  const { t, locale, setLocale } = useI18n()

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-4">{t('settings.language')}</h2>

      <div>
        <p className="text-xs text-muted mb-3">{t('settings.languageDesc')}</p>
        <RadioGroup
          name="language"
          options={[
            { value: 'ja' as Locale, label: t('settings.languageJa') },
            { value: 'en' as Locale, label: t('settings.languageEn') },
            { value: 'zh' as Locale, label: t('settings.languageZh') },
          ]}
          value={locale}
          onChange={(val) => {
            setLocale(val as Locale)
            void apiPatch('/api/settings/profile', { language: val })
          }}
        />
      </div>
    </section>
  )
}

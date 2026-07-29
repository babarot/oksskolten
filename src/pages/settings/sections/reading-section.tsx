import { useState, useEffect } from 'react'
import { useI18n, type TranslateFn } from '../../../lib/i18n'
import { PreviewCard } from '../../../components/settings/preview-card'
import { useAppLayout } from '../../../app'
import { RadioGroup } from '@/components/ui/radio-group'
import type { KeyBindings } from '../../../hooks/use-keyboard-navigation'

export function ReadingSection() {
  const { settings } = useAppLayout()
  const {
    autoMarkRead, setAutoMarkRead,
    keyboardNavigation, setKeyboardNavigation,
    keybindings, setKeybindings,
    showUnreadIndicator, setShowUnreadIndicator,
    indicatorStyle,
    internalLinks, setInternalLinks,
    categoryUnreadOnly, setCategoryUnreadOnly,
    showThumbnails, setShowThumbnails,
    showFeedActivity, setShowFeedActivity,
    chatPosition, setChatPosition,
    articleOpenMode, setArticleOpenMode,
    dateMode, setDateMode,
  } = settings
  const { t, locale } = useI18n()

  return (
    <section>
      <h2 className="text-base font-semibold text-text mb-4">{t('settings.reading')}</h2>

      <div>
        <p className="text-sm text-text mb-1">{t('settings.unreadIndicator')}</p>
        <p className="text-xs text-muted mb-3">{t(indicatorStyle === 'dot' ? 'settings.unreadIndicatorDescDot' : 'settings.unreadIndicatorDescLine')}</p>
        <div className="flex gap-3">
          {([
            { value: 'on' as const, label: t('settings.unreadIndicatorOn') },
            { value: 'off' as const, label: t('settings.unreadIndicatorOff') },
          ]).map(option => {
            const isOn = option.value === 'on'
            const rows = [
              { unread: true, titleW: 'w-4/5', excerptW: 'w-3/5' },
              { unread: true, titleW: 'w-full', excerptW: 'w-2/5' },
              { unread: false, titleW: 'w-3/5', excerptW: 'w-1/2' },
            ]
            return (
              <PreviewCard
                key={option.value}
                selected={showUnreadIndicator === option.value}
                onClick={() => setShowUnreadIndicator(option.value)}
                label={option.label}
                sizeClass="w-full md:w-[160px] h-[112px]"
                className="flex-1 md:flex-none"
              >
                <div className="w-full h-full bg-bg-card p-2.5 flex flex-col justify-between">
                  {rows.map((row, i) => (
                    <div key={i} className={`flex items-center gap-2 ${i > 0 ? 'border-t border-border pt-1.5' : ''}`}>
                      {isOn && indicatorStyle === 'dot' && (
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${row.unread ? 'bg-accent' : 'opacity-0'}`} />
                      )}
                      <div className={`flex-1 space-y-1 ${isOn && indicatorStyle === 'line' ? `border-l ${row.unread ? 'border-l-accent' : 'border-l-transparent'}` : ''} ${isOn && indicatorStyle === 'line' ? 'pl-1.5' : ''}`}>
                        <div className={`${row.titleW} h-2 rounded-full ${row.unread ? 'bg-text/25' : 'bg-text/10'}`} />
                        <div className={`${row.excerptW} h-1.5 rounded-full bg-text/8`} />
                      </div>
                      <div className="w-5 h-5 rounded-sm bg-border/30 shrink-0" />
                    </div>
                  ))}
                </div>
              </PreviewCard>
            )
          })}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm text-text mb-1">{t('settings.showThumbnails')}</p>
        <p className="text-xs text-muted mb-3">{t('settings.showThumbnailsDesc')}</p>
        <div className="flex gap-3">
          {([
            { value: 'on' as const, label: t('settings.showThumbnailsOn') },
            { value: 'off' as const, label: t('settings.showThumbnailsOff') },
          ]).map(option => {
            const isOn = option.value === 'on'
            const rows = [
              { titleW: 'w-4/5', excerptW: 'w-3/5' },
              { titleW: 'w-full', excerptW: 'w-2/5' },
              { titleW: 'w-3/5', excerptW: 'w-1/2' },
            ]
            return (
              <PreviewCard
                key={option.value}
                selected={showThumbnails === option.value}
                onClick={() => setShowThumbnails(option.value)}
                label={option.label}
                sizeClass="w-full md:w-[160px] h-[112px]"
                className="flex-1 md:flex-none"
              >
                <div className="w-full h-full bg-bg-card p-2.5 flex flex-col justify-between">
                  {rows.map((row, i) => (
                    <div key={i} className={`flex items-center gap-2 ${i > 0 ? 'border-t border-border pt-1.5' : ''}`}>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className={`${row.titleW} h-2 rounded-full bg-text/25`} />
                        <div className={`${row.excerptW} h-1.5 rounded-full bg-text/8`} />
                      </div>
                      {isOn && (
                        <div className="w-6 h-6 rounded-sm shrink-0 bg-accent/20 flex items-center justify-center">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent/50">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="m21 15-5-5L5 21" />
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </PreviewCard>
            )
          })}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm text-text mb-1">{t('settings.showFeedActivity')}</p>
        <p className="text-xs text-muted mb-3">{t('settings.showFeedActivityDesc')}</p>
        <div className="flex gap-3">
          {([
            { value: 'on' as const, label: t('settings.showFeedActivityOn') },
            { value: 'off' as const, label: t('settings.showFeedActivityOff') },
          ]).map(option => {
            const isOn = option.value === 'on'
            const rows = [
              { titleW: 'w-4/5', excerptW: 'w-3/5' },
              { titleW: 'w-full', excerptW: 'w-2/5' },
              { titleW: 'w-3/5', excerptW: 'w-1/2' },
            ]
            const metricsText = t('metrics.preview')
            return (
              <PreviewCard
                key={option.value}
                selected={showFeedActivity === option.value}
                onClick={() => setShowFeedActivity(option.value)}
                label={option.label}
                sizeClass="w-full md:w-[160px] h-[112px]"
                className="flex-1 md:flex-none"
              >
                <div className="w-full h-full bg-bg-card flex flex-col">
                  {isOn && (
                    <div className="px-2.5 pt-2 pb-1">
                      <span className="text-[9px] leading-none text-muted/60">{metricsText}</span>
                    </div>
                  )}
                  <div className={`flex-1 px-2.5 ${isOn ? 'pt-0' : 'pt-2.5'} pb-2.5 flex flex-col justify-between`}>
                    {rows.map((row, i) => (
                      <div key={i} className={`flex items-center gap-2 ${i > 0 ? 'border-t border-border pt-1.5' : ''}`}>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className={`${row.titleW} h-2 rounded-full bg-text/25`} />
                          <div className={`${row.excerptW} h-1.5 rounded-full bg-text/8`} />
                        </div>
                        <div className="w-5 h-5 rounded-sm bg-border/30 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              </PreviewCard>
            )
          })}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm text-text mb-1">{t('settings.dateFormat')}</p>
        <div className="flex gap-3 mt-3">
          {([
            { value: 'relative' as const, label: t('feeds.dateRelative'), dates: (() => {
              const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'narrow' })
              return [rtf.format(-3, 'hour'), rtf.format(-2, 'day'), rtf.format(-1, 'week')]
            })() },
            { value: 'absolute' as const, label: t('feeds.dateAbsolute'), dates: (() => {
              const now = new Date()
              return [1, 2, 7].map(daysAgo => {
                const d = new Date(now.getTime() - daysAgo * 86400_000)
                return d.toLocaleDateString(locale, { month: 'numeric', day: 'numeric' })
              })
            })() },
          ]).map(mode => (
            <PreviewCard
              key={mode.value}
              selected={dateMode === mode.value}
              onClick={() => setDateMode(mode.value)}
              label={mode.label}
              sizeClass="w-full md:w-[160px] h-[112px]"
              className="flex-1 md:flex-none"
            >
              <div className="w-full h-full bg-bg-card p-2.5 flex flex-col justify-between">
                {mode.dates.map((d, i) => (
                  <div key={i} className={`flex items-center gap-2 ${i > 0 ? 'border-t border-border pt-1.5' : ''}`}>
                    <div className="flex-1 space-y-1">
                      <div className={`${i === 0 ? 'w-full' : i === 1 ? 'w-4/5' : 'w-3/5'} h-2 rounded-full bg-text/15`} />
                      <div className={`${i === 0 ? 'w-3/5' : 'w-2/5'} h-1.5 rounded-full bg-text/8`} />
                    </div>
                    <span className="text-[10px] leading-none text-muted shrink-0 font-medium tabular-nums">{d}</span>
                  </div>
                ))}
              </div>
            </PreviewCard>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm text-text mb-1">{t('settings.chatPosition')}</p>
        <p className="text-xs text-muted mb-3">{t('settings.chatPositionDesc')}</p>
        <div className="flex gap-3">
          {([
            { value: 'fab' as const, label: t('settings.chatPositionFab') },
            { value: 'inline' as const, label: t('settings.chatPositionInline') },
          ]).map(option => (
            <PreviewCard
              key={option.value}
              selected={chatPosition === option.value}
              onClick={() => setChatPosition(option.value)}
              label={option.label}
              sizeClass="w-full md:w-[160px] h-[112px]"
              className="flex-1 md:flex-none"
            >
              {option.value === 'fab' ? (
                <div className="w-full h-full bg-bg-card py-2.5 flex flex-col items-center relative">
                  <div className="w-3/5 flex-1 space-y-1.5">
                    <div className="w-full h-1.5 rounded-full bg-muted opacity-30" />
                    <div className="w-11/12 h-1.5 rounded-full bg-muted opacity-30" />
                    <div className="w-full h-1.5 rounded-full bg-muted opacity-30" />
                    <div className="w-5/6 h-1.5 rounded-full bg-muted opacity-30" />
                    <div className="w-full h-1.5 rounded-full bg-muted opacity-30" />
                    <div className="w-2/3 h-1.5 rounded-full bg-muted opacity-30" />
                  </div>
                  <div className="absolute bottom-2 right-3 w-7 h-7 rounded-full bg-accent flex items-center justify-center shadow-sm">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2z" />
                      <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
                    </svg>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full bg-bg-card pt-4 pb-3 flex flex-col items-center gap-3">
                  <div className="w-1/2 h-2.5 rounded-full bg-muted opacity-50" />
                  <div className="flex items-center">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded bg-border flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-sm bg-muted opacity-40" />
                      </div>
                      <div className="w-5 h-5 rounded bg-border flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-sm bg-muted opacity-40" />
                      </div>
                      <div className="w-5 h-5 rounded bg-accent/30 flex items-center justify-center">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                          <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2z" />
                          <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
                        </svg>
                      </div>
                      <div className="w-5 h-5 rounded bg-border flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-sm bg-muted opacity-40" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </PreviewCard>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm text-text mb-1">{t('settings.articleOpenMode')}</p>
        <p className="text-xs text-muted mb-3">{t('settings.articleOpenModeDesc')}</p>
        <div className="flex gap-3">
          {([
            { value: 'page' as const, label: t('settings.articleOpenModePage') },
            { value: 'overlay' as const, label: t('settings.articleOpenModeOverlay') },
            { value: 'split' as const, label: t('settings.articleOpenModeSplit') },
          ]).map(option => (
            <PreviewCard
              key={option.value}
              selected={articleOpenMode === option.value}
              onClick={() => setArticleOpenMode(option.value)}
              label={option.label}
              sizeClass="w-full md:w-[160px] h-[112px]"
              className="flex-1 md:flex-none"
            >
              {option.value === 'page' ? (
                <div className="w-full h-full bg-bg-card flex flex-col">
                  {/* Page transition preview: list → detail */}
                  <div className="flex-1 flex items-center justify-center gap-2 px-3">
                    {/* List view */}
                    <div className="w-10 h-14 rounded border border-border bg-bg-card p-1 space-y-1">
                      <div className="w-full h-1 rounded-full bg-text/15" />
                      <div className="w-3/4 h-1 rounded-full bg-text/15" />
                      <div className="w-full h-1 rounded-full bg-accent/30" />
                      <div className="w-2/3 h-1 rounded-full bg-text/15" />
                    </div>
                    {/* Arrow */}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted/50 shrink-0">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                    {/* Detail view */}
                    <div className="w-10 h-14 rounded border border-border bg-bg-card p-1 space-y-1">
                      <div className="w-full h-2 rounded-sm bg-text/20" />
                      <div className="w-full h-0.5 rounded-full bg-text/8" />
                      <div className="w-full h-0.5 rounded-full bg-text/8" />
                      <div className="w-3/4 h-0.5 rounded-full bg-text/8" />
                      <div className="w-full h-0.5 rounded-full bg-text/8" />
                    </div>
                  </div>
                </div>
              ) : option.value === 'overlay' ? (
                <div className="w-full h-full bg-bg-card flex relative overflow-hidden">
                  {/* Background list (dimmed) */}
                  <div className="absolute inset-0 p-2 space-y-1.5 opacity-20">
                    <div className="w-full h-1.5 rounded-full bg-text/15" />
                    <div className="w-3/4 h-1.5 rounded-full bg-text/15" />
                    <div className="w-full h-1.5 rounded-full bg-text/15" />
                    <div className="w-2/3 h-1.5 rounded-full bg-text/15" />
                    <div className="w-full h-1.5 rounded-full bg-text/15" />
                  </div>
                  {/* Right slide-in panel */}
                  <div className="absolute top-0 bottom-0 right-0 w-3/5 bg-bg-card border-l border-border shadow-lg p-2 space-y-1 z-10">
                    <div className="flex items-center gap-1 mb-1.5">
                      <div className="w-2 h-2 rounded-full bg-muted/30" />
                    </div>
                    <div className="w-full h-2 rounded-sm bg-text/20" />
                    <div className="w-2/3 h-1 rounded-full bg-muted/20 mt-0.5" />
                    <div className="w-full h-0.5 rounded-full bg-text/8 mt-1.5" />
                    <div className="w-full h-0.5 rounded-full bg-text/8" />
                    <div className="w-3/4 h-0.5 rounded-full bg-text/8" />
                    <div className="w-full h-0.5 rounded-full bg-text/8" />
                  </div>
                </div>
              ) : (
                /* Split view preview: sidebar | list | detail */
                <div className="w-full h-full bg-bg-card flex overflow-hidden">
                  <div className="w-[22%] h-full border-r border-border p-1 space-y-1 shrink-0">
                    <div className="w-full h-1 rounded-full bg-text/15" />
                    <div className="w-full h-1 rounded-full bg-accent/40" />
                    <div className="w-full h-1 rounded-full bg-text/15" />
                    <div className="w-full h-1 rounded-full bg-text/15" />
                  </div>
                  <div className="w-[35%] h-full border-r border-border p-1 space-y-1 shrink-0">
                    <div className="w-full h-1 rounded-full bg-text/15" />
                    <div className="w-3/4 h-1 rounded-full bg-accent/30" />
                    <div className="w-full h-1 rounded-full bg-text/15" />
                    <div className="w-2/3 h-1 rounded-full bg-text/15" />
                  </div>
                  <div className="flex-1 h-full p-1 space-y-1">
                    <div className="w-full h-2 rounded-sm bg-text/20" />
                    <div className="w-2/3 h-0.5 rounded-full bg-muted/20 mt-0.5" />
                    <div className="w-full h-0.5 rounded-full bg-text/8 mt-1" />
                    <div className="w-full h-0.5 rounded-full bg-text/8" />
                    <div className="w-3/4 h-0.5 rounded-full bg-text/8" />
                  </div>
                </div>
              )}
            </PreviewCard>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm text-text mb-1">{t('settings.autoMarkRead')}</p>
        <p className="text-xs text-muted mb-3">{t('settings.autoMarkReadDesc')}</p>
        <RadioGroup
          name="autoMarkRead"
          options={[
            { value: 'on' as const, label: t('settings.autoMarkReadOn') },
            { value: 'off' as const, label: t('settings.autoMarkReadOff') },
          ]}
          value={autoMarkRead}
          onChange={setAutoMarkRead}
        />
      </div>

      <div className="mt-6">
        <p className="text-sm text-text mb-1">{t('settings.internalLinks')}</p>
        <p className="text-xs text-muted mb-3">{t('settings.internalLinksDesc')}</p>
        <RadioGroup
          name="internalLinks"
          options={[
            { value: 'on' as const, label: t('settings.internalLinksOn') },
            { value: 'off' as const, label: t('settings.internalLinksOff') },
          ]}
          value={internalLinks}
          onChange={setInternalLinks}
        />
      </div>

      <div className="mt-6">
        <p className="text-sm text-text mb-1">{t('settings.categoryUnreadOnly')}</p>
        <p className="text-xs text-muted mb-3">{t('settings.categoryUnreadOnlyDesc')}</p>
        <RadioGroup
          name="categoryUnreadOnly"
          options={[
            { value: 'on' as const, label: t('settings.categoryUnreadOnlyOn') },
            { value: 'off' as const, label: t('settings.categoryUnreadOnlyOff') },
          ]}
          value={categoryUnreadOnly}
          onChange={setCategoryUnreadOnly}
        />
      </div>

      <div className="mt-6">
        <p className="text-sm text-text mb-1">{t('settings.keyboardNavigation')}</p>
        <p className="text-xs text-muted mb-3">{t('settings.keyboardNavigationDesc')}</p>
        <RadioGroup
          name="keyboardNavigation"
          options={[
            { value: 'on' as const, label: t('settings.keyboardNavigationOn') },
            { value: 'off' as const, label: t('settings.keyboardNavigationOff') },
          ]}
          value={keyboardNavigation}
          onChange={setKeyboardNavigation}
        />
      </div>

      {keyboardNavigation === 'on' && (
        <KeybindingsEditor
          keybindings={keybindings}
          setKeybindings={setKeybindings}
          t={t}
        />
      )}

    </section>
  )
}

function KeybindingsEditor({
  keybindings,
  setKeybindings,
  t,
}: {
  keybindings: KeyBindings
  setKeybindings: (kb: KeyBindings) => void
  t: TranslateFn
}) {
  const [draft, setDraft] = useState<KeyBindings>(keybindings)

  useEffect(() => { setDraft(keybindings) }, [keybindings])

  const actions: Array<{ key: keyof KeyBindings; label: string }> = [
    { key: 'next', label: t('settings.keybindingsNext') },
    { key: 'prev', label: t('settings.keybindingsPrev') },
    { key: 'bookmark', label: t('settings.keybindingsBookmark') },
    { key: 'openExternal', label: t('settings.keybindingsOpenExternal') },
  ]

  const values = Object.values(draft)
  const hasDuplicate = new Set(values).size !== values.length

  const PRINTABLE_RE = /^[!-~]$/

  const handleChange = (action: keyof KeyBindings, value: string) => {
    const next = { ...draft, [action]: value }
    setDraft(next)
    const nextValues = Object.values(next)
    if (new Set(nextValues).size === nextValues.length && nextValues.every(v => PRINTABLE_RE.test(v))) {
      setKeybindings(next)
    }
  }

  return (
    <div className="mt-4 ml-1">
      <p className="text-sm text-text mb-1">{t('settings.keybindings')}</p>
      <p className="text-xs text-muted mb-3">{t('settings.keybindingsDesc')}</p>
      <div className="space-y-2">
        {actions.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-sm text-text w-32">{label}</span>
            <input
              type="text"
              maxLength={1}
              value={draft[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              onBlur={() => {
                if (!draft[key]) setDraft(prev => ({ ...prev, [key]: keybindings[key] }))
              }}
              className="w-10 h-8 text-center text-sm border border-border rounded bg-bg-card text-text focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        ))}
      </div>
      {hasDuplicate && (
        <p className="text-xs text-error mt-2">{t('settings.keybindingsDuplicate')}</p>
      )}
    </div>
  )
}

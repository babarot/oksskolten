import { lazy, Suspense } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Construction, ExternalLink } from 'lucide-react'
import useSWR from 'swr'
import { useI18n, APP_NAME } from '../lib/i18n'
import { PasswordSettings } from '../components/settings/password-settings'
import { PasskeySettings } from '../components/settings/passkey-settings'
import { GitHubOAuthSettings } from '../components/settings/github-oauth-settings'
import { ApiTokenSettings } from '../components/settings/api-token-settings'
import { ImageStorageSettings } from '../components/settings/image-storage-settings'
import { GeneralTab } from './settings/general-tab'
const AppearanceTab = lazy(() => import('./settings/appearance-tab').then(m => ({ default: m.AppearanceTab })))
import { IntegrationTab } from './settings/integration-tab'
import { DataTab } from './settings/data-tab'
import { MembersTab } from './settings/members-tab'
import { Separator } from '@/components/ui/separator'
import { fetcher } from '../lib/fetcher'

declare const __APP_VERSION__: string

const BASE_TABS = ['general', 'appearance', 'integration', 'plugins', 'security', 'data', 'viewer', 'about'] as const

export function SettingsPage() {
  const { tab: tabParam } = useParams<{ tab?: string }>()
  const tab = tabParam ?? 'general'
  const { t } = useI18n()
  const navigate = useNavigate()
  const settingsChunkVersion = '2026-03-29-2'
  const { data: me } = useSWR<{ role?: 'owner' | 'admin' | 'member' }>('/api/me', fetcher)
  const tabs = me?.role === 'owner' || me?.role === 'admin'
    ? [...BASE_TABS, 'members']
    : BASE_TABS

  return (
    <div className="bg-bg" data-settings-version={settingsChunkVersion}>
      <div className="max-w-5xl mx-auto px-4 pt-6 md:pt-8">
        <h1 className="text-2xl font-bold text-text mb-4 select-none">{t('settings.title')}</h1>
      </div>
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row">
        <nav className="flex gap-1 px-4 py-2 select-none md:hidden overflow-x-auto">
          {tabs.map(key => (
            <button
              key={key}
              onClick={() => navigate(`/settings/${key}`)}
              className={`shrink-0 whitespace-nowrap px-3 py-1.5 text-sm rounded-lg ${
                tab === key
                  ? 'bg-hover-sidebar text-accent font-medium'
                  : 'text-muted hover:bg-hover-sidebar hover:text-text'
              }`}
            >
              {key === 'members' ? 'Members' : t(`settings.${key}` as 'settings.general')}
            </button>
          ))}
        </nav>

        <nav className="hidden md:block md:w-44 shrink-0 px-4 py-4 select-none space-y-1.5">
          {tabs.map(key => (
            <button
              key={key}
              onClick={() => navigate(`/settings/${key}`)}
              className={`w-full text-left px-3 py-1.5 text-sm rounded-lg ${
                tab === key
                  ? 'bg-hover-sidebar text-accent font-medium'
                  : 'text-muted hover:bg-hover-sidebar hover:text-text'
              }`}
            >
              {key === 'members' ? 'Members' : t(`settings.${key}` as 'settings.general')}
            </button>
          ))}
        </nav>

        <main className="flex-1 px-4 md:px-6 pt-4 md:pt-6 pb-32 space-y-8">
          {tab === 'viewer' && (
            <div className="flex flex-col items-center justify-center py-16 text-muted select-none">
              <Construction size={40} strokeWidth={1.5} className="mb-3 text-muted" />
              <p className="text-sm">{t('settings.underDevelopment')}</p>
            </div>
          )}

          {tab === 'general' && (
            <GeneralTab />
          )}

          {tab === 'data' && (
            <DataTab />
          )}

          {tab === 'plugins' && (
            <ImageStorageSettings />
          )}

          {tab === 'appearance' && (
            <Suspense>
              <AppearanceTab />
            </Suspense>
          )}

          {tab === 'integration' && (
            <IntegrationTab />
          )}

          {tab === 'security' && (
            <>
              <PasswordSettings />
              <Separator />
              <PasskeySettings />
              <Separator />
              <GitHubOAuthSettings />
              <Separator />
              <ApiTokenSettings />
            </>
          )}

          {tab === 'about' && <AboutTab />}

          {tab === 'members' && <MembersTab />}
        </main>
      </div>
    </div>
  )
}

const healthFetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json())

function AboutTab() {
  const { t } = useI18n()
  const { data } = useSWR<{ gitCommit?: string; gitTag?: string; buildDate?: string }>('/api/health', healthFetcher, { revalidateOnFocus: false })

  const commit = data?.gitCommit
  const tag = data?.gitTag
  const buildDate = data?.buildDate
  const showCommit = commit && commit !== 'dev' && commit !== 'unknown'
  const showTag = tag && tag !== 'dev' && tag !== 'unknown'
  const showBuildDate = buildDate && buildDate !== 'unknown'

  return (
    <div className="flex flex-col items-center justify-center py-16 select-none">
      <img src="/pwa-192x192.png" alt={APP_NAME} className="w-16 h-16 rounded-2xl mb-4" />
      <h2 className="text-lg font-bold text-text">{APP_NAME}</h2>
      <p className="text-sm text-muted mt-1">{t('about.version')} {__APP_VERSION__}</p>

      {(showCommit || showTag || showBuildDate) && (
        <div className="mt-3 text-xs text-muted space-y-0.5 text-center">
          {showCommit && (
            <p>
              {t('about.commit')}{' '}
              <a
                href={`https://github.com/babarot/oksskolten/commit/${commit}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline font-mono"
              >
                {commit!.slice(0, 7)}
              </a>
            </p>
          )}
          {showTag && <p>Tag: {tag}</p>}
          {showBuildDate && <p>{t('about.buildDate')}: {new Date(buildDate).toLocaleString()}</p>}
        </div>
      )}

      <div className="flex gap-4 mt-4">
        <a
          href="https://github.com/babarot/oksskolten"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline text-sm inline-flex items-center gap-1"
        >
          {t('about.github')}
          <ExternalLink size={12} />
        </a>
        <a
          href="https://github.com/babarot/oksskolten/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline text-sm inline-flex items-center gap-1"
        >
          {t('about.issues')}
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  )
}

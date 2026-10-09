import { Rss } from 'lucide-react'

export function GReaderSettings() {
  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <Rss size={16} className="text-muted" />
        <h2 className="text-base font-semibold text-text">Google Reader API</h2>
      </div>
      <p className="text-xs text-muted mb-4">
        Connect third-party feed readers like NetNewsWire, Reeder, or ReadKit using the Google Reader
        protocol. Use your Oksskolten email and account password to authenticate.
      </p>

      <div className="rounded-lg border border-border bg-bg-card px-4 py-3 space-y-3">
        <div>
          <p className="text-xs text-muted select-none">Server URL</p>
          <p className="text-sm text-text font-mono break-all">{window.location.origin}</p>
        </div>
        <div>
          <p className="text-xs text-muted select-none">Username</p>
          <p className="text-sm text-text">Your Oksskolten email address</p>
        </div>
        <div>
          <p className="text-xs text-muted select-none">Password</p>
          <p className="text-sm text-text">Your Oksskolten account password</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        In your feed reader, choose <strong>FreshRSS</strong> or <strong>Google Reader</strong> as
        the account type and enter the server URL above together with your credentials.
      </p>
    </section>
  )
}

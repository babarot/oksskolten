import { createContext, useContext } from 'react'

export type Locale = 'ja' | 'en'

export const APP_NAME = 'Oksskolten'

const dict = {
  // Header
  'header.menu': { ja: 'メニュー', en: 'Menu' },
  'header.back': { ja: '戻る', en: 'Back' },
  'header.modeSystem': { ja: 'システム', en: 'System' },
  'header.modeDark': { ja: 'ダークモード', en: 'Dark' },
  'header.modeLight': { ja: 'ライトモード', en: 'Light' },
  'header.title': { ja: APP_NAME, en: APP_NAME },

  // FeedList
  'feeds.title': { ja: 'フィード', en: 'Feeds' },
  'feeds.inbox': { ja: 'Inbox', en: 'Inbox' },
  'feeds.add': { ja: 'フィード', en: 'Feed' },
  'feeds.theme': { ja: 'テーマ', en: 'Theme' },
  'feeds.colorMode': { ja: 'カラーモード', en: 'Color mode' },
  'feeds.rename': { ja: '名前を変更', en: 'Rename' },
  'feeds.markAllRead': { ja: 'すべて既読にする', en: 'Mark all as read' },
  'feeds.delete': { ja: '削除', en: 'Delete' },
  'feeds.deleteFeed': { ja: 'フィードを削除', en: 'Delete Feed' },
  'feeds.reEnableFeed': { ja: 'フィードを再有効化', en: 'Re-enable Feed' },
  'feeds.deleteConfirm': {
    ja: '${name} を削除しますか？紐づく記事もすべて削除されます。',
    en: 'Delete ${name}? All associated articles will also be deleted.',
  },
  'feeds.reEnableConfirm': {
    ja: 'このフィードは連続エラーにより無効化されています。再有効化しますか？',
    en: 'This feed was disabled due to repeated errors. Re-enable it?',
  },
  'feeds.enable': { ja: '有効化', en: 'Enable' },
  'feeds.bookmarks': { ja: 'あとで読む', en: 'Read Later' },
  'feeds.likes': { ja: 'いいね', en: 'Liked' },
  'feeds.today': { ja: 'Today', en: 'Today' },
  'feeds.history': { ja: '読んだ記事', en: 'Read' },
  'feeds.fetch': { ja: 'フェッチ', en: 'Fetch articles' },
  'category.fetchAll': { ja: 'すべてフェッチ', en: 'Fetch all feeds' },
  'feeds.reDetect': { ja: 'RSS を再検出', en: 'Re-detect RSS' },
  'feeds.clips': { ja: 'クリップ', en: 'Clips' },
  'feeds.clipArticle': { ja: '記事をクリップ', en: 'Clip Article' },
  'feeds.articleUrlPlaceholder': { ja: '記事のURLを入力', en: 'Enter article URL' },
  'modal.clipExistsInFeed': {
    ja: 'この記事はフィード「',
    en: 'This article already exists in feed "',
  },
  'modal.clipExistsInFeedSuffix': {
    ja: '」に登録済みです',
    en: '"',
  },
  'modal.clipViewArticle': {
    ja: '記事を見る',
    en: 'View article',
  },
  'modal.clipAlreadyExists': {
    ja: 'この記事はすでにクリップに保存されています',
    en: 'This article is already saved in Clips',
  },
  'modal.clipMoveToClips': { ja: 'クリップに移動', en: 'Move to Clips' },

  // ArticleList
  'articles.loadError': { ja: '読み込みに失敗しました', en: 'Failed to load' },
  'articles.retry': { ja: '再試行', en: 'Retry' },
  'articles.empty': { ja: '記事がありません', en: 'No articles' },
  'articles.allRead': { ja: 'すべて読みました', en: 'All caught up!' },
  'articles.showReadArticles': { ja: '既読記事を表示する', en: 'Show read articles' },

  // FeedErrorBanner - pipeline stages
  'feedError.stage.discovery': { ja: 'RSS検出', en: 'RSS Discovery' },
  'feedError.stage.bridge': { ja: 'Bridge変換', en: 'Bridge' },
  'feedError.stage.fetch': { ja: '記事取得', en: 'Fetch' },
  'feedError.stage.parse': { ja: '解析', en: 'Parse' },

  // FeedErrorBanner - error explanations
  'feedError.noRssUrl': {
    ja: 'このサイトからRSSフィードのURLを検出できませんでした。サイトがRSSを提供していない可能性があります。「RSSを再検出」でRSS Bridge経由の取得を試みることができます。',
    en: 'Could not detect an RSS feed URL from this site. The site may not provide RSS. Try "Re-detect RSS" to attempt fetching via RSS Bridge.',
  },
  'feedError.flareSolverrFailed': {
    ja: 'このサイトはBot検出（Cloudflare等）で保護されており、突破に失敗しました。しばらく時間をおいてから「再取得」を試してください。',
    en: 'This site is protected by bot detection (e.g. Cloudflare) and bypass failed. Wait a moment and try "Retry Fetch".',
  },
  'feedError.httpError': {
    ja: 'サーバーからHTTPエラー（{{code}}）が返されました。サイトが一時的にダウンしているか、URLが変更された可能性があります。',
    en: 'The server returned HTTP error ({{code}}). The site may be temporarily down or the URL may have changed.',
  },
  'feedError.parseFailed': {
    ja: 'フィードのXMLを解析できませんでした。フィードの形式が壊れているか、RSS/Atom形式でない可能性があります。「RSSを再検出」で別のフィードソースを探すことができます。',
    en: 'Could not parse the feed XML. The feed format may be broken or not RSS/Atom. Try "Re-detect RSS" to find an alternative feed source.',
  },
  'feedError.cssBridgeFailed': {
    ja: 'CSSセレクタによるスクレイピングで記事を抽出できませんでした。サイトの構造が変わった可能性があります。「RSSを再検出」でセレクタを再推論できます。',
    en: 'Failed to extract articles via CSS selector scraping. The site structure may have changed. Try "Re-detect RSS" to re-infer the selector.',
  },
  'feedError.unknown': {
    ja: 'フィードの取得中に予期しないエラーが発生しました。しばらく待ってから「再取得」を試してください。',
    en: 'An unexpected error occurred while fetching the feed. Wait a moment and try "Retry Fetch".',
  },

  // FeedErrorBanner - actions & states
  'feedError.reDetect': { ja: 'RSSを再検出', en: 'Re-detect RSS' },
  'feedError.retry': { ja: '再取得', en: 'Retry Fetch' },
  'feedError.processing': { ja: '記事を取得しています…', en: 'Fetching articles…' },

  // Hint banners
  'hint.today': { ja: 'あなたの行動をもとにスコアリングされたおすすめ記事。AIに「今日何読む？」と聞くこともできます。', en: 'Articles scored by your engagement. You can also ask the AI "What should I read today?"' },
  'hint.inbox': { ja: '未読記事だけが集まるOksskoltenの玄関口。既読にするとInboxには表示されなくなります。', en: 'The front door of Oksskolten, where only unread articles live. Once marked as read, they won\'t appear in Inbox anymore.' },
  'hint.bookmarks': { ja: '気になる記事を一旦キープ。あとで読みたいときに使えます。', en: 'Keep articles for later. A quick way to save something you want to come back to.' },
  'hint.likes': { ja: 'いいねした記事がここに。検索やレコメンドのスコアリングにも反映されます。', en: 'Articles you\'ve liked live here. Likes also boost search and recommendation scoring.' },
  'hint.clips': { ja: 'フィードを追跡するほどじゃない相手の記事を、URL指定で個別に保存できます。', en: 'Save individual articles by URL — perfect for sources you don\'t need a full feed for.' },
  'hint.history': { ja: '記事を開いて読んだ履歴。「スクロールで自動既読」で流れたものは含まず、実際に開いた記事だけが残ります。', en: 'Articles you actually opened and read. Items swept away by "Auto-Mark As Read On Scroll" aren\'t included — only articles you tapped into.' },
  'articles.showOlder': { ja: 'もっと読む（${count}件）', en: 'Show older articles (${count})' },
  'articles.allCaughtUp': { ja: '全部読んだよ！', en: "You're all caught up!" },

  // ArticleDetail
  'article.noContent': { ja: 'コンテンツがありません', en: 'No content available' },
  'article.jaTranslation': { ja: '日本語訳', en: 'Japanese' },
  'article.original': { ja: '原文', en: 'Original' },
  'article.sourceArticle': { ja: '元記事', en: 'Source Article' },
  'article.summarize': { ja: '要約', en: 'Summarize' },
  'article.askQuestion': { ja: '質問', en: 'Ask' },
  'article.readMore': { ja: '続きを読む', en: 'Read more' },
  'article.showLess': { ja: '閉じる', en: 'Show less' },
  'article.translate': { ja: '翻訳', en: 'Translate' },
  'article.claudeCodeUsage': { ja: 'Claude Code の利用枠を消費', en: 'Consumed Claude Code usage' },
  'article.freeTier': { ja: '無料枠', en: 'Free tier' },
  'article.notFound': { ja: '記事が見つかりませんでした', en: 'Article not found' },
  'article.rawMarkdown': { ja: 'マークダウン表示', en: 'Raw Markdown' },
  'article.similarAlreadyRead': { ja: 'この記事は ${feedNames} にもあり、既に読んでいます', en: 'You already read this story from ${feedNames}' },
  'article.similarCoveredBy': { ja: 'この記事は ${feedNames} にもあります', en: 'This story was also covered by ${feedNames}' },
  'article.similarShowSources': { ja: '${count} 件の類似記事を表示', en: 'Show ${count} similar sources' },
  'article.archiveImages': { ja: '画像を保存', en: 'Save Images' },
  'article.imagesArchived': { ja: '画像保存済み', en: 'Images Saved' },
  'article.archivingImages': { ja: '画像を保存中...', en: 'Saving images...' },
  'article.viewingTranslation': { ja: '日本語訳で表示中', en: 'Viewing translation' },
  'article.viewingOriginal': { ja: '原文を表示中', en: 'Viewing original' },
  'article.switchToOriginal': { ja: '原文に切替 →', en: 'Switch to original →' },
  'article.switchToTranslation': { ja: '日本語訳に切替 →', en: 'Switch to translation →' },
  'article.addBookmark': { ja: '後で読む', en: 'Read later' },
  'article.removeBookmark': { ja: '後で読むを解除', en: 'Remove from read later' },
  'article.addLike': { ja: 'いいね', en: 'Like' },
  'article.removeLike': { ja: 'いいねを解除', en: 'Unlike' },
  'article.delete': { ja: '削除', en: 'Delete' },
  'article.deleteConfirm': { ja: 'この記事を削除しますか？', en: 'Delete this article?' },

  // AddModal (unified)
  'modal.addNew': { ja: 'はじめる', en: 'Get Started' },
  'modal.addFeedOption': { ja: 'フィード', en: 'Feed' },
  'modal.addFeedDesc': { ja: 'URLからRSSフィードを追加', en: 'Add an RSS feed from a URL' },
  'modal.clipArticleOption': { ja: 'クリップ', en: 'Clip' },
  'modal.clipArticleDesc': { ja: 'URLから記事を取得してクリップ', en: 'Clip an article from a URL' },
  'modal.addFolderOption': { ja: 'フォルダ', en: 'Folder' },
  'modal.addFolderDesc': { ja: 'フィードを整理するフォルダを作成', en: 'Create a folder to organize feeds' },
  'modal.addFolder': { ja: 'フォルダを追加', en: 'Add Folder' },
  'modal.folderNamePlaceholder': { ja: 'フォルダ名', en: 'Folder name' },
  'modal.create': { ja: '作成', en: 'Create' },
  'modal.creating': { ja: '作成中...', en: 'Creating...' },

  // FeedModal
  'modal.addFeed': { ja: 'フィードを追加', en: 'Add Feed' },
  'modal.url': { ja: 'URL', en: 'URL' },
  'modal.discovering': { ja: '取得中...', en: 'Fetching...' },
  'modal.namePlaceholder': { ja: '名前（自動取得）', en: 'Name (auto-detected)' },
  'modal.cancel': { ja: 'キャンセル', en: 'Cancel' },
  'modal.adding': { ja: '追加中...', en: 'Adding...' },
  'modal.add': { ja: '追加', en: 'Add' },
  'modal.errorRssNotDetected': { ja: 'このURLからRSSフィードを検出できませんでした', en: 'RSS could not be detected for this URL' },
  'modal.errorAlreadyExists': { ja: 'このフィードは既に登録されています', en: 'This feed already exists' },
  'modal.errorHttpOrHttpsOnly': { ja: 'http:// または https:// で始まるURLのみ対応しています', en: 'Only http:// or https:// URLs are allowed' },
  'modal.genericError': { ja: 'エラーが発生しました', en: 'An error occurred' },
  'modal.step.rssDiscovery': { ja: 'RSS 検出', en: 'RSS discovery' },
  'modal.step.flaresolverr': { ja: 'JSレンダリング', en: 'JS rendering' },
  'modal.step.rssBridge': { ja: 'RSS Bridge', en: 'RSS Bridge' },
  'modal.step.cssSelector': { ja: 'CSS Selector（LLM）', en: 'CSS Selector (LLM)' },
  'modal.step.done': { ja: 'フィード作成完了', en: 'Feed created' },
  'modal.step.completed': { ja: '完了', en: 'Completed' },
  'modal.step.found': { ja: '検出', en: 'Found' },
  'modal.step.notFound': { ja: 'この段階では未検出', en: 'Not detected at this step' },
  'modal.step.skipped': { ja: 'スキップ', en: 'Skipped' },
  'modal.choiceTitle': { ja: 'サイト全体のRSSフィードが見つかりました', en: 'Found a site-wide RSS feed' },
  'modal.choiceWholeSite': { ja: 'サイト全体を購読', en: 'Subscribe to the whole site' },
  'modal.choiceThisPage': { ja: 'このページだけを購読', en: 'Subscribe to this page only' },
  'modal.errorPageExtract': { ja: 'このページからコンテンツを抽出できませんでした', en: 'Could not extract content from this page' },

  // Settings
  'feeds.dateFormat': { ja: '日付表示', en: 'Date' },
  'feeds.dateRelative': { ja: '相対', en: 'Relative' },
  'feeds.dateAbsolute': { ja: '絶対', en: 'Absolute' },
  'date.justNow': { ja: 'たった今', en: 'just now' },

  // Sidebar menu
  'sidebar.settings': { ja: '設定', en: 'Settings' },

  // Settings page
  'settings.title': { ja: '設定', en: 'Settings' },
  'settings.general': { ja: '一般', en: 'General' },
  'settings.appearance': { ja: '外観', en: 'Appearance' },
  'settings.colorMode': { ja: 'カラーモード', en: 'Color mode' },
  'settings.colorModeDesc': { ja: 'アプリ全体の明暗を切り替えます。「自動」はOSの設定に連動します', en: 'Switch between light and dark appearance. "Auto" follows your OS setting' },
  'settings.colorModeLight': { ja: 'ライト', en: 'Light' },
  'settings.colorModeDark': { ja: 'ダーク', en: 'Dark' },
  'settings.colorModeAuto': { ja: '自動', en: 'Auto' },
  'settings.colorTheme': { ja: '配色テーマ', en: 'Color Theme' },
  'settings.themeDesc': { ja: 'サイドバー・背景・アクセントカラーなどアプリ全体の配色が変わります', en: 'Changes sidebar, background, and accent colors across the entire app' },
  'settings.dateFormat': { ja: '日付表示', en: 'Date format' },
  'settings.dateFormatDesc': { ja: '相対または絶対表示', en: 'Relative or absolute display' },
  'settings.plugins': { ja: 'プラグイン', en: 'Plugins' },
  'settings.viewer': { ja: 'フィード管理', en: 'Feeds' },
  'settings.underDevelopment': { ja: 'この機能は現在開発中です', en: 'This feature is currently under development' },
  'settings.profile': { ja: 'プロフィール', en: 'Profile' },
  'settings.accountName': { ja: 'アカウント名', en: 'Account name' },
  'settings.accountNameHint': { ja: 'このRSSリーダーアプリはあなた専用です。アカウント名はどこにも公開されないので、愛着の湧く好きな名前をつけてあげてください。', en: "This RSS reader app is just for you. Your account name won't be shown anywhere, so pick whatever feels right." },
  'settings.cancel': { ja: 'キャンセル', en: 'Cancel' },
  'settings.save': { ja: '変更を保存', en: 'Save changes' },
  'settings.saving': { ja: '保存中...', en: 'Saving...' },
  'settings.saved': { ja: '保存しました', en: 'Saved' },

  // Reading
  'settings.imageStorage': { ja: '画像保存', en: 'Image Storage' },
  'imageStorage.title': { ja: '画像ストレージ設定', en: 'Image Storage Settings' },
  'imageStorage.desc': { ja: '記事内の画像をローカルに保存して永続化します', en: 'Save article images locally for permanent access' },
  'imageStorage.enabled': { ja: '画像保存を有効化', en: 'Enable image archiving' },
  'imageStorage.enabledDesc': { ja: '有効にすると、記事ごとに画像保存ボタンが表示されます', en: 'When enabled, a save images button appears on each article' },
  'imageStorage.storagePath': { ja: '保存先パス', en: 'Storage path' },
  'imageStorage.storagePathDesc': { ja: 'サーバー上の画像保存ディレクトリ（空欄はデフォルト）', en: 'Image storage directory on server (empty for default)' },
  'imageStorage.maxSize': { ja: '最大サイズ (MB)', en: 'Max size (MB)' },
  'imageStorage.maxSizeDesc': { ja: '1画像あたりの最大サイズ', en: 'Maximum size per image' },
  'imageStorage.mode': { ja: 'ストレージモード', en: 'Storage mode' },
  'imageStorage.modeLocal': { ja: 'ローカル', en: 'Local' },
  'imageStorage.modeLocalDesc': { ja: 'サーバーのディスクに画像を保存します', en: 'Save images to the server\'s local disk' },
  'imageStorage.modeRemote': { ja: 'リモート', en: 'Remote' },
  'imageStorage.modeRemoteDesc': { ja: '外部サービス（Imgur、Cloudflare Images 等）のAPIを通じて画像をアップロードし、記事内の画像URLをホスティング先に差し替えます。S3 / GCS は署名付きURLのプロキシが必要です', en: 'Upload images to external services like Imgur or Cloudflare Images via their API, replacing article image URLs with the hosted ones. S3 / GCS requires a signed-URL proxy' },
  'imageStorage.url': { ja: 'アップロード先URL', en: 'Upload URL' },
  'imageStorage.urlPlaceholder': { ja: 'https://api.example.com/upload', en: 'https://api.example.com/upload' },
  'imageStorage.headers': { ja: 'リクエストヘッダー (JSON)', en: 'Request Headers (JSON)' },
  'imageStorage.headersPlaceholder': { ja: '{"Authorization": "Bearer xxx"}', en: '{"Authorization": "Bearer xxx"}' },
  'imageStorage.headersConfigured': { ja: '設定済み', en: 'Configured' },
  'imageStorage.headersClear': { ja: 'ヘッダーを削除', en: 'Clear headers' },
  'imageStorage.fieldName': { ja: 'フィールド名', en: 'Field name' },
  'imageStorage.fieldNamePlaceholder': { ja: 'image', en: 'image' },
  'imageStorage.respPath': { ja: 'レスポンスURLパス', en: 'Response URL path' },
  'imageStorage.respPathPlaceholder': { ja: 'data.link', en: 'data.link' },
  'imageStorage.saved': { ja: '設定を保存しました', en: 'Settings saved' },
  'imageStorage.test': { ja: 'テストアップロード', en: 'Test Upload' },
  'imageStorage.testing': { ja: 'テスト中...', en: 'Testing...' },
  'imageStorage.testSuccess': { ja: 'テスト成功', en: 'Test succeeded' },
  'imageStorage.testFailed': { ja: 'テスト失敗', en: 'Test failed' },
  'imageStorage.healthcheckUrl': { ja: 'ヘルスチェックURL', en: 'Healthcheck URL' },
  'imageStorage.healthcheckUrlPlaceholder': { ja: 'https://api.example.com/health', en: 'https://api.example.com/health' },
  'imageStorage.healthcheckUrlDesc': { ja: '任意。設定するとリモートサービスの死活監視ができます', en: 'Optional. Configure to monitor remote service availability' },
  'imageStorage.healthcheck': { ja: 'ヘルスチェック', en: 'Healthcheck' },
  'imageStorage.healthchecking': { ja: 'チェック中...', en: 'Checking...' },
  'imageStorage.healthcheckOk': { ja: '正常', en: 'Healthy' },
  'imageStorage.healthcheckFailed': { ja: '応答なし', en: 'Unreachable' },

  'settings.reading': { ja: '閲覧', en: 'Reading' },
  'settings.autoMarkRead': { ja: 'スクロールで自動既読', en: 'Auto-Mark As Read On Scroll' },
  'settings.autoMarkReadDesc': {
    ja: 'スクロールして画面外に出た記事を自動的に既読にしますか？',
    en: 'Should articles be automatically marked as read when you scroll past them?',
  },
  'settings.autoMarkReadOn': { ja: 'オン', en: 'On' },
  'settings.autoMarkReadOff': { ja: 'オフ', en: 'Off' },
  'settings.unreadIndicator': { ja: '未読インジケーター', en: 'Unread Indicator' },
  'settings.unreadIndicatorDescDot': {
    ja: '記事リストに未読マーク（ドット）を表示しますか？',
    en: 'Show unread dot marks on the article list?',
  },
  'settings.unreadIndicatorDescLine': {
    ja: '記事リストに未読マーク（ライン）を表示しますか？',
    en: 'Show unread line marks on the article list?',
  },
  'settings.unreadIndicatorOn': { ja: 'オン', en: 'On' },
  'settings.unreadIndicatorOff': { ja: 'オフ', en: 'Off' },
  'settings.showThumbnails': { ja: 'サムネイル', en: 'Thumbnails' },
  'settings.showThumbnailsDesc': { ja: '記事一覧にサムネイル画像を表示しますか？', en: 'Show thumbnail images in the article list?' },
  'settings.showThumbnailsOn': { ja: 'オン', en: 'On' },
  'settings.showThumbnailsOff': { ja: 'オフ', en: 'Off' },
  'settings.showFeedActivity': { ja: 'フィードの更新状況', en: 'Feed Activity' },
  'settings.showFeedActivityDesc': { ja: 'サイドバーにフィードの更新頻度やステータスを表示します', en: 'Show feed update frequency and status in the sidebar' },
  'settings.showFeedActivityOn': { ja: '表示する', en: 'Show' },
  'settings.showFeedActivityOff': { ja: '表示しない', en: 'Hide' },
  'settings.chatPosition': { ja: 'チャットボタンの位置', en: 'Chat Button Position' },
  'settings.chatPositionDesc': { ja: '記事ページでのチャットボタンの表示位置を選択します', en: 'Choose where the chat button appears on article pages' },
  'settings.chatPositionFab': { ja: 'フローティング', en: 'Floating' },
  'settings.chatPositionInline': { ja: 'アクションバー内', en: 'In action bar' },
  'settings.articleOpenMode': { ja: '記事の開き方', en: 'Article Open Mode' },
  'settings.articleOpenModeDesc': { ja: '記事をクリックしたときの表示方法を選択します', en: 'Choose how articles are displayed when clicked' },
  'settings.articleOpenModePage': { ja: 'ページ遷移', en: 'Full page' },
  'settings.articleOpenModeOverlay': { ja: 'オーバーレイ', en: 'Overlay' },
  'settings.keyboardNavigation': { ja: 'キーボードナビゲーション', en: 'Keyboard Navigation' },
  'settings.keyboardNavigationDesc': { ja: 'j/k キーで記事リストを移動し、b でブックマーク、; で元記事を開きます', en: 'Navigate the article list with j/k, bookmark with b, and open the original article with ;' },
  'settings.keyboardNavigationOn': { ja: '有効', en: 'On' },
  'settings.keyboardNavigationOff': { ja: '無効', en: 'Off' },
  'settings.keybindings': { ja: 'キーバインド設定', en: 'Key Bindings' },
  'settings.keybindingsDesc': { ja: '各アクションに割り当てるキーを変更できます', en: 'Customize the key assigned to each action' },
  'settings.keybindingsNext': { ja: '次の記事', en: 'Next article' },
  'settings.keybindingsPrev': { ja: '前の記事', en: 'Previous article' },
  'settings.keybindingsBookmark': { ja: 'ブックマーク', en: 'Bookmark' },
  'settings.keybindingsOpenExternal': { ja: '元記事を開く', en: 'Open original' },
  'settings.keybindingsDuplicate': { ja: '同じキーが複数のアクションに割り当てられています', en: 'Duplicate key assignment detected' },
  'feeds.inactive': { ja: 'inactive', en: 'inactive' },
  'metrics.articles': { ja: '記事', en: 'articles' },
  'metrics.perWeek': { ja: '/週', en: '/wk' },
  'metrics.lastUpdated': { ja: '最終更新', en: 'last' },
  'metrics.inactive': { ja: '更新停止', en: 'inactive' },
  'metrics.chars': { ja: '文字', en: 'chars' },
  'metrics.preview': { ja: '12記事 · 2.1/週 · 3日前', en: '12 articles · 2.1/wk · 3d ago' },
  'settings.internalLinks': { ja: '内部リンク書き換え', en: 'Internal Link Rewriting' },
  'settings.internalLinksDesc': {
    ja: `記事内のリンク先が ${APP_NAME} に存在する場合、${APP_NAME} 内リンクに書き換えます`,
    en: `Rewrite links in articles to ${APP_NAME} internal URLs when the linked article exists in your ${APP_NAME}`,
  },
  'settings.internalLinksOn': { ja: 'オン', en: 'On' },
  'settings.internalLinksOff': { ja: 'オフ', en: 'Off' },
  'settings.categoryUnreadOnly': { ja: 'カテゴリで未読のみ表示', en: 'Show Only Unread In Categories' },
  'settings.categoryUnreadOnlyDesc': {
    ja: 'カテゴリビューで未読記事のみを表示します（Inboxと同様の動作）',
    en: 'Show only unread articles in category views (same behavior as Inbox)',
  },
  'settings.categoryUnreadOnlyOn': { ja: 'オン', en: 'On' },
  'settings.categoryUnreadOnlyOff': { ja: 'オフ', en: 'Off' },

  // Language
  'settings.language': { ja: '言語', en: 'Language' },
  'settings.languageDesc': { ja: 'UIの表示言語', en: 'Display language for UI' },
  'settings.languageJa': { ja: '日本語', en: 'Japanese' },
  'settings.languageEn': { ja: '英語', en: 'English' },

  // Translation target language
  'settings.translateTargetLang': { ja: '翻訳先言語', en: 'Translation language' },
  'settings.translateTargetLangDesc': { ja: '記事をどの言語に翻訳するか', en: 'Language to translate articles into' },
  'settings.translateTargetLangAuto': { ja: 'UI言語と同じ', en: 'Same as UI language' },

  // Data (OPML)
  'settings.data': { ja: 'データ', en: 'Data' },
  'settings.importExport': { ja: 'フィード移行', en: 'Feed Migration' },
  'settings.importOpml': { ja: 'OPML インポート', en: 'Import OPML' },
  'settings.importOpmlDesc': { ja: '他の RSS リーダーからフィードをインポート', en: 'Import feeds from another RSS reader' },
  'settings.exportOpml': { ja: 'OPML エクスポート', en: 'Export OPML' },
  'settings.exportOpmlDesc': { ja: 'フィード一覧を OPML ファイルとしてダウンロード', en: 'Download your feeds as an OPML file' },
  'settings.importing': { ja: 'インポート中...', en: 'Importing...' },
  'settings.previewing': { ja: 'プレビュー中...', en: 'Loading preview...' },
  'settings.feedsSelected': { ja: '{selected} / {total} フィードを選択中（{duplicates} 件は登録済み）', en: '{selected} of {total} feeds selected ({duplicates} already subscribed)' },
  'settings.selectAll': { ja: 'すべて選択', en: 'Select All' },
  'settings.deselectAll': { ja: 'すべて解除', en: 'Deselect All' },
  'settings.alreadySubscribed': { ja: '登録済み', en: 'Already subscribed' },
  'settings.importSelected': { ja: '{count} フィードをインポート', en: 'Import {count} feeds' },
  'settings.dbBackup': { ja: 'データベースバックアップ', en: 'Database Backup' },
  'settings.dbBackupDesc': { ja: 'SQLite データベースファイルのダウンロード・リストア', en: 'Download or restore the SQLite database file' },
  'settings.articlePurge': { ja: '記事の自動クリーンアップ', en: 'Article Cleanup' },
  'settings.articlePurgeDesc': { ja: '古い記事を定期的に削除してストレージを節約', en: 'Periodically delete old articles to save storage' },
  'settings.comingSoon': { ja: '実装予定', en: 'Coming soon' },
  'settings.retentionEnabled': { ja: '自動クリーンアップ', en: 'Auto cleanup' },
  'settings.retentionReadDays': { ja: '既読記事の保持日数', en: 'Keep read articles for' },
  'settings.retentionReadDaysDesc': { ja: '既読から指定日数経過した記事を削除', en: 'Delete articles after this many days since read' },
  'settings.retentionUnreadDays': { ja: '未読記事の保持日数', en: 'Keep unread articles for' },
  'settings.retentionUnreadDaysDesc': { ja: '取得から指定日数経過した未読記事を削除', en: 'Delete unread articles after this many days since fetched' },
  'settings.retentionDays': { ja: '日', en: 'days' },
  'settings.retentionProtectedNote': { ja: 'ブックマーク・いいね済みの記事は削除されません', en: 'Bookmarked and liked articles are never deleted' },
  'settings.retentionPurgeNow': { ja: '今すぐクリーンアップ', en: 'Clean up now' },
  'settings.retentionPurgeConfirm': { ja: '{count} 件の記事を削除します。この操作は元に戻せません。よろしいですか？', en: 'This will delete {count} articles. This cannot be undone. Continue?' },
  'settings.retentionPurgeResult': { ja: '{count} 件の記事を削除しました', en: 'Deleted {count} articles' },
  'settings.retentionEligible': { ja: '既読: {read} 件 ／ 未読: {unread} 件が対象', en: '{read} read / {unread} unread articles eligible' },
  'settings.retentionPurging': { ja: 'クリーンアップ中...', en: 'Cleaning up...' },

  // Categories
  'category.add': { ja: 'カテゴリを追加', en: 'Add category' },
  'category.namePlaceholder': { ja: 'カテゴリ名', en: 'Category name' },
  'category.rename': { ja: '名前を変更', en: 'Rename' },
  'category.delete': { ja: 'カテゴリを削除', en: 'Delete category' },
  'category.deleteConfirm': {
    ja: '${name} を削除しますか？配下のフィードはトップに移動します。',
    en: 'Delete ${name}? Feeds will be moved to top.',
  },
  'category.markAllRead': { ja: 'すべて既読にする', en: 'Mark all as read' },
  'category.moveToCategory': { ja: 'カテゴリに移動', en: 'Move to category' },
  'category.uncategorized': { ja: 'トップ', en: 'Top' },

  // Multi-select
  'feeds.selectedCount': { ja: '${count} 件選択中', en: '${count} feeds selected' },
  'feeds.bulkMarkAllRead': { ja: 'すべて既読にする', en: 'Mark all as read' },
  'feeds.bulkMoveToCategory': { ja: 'カテゴリに移動', en: 'Move to category' },
  'feeds.bulkFetch': { ja: 'フェッチ', en: 'Fetch articles' },
  'feeds.bulkDelete': { ja: '${count} 件削除', en: 'Delete ${count} feeds' },
  'feeds.bulkDeleteConfirm': {
    ja: '${count} 件のフィードを削除しますか？紐づく記事もすべて削除されます。',
    en: 'Delete ${count} feeds? All associated articles will also be deleted.',
  },

  // Highlight theme
  'settings.highlightTheme': { ja: 'コードハイライト', en: 'Code Highlighting' },
  'settings.highlightThemeDesc': { ja: '記事内のコードブロックに適用される配色です。「自動」は配色テーマに合わせて切り替わります', en: 'Applied to code blocks in articles. "Auto" switches based on the color theme' },
  'settings.highlightThemeAuto': { ja: '自動（テーマ連動）', en: 'Auto (follows theme)' },
  'settings.highlightThemeNone': { ja: 'なし', en: 'None' },

  // Custom themes
  'settings.customThemes': { ja: 'カスタムテーマ', en: 'Custom Themes' },
  'settings.customThemesDesc': { ja: 'JSON ファイルまたはテキストからテーマをインポートできます', en: 'Import themes from a JSON file or text' },
  'settings.importTheme': { ja: 'テーマをインポート', en: 'Import Theme' },
  'settings.importFromFile': { ja: 'ファイルを選択', en: 'Choose File' },
  'settings.importFromText': { ja: 'JSON を貼り付け', en: 'Paste JSON' },
  'settings.importButton': { ja: 'インポート', en: 'Import' },
  'settings.deleteTheme': { ja: 'テーマを削除', en: 'Delete theme' },
  'settings.deleteThemeConfirm': { ja: 'このカスタムテーマを削除しますか？', en: 'Delete this custom theme?' },
  'settings.themeImported': { ja: 'テーマをインポートしました', en: 'Theme imported successfully' },
  'settings.themeDeleted': { ja: 'テーマを削除しました', en: 'Theme deleted' },
  'settings.themeUpdated': { ja: 'テーマを更新しました', en: 'Theme updated successfully' },
  'settings.editTheme': { ja: 'テーマを編集', en: 'Edit theme' },
  'settings.updateButton': { ja: '更新', en: 'Update' },
  'settings.sampleButton': { ja: 'サンプル', en: 'Sample' },
  'settings.themeLimit': { ja: 'カスタムテーマは最大20個までです', en: 'Maximum 20 custom themes allowed' },

  // Theme JSON validation errors
  'themeJson.invalidJson': { ja: '無効なJSON: オブジェクトが必要です', en: 'Invalid JSON: expected an object' },
  'themeJson.missingName': { ja: '必須フィールド "name" がありません', en: 'Missing required field: "name"' },
  'themeJson.invalidName': { ja: '"name" は小文字英数字・ハイフン・アンダースコアのみ使用可能です（入力値: "${name}"）', en: '"name" must be lowercase alphanumeric, hyphens, or underscores (got "${name}")' },
  'themeJson.builtinConflict': { ja: '"${name}" はビルトインテーマ名と競合しています', en: '"${name}" conflicts with a built-in theme name' },
  'themeJson.duplicateName': { ja: '"${name}" という名前のカスタムテーマは既に存在します', en: 'A custom theme named "${name}" already exists' },
  'themeJson.missingLabel': { ja: '必須フィールド "label" がありません', en: 'Missing required field: "label"' },
  'themeJson.missingColors': { ja: '必須フィールド "colors" がありません', en: 'Missing required field: "colors"' },
  'themeJson.missingColorsVariant': { ja: '"colors.${variant}" は必須です', en: '"colors.${variant}" is required' },
  'themeJson.missingColor': { ja: '必須カラー "${path}" がありません', en: 'Missing required color "${path}"' },

  // Mascot
  'settings.mascot': { ja: 'マスコット', en: 'Mascot' },
  'settings.mascotDesc': { ja: '記事を全て読み終えたときに表示されるピクセルアートのマスコットです', en: 'Pixel art mascot shown when all articles are read' },
  'settings.mascotOff': { ja: 'オフ', en: 'Off' },
  'settings.mascotDreamPuff': { ja: 'Dream Puff', en: 'Dream Puff' },
  'settings.mascotSleepyGiant': { ja: 'Sleepy Giant', en: 'Sleepy Giant' },
  'settings.mascotRequiresAutoMark': { ja: '「スクロールで自動既読」がオンのときのみ設定できます', en: 'Requires "Auto-Mark As Read On Scroll" to be enabled' },

  // Article font
  'settings.articleFont': { ja: '記事フォント', en: 'Article Font' },
  'settings.articleFontDesc': { ja: '記事一覧のタイトル・抜粋と記事本文に適用されます。Google Fontsから読み込むため初回表示が少し遅れる場合があります', en: 'Applied to article list titles, excerpts, and article body. Loaded from Google Fonts, so the first render may be slightly delayed' },
  'settings.layout': { ja: 'レイアウト', en: 'Layout' },
  'settings.layoutDesc': { ja: '記事一覧の並べ方を変更します。リスト・カード・マガジン・コンパクトから選べます', en: 'Change how articles are displayed. Choose from list, card, magazine, or compact views' },
  'settings.layoutList': { ja: 'リスト', en: 'List' },
  'settings.layoutCard': { ja: 'カード', en: 'Card' },
  'settings.layoutMagazine': { ja: 'マガジン', en: 'Magazine' },
  'settings.layoutCompact': { ja: 'コンパクト', en: 'Compact' },

  // ConfirmDialog
  'confirm.cancel': { ja: 'キャンセル', en: 'Cancel' },

  // Setup
  'setup.title': { ja: '初期設定', en: 'Initial Setup' },
  'setup.subtitle': { ja: 'アカウントを作成して始めましょう', en: 'Create your account to get started' },
  'setup.confirmPassword': { ja: 'パスワード（確認）', en: 'Confirm password' },
  'setup.submit': { ja: 'アカウントを作成', en: 'Create Account' },
  'setup.creating': { ja: '作成中...', en: 'Creating...' },
  'setup.passwordTooShort': { ja: 'パスワードは8文字以上にしてください', en: 'Password must be at least 8 characters' },
  'setup.passwordMismatch': { ja: 'パスワードが一致しません', en: 'Passwords do not match' },
  'setup.failed': { ja: 'アカウントの作成に失敗しました', en: 'Failed to create account' },
  'setup.networkError': { ja: 'ネットワークエラー', en: 'Network error' },

  // Login
  'login.title': { ja: 'ログイン', en: 'Sign in' },
  'login.subtitle': { ja: 'メールアドレスでログイン', en: 'Sign in with your email' },
  'login.email': { ja: 'メールアドレス', en: 'Email' },
  'login.password': { ja: 'パスワード', en: 'Password' },
  'login.submit': { ja: 'ログイン', en: 'Sign in' },
  'login.loading': { ja: 'ログイン中...', en: 'Signing in...' },
  'login.failed': { ja: 'ログインに失敗しました', en: 'Login failed' },
  'login.networkError': { ja: 'ネットワークエラー', en: 'Network error' },

  // Login — passkey
  'login.passkey': { ja: 'パスキーでログイン', en: 'Sign in with passkey' },
  'login.or': { ja: 'または', en: 'or' },
  'login.passkeyError': { ja: 'パスキー認証に失敗しました', en: 'Passkey authentication failed' },
  'login.github': { ja: 'GitHubでログイン', en: 'Sign in with GitHub' },
  'login.githubError': { ja: 'GitHub認証に失敗しました', en: 'GitHub authentication failed' },

  // Settings — AI
  'settings.integration': { ja: 'AI・翻訳', en: 'AI & Translation' },
  'integration.providerConfig': { ja: 'プロバイダー設定', en: 'Provider Configuration' },
  'integration.providerConfigDesc': { ja: 'APIキーや認証情報を管理します', en: 'Manage API keys and authentication' },
  'integration.llmProviderConfig': { ja: 'LLM プロバイダー', en: 'LLM Providers' },
  'integration.llmProviderConfigDesc': { ja: 'チャット・記事の要約・記事の翻訳に使用します。1つ以上の API キーが設定されていないとこれらの機能は利用できません', en: 'Used for chat, article summarization, and article translation. At least one API key must be configured to use these features' },
  'integration.translateServiceConfig': { ja: '翻訳サービス', en: 'Translation Services' },
  'integration.translateServiceConfigDesc': { ja: '記事の翻訳に使用します。LLM プロバイダーまたはこちらのいずれかが設定されていないと翻訳は利用できません', en: 'Used for article translation. Either an LLM provider or one of these services must be configured to use translation' },
  'integration.taskSettings': { ja: '機能ごとのプロバイダー', en: 'Provider per Feature' },
  'integration.taskSettingsDesc': { ja: '要約・翻訳・チャットそれぞれでどのプロバイダーとモデルを使うかを設定します', en: 'Choose which provider and model to use for summarization, translation, and chat' },
  'integration.taskSettingsNoKeys': { ja: 'API キーが設定されていないため変更できません。上のセクションで API キーを設定してください', en: 'Cannot change settings because no API keys are configured. Please set up an API key in the section above' },
  'integration.selectProviderFirst': { ja: 'プロバイダーを選択してください', en: 'Select a provider first' },
  'integration.selectModel': { ja: 'モデルを選択', en: 'Select a model' },
  'integration.task.chat': { ja: 'チャット', en: 'Chat' },
  'integration.task.summary': { ja: '要約', en: 'Summary' },
  'integration.task.translate': { ja: '翻訳', en: 'Translation' },
  'integration.modeLLM': { ja: 'LLM', en: 'LLM' },
  'integration.modeTranslateService': { ja: '翻訳サービス', en: 'Translation Service' },
  'integration.googleTranslateNote': {
    ja: 'Google Cloud Translation API v2 (Basic) を使用します。NMT（ニューラル機械翻訳）による高速な翻訳で、LLMより低品質ですが即座に結果が返ります。v3 (Advanced) の LLM 翻訳には未対応です。',
    en: 'Uses Google Cloud Translation API v2 (Basic). NMT-based fast translation — lower quality than LLM but returns results instantly. v3 (Advanced) LLM translation is not supported.',
  },
  'integration.googleTranslateFreeTier': {
    ja: '料金: 月50万文字まで無料、以降 $20 / 100万文字',
    en: 'Pricing: Free up to 500K chars/month, then $20 / 1M chars',
  },
  'integration.googleTranslateUsage': {
    ja: '今月の使用量: ${used} / ${limit}',
    en: 'This month: ${used} / ${limit}',
  },
  'integration.deeplNote': {
    ja: 'DeepL API v2 を使用します。高品質なニューラル機械翻訳で、特に日欧言語間の翻訳精度が高く評価されています。Free プランと Pro プランに対応しています。',
    en: 'Uses DeepL API v2. High-quality neural machine translation, especially well-regarded for European-Japanese translation accuracy. Supports both Free and Pro plans.',
  },
  'integration.deeplFreeTier': {
    ja: '料金: API Free は月50万文字まで無料、API Pro は月額¥630 + ¥2,500 / 100万文字',
    en: 'Pricing: API Free up to 500K chars/month, API Pro ¥630/mo + ¥2,500 / 1M chars',
  },
  'integration.deeplUsage': {
    ja: '今月の使用量: ${used} / ${limit}',
    en: 'This month: ${used} / ${limit}',
  },

  // Settings — security
  'settings.security': { ja: 'セキュリティ', en: 'Security' },
  'settings.edit': { ja: '変更', en: 'Edit' },
  'settings.accountCredentials': { ja: 'アカウント情報', en: 'Account credentials' },
  'settings.password': { ja: 'パスワード', en: 'Password' },
  'settings.passwordAuth': { ja: 'パスワード認証', en: 'Password authentication' },
  'settings.passwordAuthDesc': { ja: 'パスワードによるログインを許可', en: 'Allow login with password' },
  'settings.passwordAuthHint': { ja: 'メールアドレスはログイン用のIDとして使っているだけで、メール送信などには一切使われません。パスキーやGitHub連携を設定済みなら、パスワード認証はオフにしておくのがおすすめです。', en: "Your email is only used as a login ID — it's never used to send emails. If you've set up passkeys or GitHub login, we recommend turning password authentication off." },
  'settings.passkeys': { ja: 'パスキー', en: 'Passkeys' },
  'settings.addPasskey': { ja: 'パスキーを追加', en: 'Add passkey' },
  'settings.deletePasskey': { ja: '削除', en: 'Delete' },
  'settings.noPasskeys': { ja: '登録済みのパスキーはありません', en: 'No passkeys registered' },
  'settings.cannotDisablePassword': { ja: '他のログイン方法が有効でないため無効にできません', en: 'Cannot disable without an alternative login method' },
  'settings.cannotDeleteLastPasskey': { ja: '他のログイン方法が有効でないため、最後のパスキーは削除できません', en: 'Cannot delete the last passkey without an alternative login method' },
  'settings.multiDevice': { ja: 'マルチデバイス', en: 'Multi-device' },
  'settings.singleDevice': { ja: 'シングルデバイス', en: 'Single-device' },
  'settings.passkeyAdded': { ja: 'パスキーを追加しました', en: 'Passkey added' },
  'settings.passkeyDeleted': { ja: 'パスキーを削除しました', en: 'Passkey deleted' },

  // Settings — API tokens
  'settings.apiTokens': { ja: 'APIトークン', en: 'API Tokens' },
  'settings.apiTokensDesc': { ja: '外部スクリプトやツールからAPIにアクセスするためのトークンを管理します', en: 'Manage tokens for accessing the API from external scripts and tools' },
  'settings.createToken': { ja: 'トークンを作成', en: 'Create token' },
  'settings.tokenName': { ja: '名前', en: 'Name' },
  'settings.tokenNamePlaceholder': { ja: '例: 監視スクリプト', en: 'e.g. Monitoring script' },
  'settings.tokenScopes': { ja: '権限', en: 'Scopes' },
  'settings.tokenScopeRead': { ja: '読み取り専用', en: 'Read only' },
  'settings.tokenScopeReadWrite': { ja: '読み書き', en: 'Read & Write' },
  'settings.tokenGenerate': { ja: '生成', en: 'Generate' },
  'settings.tokenCreated': { ja: 'トークンを作成しました', en: 'Token created' },
  'settings.tokenCreatedCopy': { ja: 'トークンが生成されました。今すぐコピーしてください：', en: 'Your token has been generated. Copy it now:' },
  'settings.tokenOnceWarning': { ja: 'このトークンは二度と表示されません。安全な場所に保管してください。', en: 'This token will not be shown again. Store it in a safe place.' },
  'settings.tokenDeleted': { ja: 'トークンを削除しました', en: 'Token deleted' },
  'settings.tokenDelete': { ja: '削除', en: 'Delete' },
  'settings.tokenLastUsed': { ja: '最終使用:', en: 'Last used:' },
  'settings.noTokens': { ja: 'APIトークンはまだありません', en: 'No API tokens yet' },

  // Settings — email change
  'settings.changeEmail': { ja: 'メールアドレス変更', en: 'Change Email' },
  'settings.currentEmail': { ja: '現在のメールアドレス', en: 'Current email' },
  'settings.newEmail': { ja: '新しいメールアドレス', en: 'New email address' },
  'settings.emailChanged': { ja: 'メールアドレスを変更しました', en: 'Email changed successfully' },
  'settings.emailChangeFailed': { ja: 'メールアドレスの変更に失敗しました', en: 'Failed to change email' },
  'settings.passwordForEmailChange': { ja: 'パスワード（確認用）', en: 'Password (for verification)' },

  // Settings — password change
  'settings.changePassword': { ja: 'パスワード変更', en: 'Change Password' },
  'settings.currentPassword': { ja: '現在のパスワード', en: 'Current password' },
  'settings.newPassword': { ja: '新しいパスワード', en: 'New password' },
  'settings.confirmPassword': { ja: '新しいパスワード（確認）', en: 'Confirm new password' },
  'settings.passwordChanged': { ja: 'パスワードを変更しました', en: 'Password changed successfully' },
  'settings.passwordChangeFailed': { ja: 'パスワードの変更に失敗しました', en: 'Failed to change password' },
  'settings.passwordMismatch': { ja: 'パスワードが一致しません', en: 'Passwords do not match' },
  'settings.passwordTooShort': { ja: 'パスワードは8文字以上にしてください', en: 'Password must be at least 8 characters' },

  // Password strength
  'password.tooShort': { ja: '8文字以上必要です', en: 'At least 8 characters required' },
  'password.weak': { ja: '弱い', en: 'Weak' },
  'password.fair': { ja: '普通', en: 'Fair' },
  'password.strong': { ja: '強い', en: 'Strong' },

  // Settings — GitHub OAuth
  'settings.githubOauth': { ja: 'GitHub OAuth', en: 'GitHub OAuth' },
  'settings.githubOauthDesc': { ja: 'GitHubアカウントによるログインを許可', en: 'Allow login with GitHub account' },
  'settings.githubClientId': { ja: 'Client ID', en: 'Client ID' },
  'settings.githubClientSecret': { ja: 'Client Secret', en: 'Client Secret' },
  'settings.githubAllowedUsers': { ja: '許可ユーザー', en: 'Allowed users' },
  'settings.githubAllowedUsersDesc': {
    ja: 'GitHub OAuthは本来誰でもログインできる仕組みのため、このアプリでは許可するユーザーを明示的に制限しています。\n\n空欄の場合はOAuth Appを作成したオーナーのみがログインできます。他のユーザーにも許可する場合はGitHubユーザー名をカンマ区切りで入力してください。',
    en: 'GitHub OAuth normally allows anyone to log in, so this app explicitly restricts access.\n\nIf empty, only the owner who created the OAuth App can log in. To allow others, enter their GitHub usernames separated by commas.',
  },
  'settings.githubAllowedUsersPlaceholder': { ja: '空欄 = Appオーナーのみ', en: 'Empty = App owner only' },
  'settings.githubCallbackUrl': { ja: 'Callback URL', en: 'Callback URL' },
  'settings.githubGuideTitle': { ja: 'セットアップガイド', en: 'Setup guide' },
  'settings.githubGuideStep1': { ja: 'を開き、OAuth Apps → New OAuth App をクリック', en: ', then click OAuth Apps → New OAuth App' },
  'settings.githubGuideStep2': { ja: '以下を入力して Register application をクリック:', en: 'Fill in the following and click Register application:' },
  'settings.githubGuideAppName': { ja: '任意の名前', en: 'Any name' },
  'settings.githubGuideStep3': { ja: '作成後に表示される Client ID と Client Secret を下のフォームに貼り付けて保存', en: 'Copy the Client ID and Client Secret shown after creation, paste them below, and save' },
  'settings.githubSave': { ja: '保存', en: 'Save' },
  'settings.githubSaved': { ja: 'GitHub OAuth設定を保存しました', en: 'GitHub OAuth settings saved' },
  'settings.githubNotConfigured': { ja: 'Client IDとClient Secretを設定してください', en: 'Set Client ID and Client Secret first' },
  'settings.cannotDisableGithub': { ja: '他のログイン方法が有効でないため無効にできません', en: 'Cannot disable without an alternative login method' },

  // Logout
  'sidebar.logout': { ja: 'ログアウト', en: 'Log out' },

  // Home page — time-based greetings
  'home.greeting.morning': { ja: 'おはよう、{name}', en: 'Good morning, {name}' },
  'home.greeting.afternoon': { ja: 'こんにちは、{name}', en: 'Good afternoon, {name}' },
  'home.greeting.evening': { ja: 'こんばんは、{name}', en: 'Good evening, {name}' },
  // Home page — random fallback (outside greeting windows)
  'home.greeting.random.0': { ja: '何について調べましょうか？', en: 'What would you like to explore?' },
  'home.greeting.random.1': { ja: '今日はどんな記事を読みますか？', en: 'What would you like to read today?' },
  'home.greeting.random.2': { ja: '何かお手伝いできることはありますか？', en: 'How can I help you?' },
  'home.greeting.random.3': { ja: '気になるトピックはありますか？', en: 'Any topics on your mind?' },
  'home.greeting.random.4': { ja: '何から始めましょうか？', en: 'Where shall we start?' },
  'home.placeholder': { ja: '記事について何でも聞いてください...', en: 'Ask anything about your articles...' },
  'home.chatHistory': { ja: 'チャット履歴', en: 'Chat history' },
  'chat.noResponse': { ja: '(応答なし)', en: '(No response)' },

  // Chat
  'chat.title': { ja: 'チャット', en: 'Chat' },
  'chat.newChat': { ja: '新規チャット', en: 'New chat' },
  'chat.placeholder': { ja: 'メッセージを入力...', en: 'Type a message...' },
  'chat.send': { ja: '送信', en: 'Send' },
  'chat.askAboutArticle': { ja: 'AIに質問', en: 'Ask AI' },
  'chat.trySaying': { ja: 'こんな質問はどう？', en: 'Try asking...' },
  'chat.suggestion.home.recommend': { ja: '今日のおすすめ記事は？', en: 'What should I read today?' },
  'chat.suggestion.home.unread': { ja: '未読で面白そうな記事ある？', en: 'Any interesting unread articles?' },
  'chat.suggestion.home.trending': { ja: '最近のトレンドは？', en: 'What\'s trending recently?' },
  'chat.suggestion.home.surprise': { ja: '何か意外な記事を教えて', en: 'Surprise me with something unexpected' },
  'chat.suggestion.home.digest': { ja: '今週のダイジェストをまとめて', en: 'Give me a digest of this week' },
  // Dynamic suggestion keys (returned by /api/chat/suggestions)
  'suggestion.morning.newArticles': { ja: '昨夜の新着をまとめて', en: 'Summarize last night\'s new articles' },
  'suggestion.morning.readToday': { ja: '今日読むべき記事は？', en: 'What should I read today?' },
  'suggestion.daytime.highlights': { ja: '今日のハイライトは？', en: 'What are today\'s highlights?' },
  'suggestion.evening.review': { ja: '今日の記事を振り返って', en: 'Review today\'s articles' },
  'suggestion.unreadMany': { ja: '未読${count}件、重要なのどれ？', en: '${count} unread — which are important?' },
  'suggestion.unreadSome': { ja: '未読で面白そうな記事ある？', en: 'Any interesting unread articles?' },
  'suggestion.topCategory': { ja: '${category}の最新記事ある？', en: 'Any new ${category} articles?' },
  'suggestion.weeklyDigest': { ja: '今週のダイジェストをまとめて', en: 'Give me a digest of this week' },
  'suggestion.trending': { ja: '最近のトレンドは？', en: 'What\'s trending recently?' },
  'suggestion.surprise': { ja: '何か意外な記事を教えて', en: 'Surprise me with something unexpected' },
  'chat.suggestion.summarize': { ja: 'この記事を3行でまとめて', en: 'Summarize this in 3 sentences' },
  'chat.suggestion.keyPoints': { ja: '重要なポイントを箇条書きで', en: 'List the key points' },
  'chat.suggestion.explain': { ja: '初心者にもわかるように説明して', en: 'Explain this for a beginner' },
  'chat.suggestion.opinion': { ja: 'この記事への反論を考えて', en: 'Think of counterarguments' },
  'chat.suggestion.related': { ja: '関連トピックを教えて', en: 'What are related topics?' },
  'chat.searching': { ja: '記事を検索中...', en: 'Searching articles...' },
  'chat.toolRunning': { ja: '${name} を実行中...', en: 'Running ${name}...' },
  'chat.thinking': { ja: '考え中...', en: 'Thinking...' },
  'chat.noConversations': { ja: '会話がありません', en: 'No conversations' },
  'chat.deleteConfirm': { ja: 'この会話を削除しますか？', en: 'Delete this conversation?' },
  'chat.settings': { ja: 'チャット', en: 'Chat' },
  'chat.settingsDesc': { ja: 'チャット用のプロバイダーとモデル', en: 'Provider and model for chat' },
  'chat.model': { ja: 'チャットモデル', en: 'Chat model' },
  'chat.modelDesc': { ja: 'チャットで使用するAIモデル', en: 'AI model used for chat' },
  'chat.provider': { ja: 'チャットプロバイダー', en: 'Chat provider' },
  'chat.providerDesc': { ja: 'チャットで使用するプロバイダー', en: 'Provider used for chat' },
  // Command Palette
  'command.navigation': { ja: 'ナビゲーション', en: 'Navigation' },
  'command.actions': { ja: 'アクション', en: 'Actions' },
  'command.feeds': { ja: 'フィード', en: 'Feeds' },
  'command.appearance': { ja: '外観', en: 'Appearance' },
  'command.placeholder': { ja: 'コマンドを入力...', en: 'Type a command or search...' },
  'command.noResults': { ja: '結果が見つかりません', en: 'No results found.' },
  'command.searchArticles': { ja: '記事を検索', en: 'Search articles' },
  'command.addFeed': { ja: 'フィードを追加', en: 'Add new feed' },
  'command.importOpml': { ja: 'OPML インポート', en: 'Import OPML' },
  'command.exportOpml': { ja: 'OPML エクスポート', en: 'Export OPML' },

  'summary.settings': { ja: '要約', en: 'Summary' },
  'summary.settingsDesc': { ja: '要約で使用するプロバイダーとモデル', en: 'Provider and model for summary' },
  'summary.model': { ja: '要約モデル', en: 'Summary model' },
  'summary.modelDesc': { ja: '要約で使用するAIモデル', en: 'AI model used for summary' },
  'summary.provider': { ja: '要約プロバイダー', en: 'Summary provider' },
  'summary.providerDesc': { ja: '要約で使用するプロバイダー', en: 'Provider used for summary' },
  'translate.settings': { ja: '翻訳', en: 'Translation' },
  'translate.settingsDesc': { ja: '翻訳で使用するプロバイダーとモデル', en: 'Provider and model for translation' },
  'translate.model': { ja: '翻訳モデル', en: 'Translation model' },
  'translate.modelDesc': { ja: '翻訳で使用するAIモデル', en: 'AI model used for translation' },
  'translate.provider': { ja: '翻訳プロバイダー', en: 'Translation provider' },
  'translate.providerDesc': { ja: '翻訳で使用するプロバイダー', en: 'Provider used for translation' },
  'provider.anthropic': { ja: 'Anthropic API', en: 'Anthropic API' },
  'provider.gemini': { ja: 'Gemini API', en: 'Gemini API' },
  'provider.openai': { ja: 'OpenAI API', en: 'OpenAI API' },
  'provider.claudeCode': { ja: 'Claude Code', en: 'Claude Code' },
  'provider.ollama': { ja: 'Ollama', en: 'Ollama' },
  'provider.vllm': { ja: 'vLLM', en: 'vLLM' },
  'provider.googleTranslate': { ja: 'Google Translate', en: 'Google Translate' },
  'provider.deepl': { ja: 'DeepL', en: 'DeepL' },
  'ollama.baseUrl': { ja: 'Ollama サーバー URL', en: 'Ollama Server URL' },
  'ollama.baseUrlDesc': { ja: 'Ollama サーバーのアドレスを設定', en: 'Set the Ollama server address' },
  'ollama.baseUrlPlaceholder': { ja: 'http://localhost:11434', en: 'http://localhost:11434' },
  'ollama.baseUrlSaved': { ja: 'Ollama サーバー URL を保存しました', en: 'Ollama server URL saved' },
  'ollama.testConnection': { ja: '接続テスト', en: 'Test Connection' },
  'ollama.testing': { ja: 'テスト中...', en: 'Testing...' },
  'ollama.connected': { ja: '接続成功', en: 'Connected' },
  'ollama.connectionFailed': { ja: '接続失敗', en: 'Connection failed' },
  'ollama.noModels': { ja: 'Ollama に接続できません', en: 'Cannot connect to Ollama' },
  'ollama.customHeaders': { ja: 'カスタムヘッダー', en: 'Custom Headers' },
  'ollama.customHeadersDesc': { ja: 'リバースプロキシの認証ヘッダーなど', en: 'e.g. reverse proxy authentication headers' },
  'ollama.headerKey': { ja: 'ヘッダー名', en: 'Header name' },
  'ollama.headerValue': { ja: '値', en: 'Value' },
  'ollama.addHeader': { ja: '追加', en: 'Add' },
  'ollama.headersSaved': { ja: 'カスタムヘッダーを保存しました', en: 'Custom headers saved' },

  // vLLM
  'vllm.baseUrl': { ja: 'vLLM サーバー URL', en: 'vLLM Server URL' },
  'vllm.baseUrlDesc': { ja: 'vLLM サーバーのアドレスを設定', en: 'Set the vLLM server address' },
  'vllm.baseUrlPlaceholder': { ja: 'http://localhost:8000', en: 'http://localhost:8000' },
  'vllm.baseUrlSaved': { ja: 'vLLM サーバー URL を保存しました', en: 'vLLM server URL saved' },
  'vllm.testConnection': { ja: '接続テスト', en: 'Test Connection' },
  'vllm.testing': { ja: 'テスト中...', en: 'Testing...' },
  'vllm.connected': { ja: '接続成功', en: 'Connected' },
  'vllm.connectionFailed': { ja: '接続失敗', en: 'Connection failed' },
  'vllm.noModels': { ja: 'vLLM に接続できません', en: 'Cannot connect to vLLM' },
  'vllm.apiKeySaved': { ja: 'vLLM API キーを保存しました', en: 'vLLM API key saved' },
  'vllm.apiKeyDeleted': { ja: 'vLLM API キーを削除しました', en: 'vLLM API key deleted' },
  'googleTranslate.apiKeySaved': { ja: 'Google Translate API キーを保存しました', en: 'Google Translate API key saved' },
  'googleTranslate.apiKeyDeleted': { ja: 'Google Translate API キーを削除しました', en: 'Google Translate API key deleted' },
  'deepl.apiKeySaved': { ja: 'DeepL API キーを保存しました', en: 'DeepL API key saved' },
  'deepl.apiKeyDeleted': { ja: 'DeepL API キーを削除しました', en: 'DeepL API key deleted' },
  'openai.apiKey': { ja: 'OpenAI API キー', en: 'OpenAI API Key' },
  'openai.apiKeyDesc': { ja: 'OpenAI API キーを設定', en: 'Set your OpenAI API key' },
  'openai.apiKeySaved': { ja: 'OpenAI API キーを保存しました', en: 'OpenAI API key saved' },
  'openai.apiKeyDeleted': { ja: 'OpenAI API キーを削除しました', en: 'OpenAI API key deleted' },
  'gemini.apiKey': { ja: 'Gemini API キー', en: 'Gemini API Key' },
  'gemini.apiKeyDesc': { ja: 'Google AI Gemini API キーを設定', en: 'Set your Google AI Gemini API key' },
  'gemini.apiKeySaved': { ja: 'Gemini API キーを保存しました', en: 'Gemini API key saved' },
  'gemini.apiKeyDeleted': { ja: 'Gemini API キーを削除しました', en: 'Gemini API key deleted' },
  'chat.authConnected': { ja: '認証済み', en: 'Connected' },
  'chat.authNotConnected': { ja: '未認証', en: 'Not connected' },
  'chat.authNotInstalled': { ja: 'Claude Code がインストールされていません', en: 'Claude Code is not installed' },
  'chat.authRunLogin': { ja: 'サーバーで claude auth login を実行してください', en: 'Run claude auth login on the server' },
  'chat.authNote': {
    ja: 'Claude Code の認証はブラウザでの OAuth フローが必要なため、この画面からは設定できません。サーバーのターミナルで直接コマンドを実行してください。',
    en: 'Claude Code authentication requires a browser-based OAuth flow, so it cannot be configured from this screen. Run the commands directly in the server terminal.',
  },
  'chat.authNoteIssue': { ja: '関連: ', en: 'Related: ' },
  'chat.authHowToLogin': { ja: 'ログイン: claude auth login', en: 'Login: claude auth login' },
  'chat.authHowToLoginLabel': { ja: 'ログイン:', en: 'Login:' },
  'chat.authHowToLogout': { ja: 'ログアウト: claude auth logout', en: 'Logout: claude auth logout' },
  'chat.authHowToLogoutLabel': { ja: 'ログアウト:', en: 'Logout:' },
  'chat.expand': { ja: '拡大', en: 'Expand' },
  'chat.collapse': { ja: '縮小', en: 'Collapse' },
  'chat.apiKey': { ja: 'API キー', en: 'API Key' },
  'chat.apiKeyDesc': { ja: 'Anthropic API キーを設定', en: 'Set your Anthropic API key' },
  'chat.apiKeyConfigured': { ja: '設定済み', en: 'Configured' },
  'chat.apiKeyNotSet': { ja: '未設定', en: 'Not set' },
  'chat.apiKeySaved': { ja: 'API キーを保存しました', en: 'API key saved' },
  'chat.apiKeyDeleted': { ja: 'API キーを削除しました', en: 'API key deleted' },
  'chat.apiKeyDelete': { ja: '削除', en: 'Delete' },
  'error.anthropicKeyNotSet': {
    ja: 'Anthropic API キーが設定されていません。',
    en: 'Anthropic API key is not configured.',
  },
  'error.geminiKeyNotSet': {
    ja: 'Gemini API キーが設定されていません。',
    en: 'Gemini API key is not configured.',
  },
  'error.openaiKeyNotSet': {
    ja: 'OpenAI API キーが設定されていません。',
    en: 'OpenAI API key is not configured.',
  },
  'error.googleTranslateKeyNotSet': {
    ja: 'Google Translate API キーが設定されていません。',
    en: 'Google Translate API key is not configured.',
  },
  'error.deeplKeyNotSet': {
    ja: 'DeepL API キーが設定されていません。',
    en: 'DeepL API key is not configured.',
  },
  'error.summarizationFailed': {
    ja: '要約に失敗しました。しばらくしてから再度お試しください。',
    en: 'Summarization failed. Please try again later.',
  },
  'error.translationFailed': {
    ja: '翻訳に失敗しました。しばらくしてから再度お試しください。',
    en: 'Translation failed. Please try again later.',
  },
  'error.goToSettings': {
    ja: '設定画面',
    en: 'Settings',
  },
  'error.setApiKeyFromSettings': {
    ja: 'から API キーを入力してください。',
    en: ' to configure your API key.',
  },

  // Search
  'search.title': { ja: '検索', en: 'Search' },
  'search.placeholder': { ja: '記事を検索...', en: 'Search articles...' },
  'search.noResults': { ja: '一致する記事がありません', en: 'No matching articles' },
  'search.indexBuilding': { ja: '検索インデックスを構築中です…', en: 'Building search index…' },
  'search.hint': { ja: '↑↓ 移動 · Enter 開く · Esc 閉じる', en: '↑↓ navigate · Enter open · Esc close' },
  'search.filterBookmarked': { ja: 'あとで読む', en: 'Read Later' },
  'search.filterLiked': { ja: 'いいね', en: 'Liked' },
  'search.filterUnread': { ja: '未読', en: 'Unread' },
  'search.period.today': { ja: '今日', en: 'Today' },
  'search.period.week': { ja: '1週間', en: 'Week' },
  'search.period.month': { ja: '1ヶ月', en: 'Month' },

  // About
  'settings.about': { ja: 'About', en: 'About' },
  'about.version': { ja: 'バージョン', en: 'Version' },
  'about.github': { ja: 'GitHub', en: 'GitHub' },
  'about.issues': { ja: 'フィードバック', en: 'Feedback' },
  'about.commit': { ja: 'コミット', en: 'Commit' },
  'about.buildDate': { ja: 'ビルド日時', en: 'Build Date' },

  // Toast
  'toast.fetchedArticles': { ja: '${name}: ${count}件の新しい記事を取得', en: '${name}: Fetched ${count} new articles' },
  'toast.noNewArticles': { ja: '${name}: 新着なし', en: '${name}: No new articles' },
  'toast.fetchError': { ja: '${name}: フェッチに失敗しました', en: '${name}: Fetch failed' },
  'toast.newVersion': { ja: '新しいバージョンが利用可能です', en: 'A new version is available' },
  'toast.reload': { ja: '更新', en: 'Reload' },
} as const

type MessageKey = keyof typeof dict

const errorCodeMap: Record<string, MessageKey> = {
  ANTHROPIC_KEY_NOT_SET: 'error.anthropicKeyNotSet',
  GEMINI_KEY_NOT_SET: 'error.geminiKeyNotSet',
  OPENAI_KEY_NOT_SET: 'error.openaiKeyNotSet',
  GOOGLE_TRANSLATE_KEY_NOT_SET: 'error.googleTranslateKeyNotSet',
  DEEPL_KEY_NOT_SET: 'error.deeplKeyNotSet',
  SUMMARIZATION_FAILED: 'error.summarizationFailed',
  TRANSLATION_FAILED: 'error.translationFailed',
}

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const defaultLocale: Locale = navigator.language.startsWith('ja') ? 'ja' : 'en'

function resolveLocale(): Locale {
  const stored = localStorage.getItem('locale')
  if (stored === 'ja' || stored === 'en') return stored
  return defaultLocale
}

/** Translate outside React tree (resolves locale from localStorage) */
export function translate(key: MessageKey): string {
  return dict[key][resolveLocale()]
}

export const LocaleContext = createContext<LocaleContextValue>({
  locale: defaultLocale,
  setLocale: () => {},
})

export type TranslateFn = (key: MessageKey, params?: Record<string, string>) => string

/** Check whether a string is a valid i18n message key. */
export function isMessageKey(key: string): key is MessageKey {
  return key in dict
}

export function useI18n() {
  const { locale, setLocale } = useContext(LocaleContext)
  const t = (key: MessageKey, params?: Record<string, string>): string => {
    let text: string = dict[key][locale]
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`\${${k}}`, v)
      }
    }
    return text
  }
  const tError = (message: string): string => {
    const i18nKey = errorCodeMap[message]
    return i18nKey ? t(i18nKey) : message
  }
  const isKeyNotSetError = (message: string): boolean => message in errorCodeMap
  return { t, tError, isKeyNotSetError, locale, setLocale } as const
}

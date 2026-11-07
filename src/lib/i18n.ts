import { createContext, useContext } from 'react'

export type Locale = 'ja' | 'en' | 'zh'

export const APP_NAME = 'Oksskolten'

const dict = {
  // Header
  'header.menu': { ja: 'メニュー', en: 'Menu', zh: '菜单'},
  'header.back': { ja: '戻る', en: 'Back', zh: '返回'},
  'header.modeSystem': { ja: 'システム', en: 'System', zh: '系统'},
  'header.modeDark': { ja: 'ダークモード', en: 'Dark', zh: '深色'},
  'header.modeLight': { ja: 'ライトモード', en: 'Light', zh: '浅色'},
  'header.title': { ja: APP_NAME, en: APP_NAME, zh: APP_NAME },

  // FeedList
  'feeds.title': { ja: 'フィード', en: 'Feeds', zh: '订阅源'},
  'feeds.inbox': { ja: 'Inbox', en: 'Inbox', zh: '收件箱'},
  'feeds.add': { ja: 'フィード', en: 'Feed', zh: '订阅源'},
  'feeds.theme': { ja: 'テーマ', en: 'Theme', zh: '主题'},
  'feeds.colorMode': { ja: 'カラーモード', en: 'Color mode', zh: '颜色模式'},
  'feeds.rename': { ja: '名前を変更', en: 'Rename', zh: '重命名'},
  'feeds.markAllRead': { ja: 'すべて既読にする', en: 'Mark all as read', zh: '全部标为已读'},
  'feeds.delete': { ja: '削除', en: 'Delete', zh: '删除'},
  'feeds.deleteFeed': { ja: 'フィードを削除', en: 'Delete Feed', zh: '删除订阅源'},
  'feeds.reEnableFeed': { ja: 'フィードを再有効化', en: 'Re-enable Feed', zh: '重新启用订阅源'},
  'feeds.deleteConfirm': {
    ja: '${name} を削除しますか？紐づく記事もすべて削除されます。',
    en: 'Delete ${name}? All associated articles will also be deleted.',
    zh: '确定删除 ${name}？所有关联的文章也将被删除。'
  },
  'feeds.reEnableConfirm': {
    ja: 'このフィードは連続エラーにより無効化されています。再有効化しますか？',
    en: 'This feed was disabled due to repeated errors. Re-enable it?',
    zh: '此订阅源因多次错误被禁用。是否重新启用？'
  },
  'feeds.enable': { ja: '有効化', en: 'Enable', zh: '启用'},
  'feeds.bookmarks': { ja: 'あとで読む', en: 'Read Later', zh: '稍后阅读'},
  'feeds.likes': { ja: 'いいね', en: 'Liked', zh: '已点赞'},
  'feeds.today': { ja: 'Today', en: 'Today', zh: '今天'},
  'feeds.history': { ja: '読んだ記事', en: 'Read', zh: '已读'},
  'feeds.fetch': { ja: 'フェッチ', en: 'Fetch articles', zh: '获取文章'},
  'category.fetchAll': { ja: 'すべてフェッチ', en: 'Fetch all feeds', zh: '获取所有订阅源'},
  'feeds.reDetect': { ja: 'RSS を再検出', en: 'Re-detect RSS', zh: '重新检测 RSS'},
  'feeds.clips': { ja: 'クリップ', en: 'Clips', zh: '剪藏'},
  'feeds.clipArticle': { ja: '記事をクリップ', en: 'Clip Article', zh: '剪藏文章'},
  'feeds.articleUrlPlaceholder': { ja: '記事のURLを入力', en: 'Enter article URL', zh: '输入文章 URL'},
  'modal.clipExistsInFeed': {
    ja: 'この記事はフィード「',
    en: 'This article already exists in feed "',
    zh: '此文章已存在于订阅源「'
  },
  'modal.clipExistsInFeedSuffix': {
    ja: '」に登録済みです',
    en: '"',
    zh: '」中'
  },
  'modal.clipViewArticle': {
    ja: '記事を見る',
    en: 'View article',
    zh: '查看文章'
  },
  'modal.clipAlreadyExists': {
    ja: 'この記事はすでにクリップに保存されています',
    en: 'This article is already saved in Clips',
    zh: '此文章已保存在剪藏中'
  },
  'modal.clipMoveToClips': { ja: 'クリップに移動', en: 'Move to Clips', zh: '移至剪藏'},

  // ArticleList
  'articles.loadError': { ja: '読み込みに失敗しました', en: 'Failed to load', zh: '加载失败'},
  'articles.retry': { ja: '再試行', en: 'Retry', zh: '重试'},
  'articles.empty': { ja: '記事がありません', en: 'No articles', zh: '暂无文章'},
  'articles.allRead': { ja: 'すべて読みました', en: 'All caught up!', zh: '全部读完了！'},
  'articles.showReadArticles': { ja: '既読記事を表示する', en: 'Show read articles', zh: '显示已读文章'},

  // FeedErrorBanner - pipeline stages
  'feedError.stage.discovery': { ja: 'RSS検出', en: 'RSS Discovery', zh: 'RSS 发现'},
  'feedError.stage.bridge': { ja: 'Bridge変換', en: 'Bridge', zh: '桥接'},
  'feedError.stage.fetch': { ja: '記事取得', en: 'Fetch', zh: '获取'},
  'feedError.stage.parse': { ja: '解析', en: 'Parse', zh: '解析'},

  // FeedErrorBanner - error explanations
  'feedError.noRssUrl': {
    ja: 'このサイトからRSSフィードのURLを検出できませんでした。サイトがRSSを提供していない可能性があります。「RSSを再検出」でRSS Bridge経由の取得を試みることができます。',
    en: 'Could not detect an RSS feed URL from this site. The site may not provide RSS. Try "Re-detect RSS" to attempt fetching via RSS Bridge.',
    zh: '无法从此站点检测到 RSS 订阅源 URL。该站点可能不提供 RSS。尝试「重新检测 RSS」以通过 RSS Bridge 获取。'
  },
  'feedError.flareSolverrFailed': {
    ja: 'このサイトはBot検出（Cloudflare等）で保護されており、突破に失敗しました。しばらく時間をおいてから「再取得」を試してください。',
    en: 'This site is protected by bot detection (e.g. Cloudflare) and bypass failed. Wait a moment and try "Retry Fetch".',
    zh: '此站点受机器人检测（如 Cloudflare）保护，绕过失败。请稍等片刻后尝试「重试获取」。'
  },
  'feedError.httpError': {
    ja: 'サーバーからHTTPエラー（${code}）が返されました。サイトが一時的にダウンしているか、URLが変更された可能性があります。',
    en: 'The server returned HTTP error (${code}). The site may be temporarily down or the URL may have changed.',
    zh: '服务器返回 HTTP 错误（${code}）。站点可能暂时不可用或 URL 已更改。'
  },
  'feedError.parseFailed': {
    ja: 'フィードのXMLを解析できませんでした。フィードの形式が壊れているか、RSS/Atom形式でない可能性があります。「RSSを再検出」で別のフィードソースを探すことができます。',
    en: 'Could not parse the feed XML. The feed format may be broken or not RSS/Atom. Try "Re-detect RSS" to find an alternative feed source.',
    zh: '无法解析订阅源 XML。订阅源格式可能损坏或不是 RSS/Atom 格式。尝试「重新检测 RSS」查找替代订阅源。'
  },
  'feedError.cssBridgeFailed': {
    ja: 'CSSセレクタによるスクレイピングで記事を抽出できませんでした。サイトの構造が変わった可能性があります。「RSSを再検出」でセレクタを再推論できます。',
    en: 'Failed to extract articles via CSS selector scraping. The site structure may have changed. Try "Re-detect RSS" to re-infer the selector.',
    zh: '通过 CSS 选择器抓取文章失败。站点结构可能已更改。尝试「重新检测 RSS」以重新推断选择器。'
  },
  'feedError.unknown': {
    ja: 'フィードの取得中に予期しないエラーが発生しました。しばらく待ってから「再取得」を試してください。',
    en: 'An unexpected error occurred while fetching the feed. Wait a moment and try "Retry Fetch".',
    zh: '获取订阅源时发生意外错误。请稍等片刻后尝试「重试获取」。'
  },

  // FeedErrorBanner - actions & states
  'feedError.reDetect': { ja: 'RSSを再検出', en: 'Re-detect RSS', zh: '重新检测 RSS'},
  'feedError.retry': { ja: '再取得', en: 'Retry Fetch', zh: '重试获取'},
  'feedError.processing': { ja: '記事を取得しています…', en: 'Fetching articles…', zh: '正在获取文章…'},

  // Hint banners
  'hint.today': { ja: 'あなたの行動をもとにスコアリングされたおすすめ記事。AIに「今日何読む？」と聞くこともできます。', en: 'Articles scored by your engagement. You can also ask the AI "What should I read today?"', zh: '根据您的互动评分的文章。您也可以问 AI「今天读什么？」' },
  'hint.inbox': { ja: '未読記事だけが集まるOksskoltenの玄関口。既読にするとInboxには表示されなくなります。', en: 'The front door of Oksskolten, where only unread articles live. Once marked as read, they won\'t appear in Inbox anymore.', zh: 'Oksskolten 的入口，只有未读文章。标为已读后将不再出现在收件箱中。' },
  'hint.bookmarks': { ja: '気になる記事を一旦キープ。あとで読みたいときに使えます。', en: 'Keep articles for later. A quick way to save something you want to come back to.', zh: '保留文章以便稍后阅读。快速保存您想回来看的内容。' },
  'hint.likes': { ja: 'いいねした記事がここに。検索やレコメンドのスコアリングにも反映されます。', en: 'Articles you\'ve liked live here. Likes also boost search and recommendation scoring.', zh: '您点赞的文章在这里。点赞也会提升搜索和推荐评分。' },
  'hint.clips': { ja: 'フィードを追跡するほどじゃない相手の記事を、URL指定で個別に保存できます。', en: 'Save individual articles by URL — perfect for sources you don\'t need a full feed for.', zh: '通过 URL 保存单篇文章 — 适合不需要完整订阅的来源。' },
  'hint.history': { ja: '記事を開いて読んだ履歴。「スクロールで自動既読」で流れたものは含まず、実際に開いた記事だけが残ります。', en: 'Articles you actually opened and read. Items swept away by "Auto-Mark As Read On Scroll" aren\'t included — only articles you tapped into.', zh: '您实际打开并阅读的文章。「滚动时自动标为已读」跳过的不包括在内 — 只有您点进去看的文章。' },
  'articles.showOlder': { ja: 'もっと読む（${count}件）', en: 'Show older articles (${count})', zh: '显示更早的文章（${count}）'},
  'articles.allCaughtUp': { ja: '全部読んだよ！', en: "You're all caught up!", zh: "全部读完了！"},

  // ArticleDetail
  'article.noContent': { ja: 'コンテンツがありません', en: 'No content available', zh: '暂无内容'},
  'article.jaTranslation': { ja: '日本語訳', en: 'Japanese', zh: '日语'},
  'article.original': { ja: '原文', en: 'Original', zh: '原文'},
  'article.sourceArticle': { ja: '元記事', en: 'Source Article', zh: '原文链接'},
  'article.summarize': { ja: '要約', en: 'Summarize', zh: '摘要'},
  'article.askQuestion': { ja: '質問', en: 'Ask', zh: '提问'},
  'article.readMore': { ja: '続きを読む', en: 'Read more', zh: '阅读更多'},
  'article.showLess': { ja: '閉じる', en: 'Show less', zh: '收起'},
  'article.translate': { ja: '翻訳', en: 'Translate', zh: '翻译'},
  'article.claudeCodeUsage': { ja: 'Claude Code の利用枠を消費', en: 'Consumed Claude Code usage', zh: '已消耗 Claude Code 用量'},
  'article.freeTier': { ja: '無料枠', en: 'Free tier', zh: '免费额度'},
  'article.notFound': { ja: '記事が見つかりませんでした', en: 'Article not found', zh: '文章未找到'},
  'article.rawMarkdown': { ja: 'マークダウン表示', en: 'Raw Markdown', zh: 'Markdown 原文'},
  'article.similarAlreadyRead': { ja: 'この記事は ${feedNames} にもあり、既に読んでいます', en: 'You already read this story from ${feedNames}', zh: '您已经从 ${feedNames} 读过这篇文章'},
  'article.similarCoveredBy': { ja: 'この記事は ${feedNames} にもあります', en: 'This story was also covered by ${feedNames}', zh: '这篇文章也被 ${feedNames} 报道过'},
  'article.similarShowSources': { ja: '${count} 件の類似記事を表示', en: 'Show ${count} similar sources', zh: '显示 ${count} 个相似来源'},
  'article.archiveImages': { ja: '画像を保存', en: 'Save Images', zh: '保存图片'},
  'article.imagesArchived': { ja: '画像保存済み', en: 'Images Saved', zh: '图片已保存'},
  'article.archivingImages': { ja: '画像を保存中...', en: 'Saving images...', zh: '正在保存图片...'},
  'article.viewingTranslation': { ja: '日本語訳で表示中', en: 'Viewing translation', zh: '查看翻译'},
  'article.viewingOriginal': { ja: '原文を表示中', en: 'Viewing original', zh: '查看原文'},
  'article.switchToOriginal': { ja: '原文に切替 →', en: 'Switch to original →', zh: '切换到原文 →'},
  'article.switchToTranslation': { ja: '日本語訳に切替 →', en: 'Switch to translation →', zh: '切换到翻译 →'},
  'article.addBookmark': { ja: '後で読む', en: 'Read later', zh: '稍后阅读'},
  'article.removeBookmark': { ja: '後で読むを解除', en: 'Remove from read later', zh: '取消稍后阅读'},
  'article.addLike': { ja: 'いいね', en: 'Like', zh: '点赞'},
  'article.removeLike': { ja: 'いいねを解除', en: 'Unlike', zh: '取消点赞'},
  'article.delete': { ja: '削除', en: 'Delete', zh: '删除'},
  'article.deleteConfirm': { ja: 'この記事を削除しますか？', en: 'Delete this article?', zh: '确定删除这篇文章？'},

  // AddModal (unified)
  'modal.addNew': { ja: 'はじめる', en: 'Get Started', zh: '开始使用'},
  'modal.addFeedOption': { ja: 'フィード', en: 'Feed', zh: '订阅源'},
  'modal.addFeedDesc': { ja: 'URLからRSSフィードを追加', en: 'Add an RSS feed from a URL', zh: '从 URL 添加 RSS 订阅源'},
  'modal.clipArticleOption': { ja: 'クリップ', en: 'Clip', zh: '剪藏'},
  'modal.clipArticleDesc': { ja: 'URLから記事を取得してクリップ', en: 'Clip an article from a URL', zh: '从 URL 剪藏文章'},
  'modal.addFolderOption': { ja: 'フォルダ', en: 'Folder', zh: '文件夹'},
  'modal.addFolderDesc': { ja: 'フィードを整理するフォルダを作成', en: 'Create a folder to organize feeds', zh: '创建文件夹来整理订阅源'},
  'modal.addFolder': { ja: 'フォルダを追加', en: 'Add Folder', zh: '添加文件夹'},
  'modal.folderNamePlaceholder': { ja: 'フォルダ名', en: 'Folder name', zh: '文件夹名称'},
  'modal.create': { ja: '作成', en: 'Create', zh: '创建'},
  'modal.creating': { ja: '作成中...', en: 'Creating...', zh: '创建中...'},

  // FeedModal
  'modal.addFeed': { ja: 'フィードを追加', en: 'Add Feed', zh: '添加订阅源'},
  'modal.url': { ja: 'URL', en: 'URL', zh: 'URL'},
  'modal.discovering': { ja: '取得中...', en: 'Fetching...', zh: '获取中...'},
  'modal.namePlaceholder': { ja: '名前（自動取得）', en: 'Name (auto-detected)', zh: '名称（自动检测）'},
  'modal.cancel': { ja: 'キャンセル', en: 'Cancel', zh: '取消'},
  'modal.adding': { ja: '追加中...', en: 'Adding...', zh: '添加中...'},
  'modal.add': { ja: '追加', en: 'Add', zh: '添加'},
  'modal.errorRssNotDetected': { ja: 'このURLからRSSフィードを検出できませんでした', en: 'RSS could not be detected for this URL', zh: '无法从此 URL 检测到 RSS'},
  'modal.errorAlreadyExists': { ja: 'このフィードは既に登録されています', en: 'This feed already exists', zh: '此订阅源已存在'},
  'modal.errorHttpOrHttpsOnly': { ja: 'http:// または https:// で始まるURLのみ対応しています', en: 'Only http:// or https:// URLs are allowed', zh: '仅支持以 http:// 或 https:// 开头的 URL'},
  'modal.genericError': { ja: 'エラーが発生しました', en: 'An error occurred', zh: '发生错误'},
  'modal.step.rssDiscovery': { ja: 'RSS 検出', en: 'RSS discovery', zh: 'RSS 发现'},
  'modal.step.flaresolverr': { ja: 'JSレンダリング', en: 'JS rendering', zh: 'JS 渲染'},
  'modal.step.rssBridge': { ja: 'RSS Bridge', en: 'RSS Bridge', zh: 'RSS 桥接'},
  'modal.step.cssSelector': { ja: 'CSS Selector（LLM）', en: 'CSS Selector (LLM)', zh: 'CSS 选择器（LLM）'},
  'modal.step.done': { ja: 'フィード作成完了', en: 'Feed created', zh: '订阅源已创建'},
  'modal.step.completed': { ja: '完了', en: 'Completed', zh: '已完成'},
  'modal.step.found': { ja: '検出', en: 'Found', zh: '已找到'},
  'modal.step.notFound': { ja: 'この段階では未検出', en: 'Not detected at this step', zh: '此步骤未检测到'},
  'modal.step.skipped': { ja: 'スキップ', en: 'Skipped', zh: '已跳过'},
  'modal.choiceTitle': { ja: 'サイト全体のRSSフィードが見つかりました', en: 'Found a site-wide RSS feed', zh: '找到全站 RSS 订阅源'},
  'modal.choiceWholeSite': { ja: 'サイト全体を購読', en: 'Subscribe to the whole site', zh: '订阅整个站点'},
  'modal.choiceThisPage': { ja: 'このページだけを購読', en: 'Subscribe to this page only', zh: '仅订阅此页面'},
  'modal.errorPageExtract': { ja: 'このページからコンテンツを抽出できませんでした', en: 'Could not extract content from this page', zh: '无法从此页面提取内容'},

  // Settings
  'feeds.dateFormat': { ja: '日付表示', en: 'Date', zh: '日期'},
  'feeds.dateRelative': { ja: '相対', en: 'Relative', zh: '相对'},
  'feeds.dateAbsolute': { ja: '絶対', en: 'Absolute', zh: '绝对'},
  'date.justNow': { ja: 'たった今', en: 'just now', zh: '刚刚'},

  // Sidebar menu
  'sidebar.settings': { ja: '設定', en: 'Settings', zh: '设置'},

  // Settings page
  'settings.title': { ja: '設定', en: 'Settings', zh: '设置'},
  'settings.general': { ja: '一般', en: 'General', zh: '通用'},
  'settings.appearance': { ja: '外観', en: 'Appearance', zh: '外观'},
  'settings.colorMode': { ja: 'カラーモード', en: 'Color mode', zh: '颜色模式'},
  'settings.colorModeDesc': { ja: 'アプリ全体の明暗を切り替えます。「自動」はOSの設定に連動します', en: 'Switch between light and dark appearance. "Auto" follows your OS setting', zh: '在浅色和深色外观之间切换。「自动」跟随系统设置' },
  'settings.colorModeLight': { ja: 'ライト', en: 'Light', zh: '浅色'},
  'settings.colorModeDark': { ja: 'ダーク', en: 'Dark', zh: '深色'},
  'settings.colorModeAuto': { ja: '自動', en: 'Auto', zh: '自动'},
  'settings.colorTheme': { ja: '配色テーマ', en: 'Color Theme', zh: '颜色主题'},
  'settings.themeDesc': { ja: 'サイドバー・背景・アクセントカラーなどアプリ全体の配色が変わります', en: 'Changes sidebar, background, and accent colors across the entire app', zh: '更改整个应用的侧边栏、背景和强调色' },
  'settings.dateFormat': { ja: '日付表示', en: 'Date format', zh: '日期格式'},
  'settings.dateFormatDesc': { ja: '相対または絶対表示', en: 'Relative or absolute display', zh: '相对或绝对显示' },
  'settings.plugins': { ja: 'プラグイン', en: 'Plugins', zh: '插件'},
  'settings.viewer': { ja: 'フィード管理', en: 'Feeds', zh: '订阅源'},
  'settings.underDevelopment': { ja: 'この機能は現在開発中です', en: 'This feature is currently under development', zh: '此功能正在开发中'},
  'settings.profile': { ja: 'プロフィール', en: 'Profile', zh: '个人资料'},
  'settings.accountName': { ja: 'アカウント名', en: 'Account name', zh: '账户名称'},
  'settings.accountNameHint': { ja: 'このRSSリーダーアプリはあなた専用です。アカウント名はどこにも公開されないので、愛着の湧く好きな名前をつけてあげてください。', en: "This RSS reader app is just for you. Your account name won't be shown anywhere, so pick whatever feels right.", zh: "这个 RSS 阅读器只属于您。您的账户名称不会在任何地方显示，随便取个喜欢的名字就好。" },
  'settings.cancel': { ja: 'キャンセル', en: 'Cancel', zh: '取消'},
  'settings.save': { ja: '変更を保存', en: 'Save changes', zh: '保存更改'},
  'settings.saving': { ja: '保存中...', en: 'Saving...', zh: '保存中...'},
  'settings.saved': { ja: '保存しました', en: 'Saved', zh: '已保存'},

  // Reading
  'settings.imageStorage': { ja: '画像保存', en: 'Image Storage', zh: '图片存储'},
  'imageStorage.title': { ja: '画像ストレージ設定', en: 'Image Storage Settings', zh: '图片存储设置'},
  'imageStorage.desc': { ja: '記事内の画像をローカルに保存して永続化します', en: 'Save article images locally for permanent access', zh: '将文章图片保存到本地以永久访问'},
  'imageStorage.enabled': { ja: '画像保存を有効化', en: 'Enable image archiving', zh: '启用图片归档'},
  'imageStorage.enabledDesc': { ja: '有効にすると、記事ごとに画像保存ボタンが表示されます', en: 'When enabled, a save images button appears on each article', zh: '启用后，每篇文章会显示保存图片按钮'},
  'imageStorage.storagePath': { ja: '保存先パス', en: 'Storage path', zh: '存储路径'},
  'imageStorage.storagePathDesc': { ja: 'サーバー上の画像保存ディレクトリ（空欄はデフォルト）', en: 'Image storage directory on server (empty for default)', zh: '服务器上的图片存储目录（留空使用默认）'},
  'imageStorage.maxSize': { ja: '最大サイズ (MB)', en: 'Max size (MB)', zh: '最大大小（MB）'},
  'imageStorage.maxSizeDesc': { ja: '1画像あたりの最大サイズ', en: 'Maximum size per image', zh: '每张图片的最大大小'},
  'imageStorage.mode': { ja: 'ストレージモード', en: 'Storage mode', zh: '存储模式'},
  'imageStorage.modeLocal': { ja: 'ローカル', en: 'Local', zh: '本地'},
  'imageStorage.modeLocalDesc': { ja: 'サーバーのディスクに画像を保存します', en: 'Save images to the server\'s local disk', zh: '将图片保存到服务器本地磁盘'},
  'imageStorage.modeRemote': { ja: 'リモート', en: 'Remote', zh: '远程'},
  'imageStorage.modeRemoteDesc': { ja: '外部サービス（Imgur、Cloudflare Images 等）のAPIを通じて画像をアップロードし、記事内の画像URLをホスティング先に差し替えます。S3 / GCS は署名付きURLのプロキシが必要です', en: 'Upload images to external services like Imgur or Cloudflare Images via their API, replacing article image URLs with the hosted ones. S3 / GCS requires a signed-URL proxy', zh: '通过 API 将图片上传到 Imgur 或 Cloudflare Images 等外部服务，将文章图片 URL 替换为托管地址。S3/GCS 需要签名 URL 代理' },
  'imageStorage.url': { ja: 'アップロード先URL', en: 'Upload URL', zh: '上传 URL'},
  'imageStorage.urlPlaceholder': { ja: 'https://api.example.com/upload', en: 'https://api.example.com/upload', zh: 'https://api.example.com/upload'},
  'imageStorage.headers': { ja: 'リクエストヘッダー (JSON)', en: 'Request Headers (JSON)', zh: '请求头（JSON）'},
  'imageStorage.headersPlaceholder': { ja: '{"Authorization": "Bearer xxx"}', en: '{"Authorization": "Bearer xxx"}', zh: '{"Authorization": "Bearer xxx"}'},
  'imageStorage.headersConfigured': { ja: '設定済み', en: 'Configured', zh: '已配置'},
  'imageStorage.headersClear': { ja: 'ヘッダーを削除', en: 'Clear headers', zh: '清除请求头'},
  'imageStorage.fieldName': { ja: 'フィールド名', en: 'Field name', zh: '字段名'},
  'imageStorage.fieldNamePlaceholder': { ja: 'image', en: 'image', zh: 'image'},
  'imageStorage.respPath': { ja: 'レスポンスURLパス', en: 'Response URL path', zh: '响应 URL 路径'},
  'imageStorage.respPathPlaceholder': { ja: 'data.link', en: 'data.link', zh: 'data.link'},
  'imageStorage.saved': { ja: '設定を保存しました', en: 'Settings saved', zh: '设置已保存'},
  'imageStorage.test': { ja: 'テストアップロード', en: 'Test Upload', zh: '测试上传'},
  'imageStorage.testing': { ja: 'テスト中...', en: 'Testing...', zh: '测试中...'},
  'imageStorage.testSuccess': { ja: 'テスト成功', en: 'Test succeeded', zh: '测试成功'},
  'imageStorage.testFailed': { ja: 'テスト失敗', en: 'Test failed', zh: '测试失败'},
  'imageStorage.healthcheckUrl': { ja: 'ヘルスチェックURL', en: 'Healthcheck URL', zh: '健康检查 URL'},
  'imageStorage.healthcheckUrlPlaceholder': { ja: 'https://api.example.com/health', en: 'https://api.example.com/health', zh: 'https://api.example.com/health'},
  'imageStorage.healthcheckUrlDesc': { ja: '任意。設定するとリモートサービスの死活監視ができます', en: 'Optional. Configure to monitor remote service availability', zh: '可选。配置以监控远程服务可用性'},
  'imageStorage.healthcheck': { ja: 'ヘルスチェック', en: 'Healthcheck', zh: '健康检查'},
  'imageStorage.healthchecking': { ja: 'チェック中...', en: 'Checking...', zh: '检查中...'},
  'imageStorage.healthcheckOk': { ja: '正常', en: 'Healthy', zh: '正常'},
  'imageStorage.healthcheckFailed': { ja: '応答なし', en: 'Unreachable', zh: '不可达'},

  'settings.reading': { ja: '閲覧', en: 'Reading', zh: '阅读'},
  'settings.autoMarkRead': { ja: 'スクロールで自動既読', en: 'Auto-Mark As Read On Scroll', zh: '滚动时自动标为已读'},
  'settings.autoMarkReadDesc': {
    ja: 'スクロールして画面外に出た記事を自動的に既読にしますか？',
    en: 'Should articles be automatically marked as read when you scroll past them?',
    zh: '滚动经过文章时是否自动标为已读？'
  },
  'settings.autoMarkReadOn': { ja: 'オン', en: 'On', zh: '开'},
  'settings.autoMarkReadOff': { ja: 'オフ', en: 'Off', zh: '关'},
  'settings.unreadIndicator': { ja: '未読インジケーター', en: 'Unread Indicator', zh: '未读指示器'},
  'settings.unreadIndicatorDescDot': {
    ja: '記事リストに未読マーク（ドット）を表示しますか？',
    en: 'Show unread dot marks on the article list?',
    zh: '在文章列表中显示未读圆点标记？'
  },
  'settings.unreadIndicatorDescLine': {
    ja: '記事リストに未読マーク（ライン）を表示しますか？',
    en: 'Show unread line marks on the article list?',
    zh: '在文章列表中显示未读线条标记？'
  },
  'settings.unreadIndicatorOn': { ja: 'オン', en: 'On', zh: '开'},
  'settings.unreadIndicatorOff': { ja: 'オフ', en: 'Off', zh: '关'},
  'settings.showThumbnails': { ja: 'サムネイル', en: 'Thumbnails', zh: '缩略图'},
  'settings.showThumbnailsDesc': { ja: '記事一覧にサムネイル画像を表示しますか？', en: 'Show thumbnail images in the article list?', zh: '在文章列表中显示缩略图？'},
  'settings.showThumbnailsOn': { ja: 'オン', en: 'On', zh: '开'},
  'settings.showThumbnailsOff': { ja: 'オフ', en: 'Off', zh: '关'},
  'settings.showFeedActivity': { ja: 'フィードの更新状況', en: 'Feed Activity', zh: '订阅源活动'},
  'settings.showFeedActivityDesc': { ja: 'サイドバーにフィードの更新頻度やステータスを表示します', en: 'Show feed update frequency and status in the sidebar', zh: '在侧边栏显示订阅源更新频率和状态'},
  'settings.showFeedActivityOn': { ja: '表示する', en: 'Show', zh: '显示'},
  'settings.showFeedActivityOff': { ja: '表示しない', en: 'Hide', zh: '隐藏'},
  'settings.chatPosition': { ja: 'チャットボタンの位置', en: 'Chat Button Position', zh: '聊天按钮位置'},
  'settings.chatPositionDesc': { ja: '記事ページでのチャットボタンの表示位置を選択します', en: 'Choose where the chat button appears on article pages', zh: '选择聊天按钮在文章页面的显示位置'},
  'settings.chatPositionFab': { ja: 'フローティング', en: 'Floating', zh: '浮动'},
  'settings.chatPositionInline': { ja: 'アクションバー内', en: 'In action bar', zh: '在操作栏中'},
  'settings.articleOpenMode': { ja: '記事の開き方', en: 'Article Open Mode', zh: '文章打开方式'},
  'settings.articleOpenModeDesc': { ja: '記事をクリックしたときの表示方法を選択します', en: 'Choose how articles are displayed when clicked', zh: '选择点击文章时的显示方式'},
  'settings.articleOpenModePage': { ja: 'ページ遷移', en: 'Full page', zh: '整页'},
  'settings.articleOpenModeOverlay': { ja: 'オーバーレイ', en: 'Overlay', zh: '覆盖层'},
  'settings.keyboardNavigation': { ja: 'キーボードナビゲーション', en: 'Keyboard Navigation', zh: '键盘导航'},
  'settings.keyboardNavigationDesc': { ja: 'j/k キーで記事リストを移動し、b でブックマーク、; で元記事を開きます', en: 'Navigate the article list with j/k, bookmark with b, and open the original article with ;', zh: '使用 j/k 导航文章列表，b 添加书签，; 打开原文' },
  'settings.keyboardNavigationOn': { ja: '有効', en: 'On', zh: '开'},
  'settings.keyboardNavigationOff': { ja: '無効', en: 'Off', zh: '关'},
  'settings.keybindings': { ja: 'キーバインド設定', en: 'Key Bindings', zh: '快捷键绑定'},
  'settings.keybindingsDesc': { ja: '各アクションに割り当てるキーを変更できます', en: 'Customize the key assigned to each action', zh: '自定义每个操作的快捷键'},
  'settings.keybindingsNext': { ja: '次の記事', en: 'Next article', zh: '下一篇文章'},
  'settings.keybindingsPrev': { ja: '前の記事', en: 'Previous article', zh: '上一篇文章'},
  'settings.keybindingsBookmark': { ja: 'ブックマーク', en: 'Bookmark', zh: '书签'},
  'settings.keybindingsOpenExternal': { ja: '元記事を開く', en: 'Open original', zh: '打开原文'},
  'settings.keybindingsDuplicate': { ja: '同じキーが複数のアクションに割り当てられています', en: 'Duplicate key assignment detected', zh: '检测到重复的快捷键分配'},
  'feeds.inactive': { ja: 'inactive', en: 'inactive', zh: '未活跃'},
  'metrics.articles': { ja: '記事', en: 'articles', zh: '篇文章'},
  'metrics.perWeek': { ja: '/週', en: '/wk', zh: '/周'},
  'metrics.lastUpdated': { ja: '最終更新', en: 'last', zh: '最近'},
  'metrics.inactive': { ja: '更新停止', en: 'inactive', zh: '未活跃'},
  'metrics.chars': { ja: '文字', en: 'chars', zh: '字符'},
  'metrics.preview': { ja: '12記事 · 2.1/週 · 3日前', en: '12 articles · 2.1/wk · 3d ago', zh: '12 篇文章 · 2.1/周 · 3 天前'},
  'settings.internalLinks': { ja: '内部リンク書き換え', en: 'Internal Link Rewriting', zh: '内部链接重写'},
  'settings.internalLinksDesc': {
    ja: `記事内のリンク先が ${APP_NAME} に存在する場合、${APP_NAME} 内リンクに書き換えます`,
    en: `Rewrite links in articles to ${APP_NAME} internal URLs when the linked article exists in your ${APP_NAME}`,
    zh: `当链接的文章存在于 ${APP_NAME} 中时，将文章中的链接重写为 ${APP_NAME} 内部 URL`
  },
  'settings.internalLinksOn': { ja: 'オン', en: 'On', zh: '开'},
  'settings.internalLinksOff': { ja: 'オフ', en: 'Off', zh: '关'},
  'settings.categoryUnreadOnly': { ja: 'カテゴリで未読のみ表示', en: 'Show Only Unread In Categories', zh: '分类中仅显示未读'},
  'settings.categoryUnreadOnlyDesc': {
    ja: 'カテゴリビューで未読記事のみを表示します（Inboxと同様の動作）',
    en: 'Show only unread articles in category views (same behavior as Inbox)',
    zh: '在分类视图中仅显示未读文章（与收件箱行为相同）'
  },
  'settings.categoryUnreadOnlyOn': { ja: 'オン', en: 'On', zh: '开'},
  'settings.categoryUnreadOnlyOff': { ja: 'オフ', en: 'Off', zh: '关'},

  // Language
  'settings.language': { ja: '言語', en: 'Language', zh: '语言'},
  'settings.languageDesc': { ja: 'UIの表示言語', en: 'Display language for UI', zh: '界面显示语言'},
  'settings.languageJa': { ja: '日本語', en: 'Japanese', zh: '日语' },
  'settings.languageEn': { ja: '英語', en: 'English', zh: '英语' },
  'settings.languageZh': { ja: '中国語', en: 'Chinese', zh: '简体中文' },

  // Translation target language
  'settings.translateTargetLang': { ja: '翻訳先言語', en: 'Translation language', zh: '翻译目标语言'},
  'settings.translateTargetLangDesc': { ja: '記事をどの言語に翻訳するか', en: 'Language to translate articles into', zh: '将文章翻译为哪种语言'},
  'settings.translateTargetLangAuto': { ja: 'UI言語と同じ', en: 'Same as UI language', zh: '与界面语言相同'},

  // Data (OPML)
  'settings.data': { ja: 'データ', en: 'Data', zh: '数据'},
  'settings.importExport': { ja: 'フィード移行', en: 'Feed Migration', zh: '订阅源迁移'},
  'settings.importOpml': { ja: 'OPML インポート', en: 'Import OPML', zh: '导入 OPML'},
  'settings.importOpmlDesc': { ja: '他の RSS リーダーからフィードをインポート', en: 'Import feeds from another RSS reader', zh: '从其他 RSS 阅读器导入订阅源'},
  'settings.exportOpml': { ja: 'OPML エクスポート', en: 'Export OPML', zh: '导出 OPML'},
  'settings.exportOpmlDesc': { ja: 'フィード一覧を OPML ファイルとしてダウンロード', en: 'Download your feeds as an OPML file', zh: '将订阅源下载为 OPML 文件'},
  'settings.importing': { ja: 'インポート中...', en: 'Importing...', zh: '导入中...'},
  'settings.previewing': { ja: 'プレビュー中...', en: 'Loading preview...', zh: '加载预览...'},
  'settings.feedsSelected': { ja: '{selected} / {total} フィードを選択中（{duplicates} 件は登録済み）', en: '{selected} of {total} feeds selected ({duplicates} already subscribed)', zh: '已选择 {selected} / {total} 个订阅源（{duplicates} 个已订阅）'},
  'settings.selectAll': { ja: 'すべて選択', en: 'Select All', zh: '全选'},
  'settings.deselectAll': { ja: 'すべて解除', en: 'Deselect All', zh: '取消全选'},
  'settings.alreadySubscribed': { ja: '登録済み', en: 'Already subscribed', zh: '已订阅'},
  'settings.importSelected': { ja: '{count} フィードをインポート', en: 'Import {count} feeds', zh: '导入 {count} 个订阅源'},
  'settings.dbBackup': { ja: 'データベースバックアップ', en: 'Database Backup', zh: '数据库备份'},
  'settings.dbBackupDesc': { ja: 'SQLite データベースファイルのダウンロード・リストア', en: 'Download or restore the SQLite database file', zh: '下载或恢复 SQLite 数据库文件'},
  'settings.articlePurge': { ja: '記事の自動クリーンアップ', en: 'Article Cleanup', zh: '文章清理'},
  'settings.articlePurgeDesc': { ja: '古い記事を定期的に削除してストレージを節約', en: 'Periodically delete old articles to save storage', zh: '定期删除旧文章以节省存储'},
  'settings.comingSoon': { ja: '実装予定', en: 'Coming soon', zh: '即将推出'},
  'settings.retentionEnabled': { ja: '自動クリーンアップ', en: 'Auto cleanup', zh: '自动清理'},
  'settings.retentionReadDays': { ja: '既読記事の保持日数', en: 'Keep read articles for', zh: '保留已读文章'},
  'settings.retentionReadDaysDesc': { ja: '既読から指定日数経過した記事を削除', en: 'Delete articles after this many days since read', zh: '已读文章在指定天数后删除'},
  'settings.retentionUnreadDays': { ja: '未読記事の保持日数', en: 'Keep unread articles for', zh: '保留未读文章'},
  'settings.retentionUnreadDaysDesc': { ja: '取得から指定日数経過した未読記事を削除', en: 'Delete unread articles after this many days since fetched', zh: '未读文章在获取后指定天数删除'},
  'settings.retentionDays': { ja: '日', en: 'days', zh: '天'},
  'settings.retentionProtectedNote': { ja: 'ブックマーク・いいね済みの記事は削除されません', en: 'Bookmarked and liked articles are never deleted', zh: '书签和点赞的文章不会被删除'},
  'settings.retentionPurgeNow': { ja: '今すぐクリーンアップ', en: 'Clean up now', zh: '立即清理'},
  'settings.retentionPurgeConfirm': { ja: '{count} 件の記事を削除します。この操作は元に戻せません。よろしいですか？', en: 'This will delete {count} articles. This cannot be undone. Continue?', zh: '将删除 {count} 篇文章。此操作不可撤销。是否继续？'},
  'settings.retentionPurgeResult': { ja: '{count} 件の記事を削除しました', en: 'Deleted {count} articles', zh: '已删除 {count} 篇文章'},
  'settings.retentionEligible': { ja: '既読: {read} 件 ／ 未読: {unread} 件が対象', en: '{read} read / {unread} unread articles eligible', zh: '已读 {read} 篇 / 未读 {unread} 篇符合条件'},
  'settings.retentionPurging': { ja: 'クリーンアップ中...', en: 'Cleaning up...', zh: '清理中...'},

  // Categories
  'category.add': { ja: 'カテゴリを追加', en: 'Add category', zh: '添加分类'},
  'category.namePlaceholder': { ja: 'カテゴリ名', en: 'Category name', zh: '分类名称'},
  'category.rename': { ja: '名前を変更', en: 'Rename', zh: '重命名'},
  'category.delete': { ja: 'カテゴリを削除', en: 'Delete category', zh: '删除分类'},
  'category.deleteConfirm': {
    ja: '${name} を削除しますか？配下のフィードはトップに移動します。',
    en: 'Delete ${name}? Feeds will be moved to top.',
    zh: '确定删除 ${name}？订阅源将移至顶部。'
  },
  'category.markAllRead': { ja: 'すべて既読にする', en: 'Mark all as read', zh: '全部标为已读'},
  'category.moveToCategory': { ja: 'カテゴリに移動', en: 'Move to category', zh: '移动到分类'},
  'category.uncategorized': { ja: 'トップ', en: 'Top', zh: '顶部'},

  // Multi-select
  'feeds.selectedCount': { ja: '${count} 件選択中', en: '${count} feeds selected', zh: '已选择 ${count} 个'},
  'feeds.bulkMarkAllRead': { ja: 'すべて既読にする', en: 'Mark all as read', zh: '全部标为已读'},
  'feeds.bulkMoveToCategory': { ja: 'カテゴリに移動', en: 'Move to category', zh: '移动到分类'},
  'feeds.bulkFetch': { ja: 'フェッチ', en: 'Fetch articles', zh: '获取文章'},
  'feeds.bulkDelete': { ja: '${count} 件削除', en: 'Delete ${count} feeds', zh: '删除 ${count} 个订阅源'},
  'feeds.bulkDeleteConfirm': {
    ja: '${count} 件のフィードを削除しますか？紐づく記事もすべて削除されます。',
    en: 'Delete ${count} feeds? All associated articles will also be deleted.',
    zh: '确定删除 ${count} 个订阅源？所有关联的文章也将被删除。'
  },

  // Highlight theme
  'settings.highlightTheme': { ja: 'コードハイライト', en: 'Code Highlighting', zh: '代码高亮'},
  'settings.highlightThemeDesc': { ja: '記事内のコードブロックに適用される配色です。「自動」は配色テーマに合わせて切り替わります', en: 'Applied to code blocks in articles. "Auto" switches based on the color theme', zh: '应用于文章中的代码块。「自动」根据颜色主题切换' },
  'settings.highlightThemeAuto': { ja: '自動（テーマ連動）', en: 'Auto (follows theme)', zh: '自动（跟随主题）'},
  'settings.highlightThemeNone': { ja: 'なし', en: 'None', zh: '无'},

  // Custom themes
  'settings.customThemes': { ja: 'カスタムテーマ', en: 'Custom Themes', zh: '自定义主题'},
  'settings.customThemesDesc': { ja: 'JSON ファイルまたはテキストからテーマをインポートできます', en: 'Import themes from a JSON file or text', zh: '从 JSON 文件或文本导入主题'},
  'settings.importTheme': { ja: 'テーマをインポート', en: 'Import Theme', zh: '导入主题'},
  'settings.importFromFile': { ja: 'ファイルを選択', en: 'Choose File', zh: '选择文件'},
  'settings.importFromText': { ja: 'JSON を貼り付け', en: 'Paste JSON', zh: '粘贴 JSON'},
  'settings.importButton': { ja: 'インポート', en: 'Import', zh: '导入'},
  'settings.deleteTheme': { ja: 'テーマを削除', en: 'Delete theme', zh: '删除主题'},
  'settings.deleteThemeConfirm': { ja: 'このカスタムテーマを削除しますか？', en: 'Delete this custom theme?', zh: '确定删除此自定义主题？'},
  'settings.themeImported': { ja: 'テーマをインポートしました', en: 'Theme imported successfully', zh: '主题导入成功'},
  'settings.themeDeleted': { ja: 'テーマを削除しました', en: 'Theme deleted', zh: '主题已删除'},
  'settings.themeUpdated': { ja: 'テーマを更新しました', en: 'Theme updated successfully', zh: '主题更新成功'},
  'settings.editTheme': { ja: 'テーマを編集', en: 'Edit theme', zh: '编辑主题'},
  'settings.updateButton': { ja: '更新', en: 'Update', zh: '更新'},
  'settings.sampleButton': { ja: 'サンプル', en: 'Sample', zh: '示例'},
  'settings.themeLimit': { ja: 'カスタムテーマは最大20個までです', en: 'Maximum 20 custom themes allowed', zh: '最多允许 20 个自定义主题'},

  // Theme JSON validation errors
  'themeJson.invalidJson': { ja: '無効なJSON: オブジェクトが必要です', en: 'Invalid JSON: expected an object', zh: '无效 JSON：需要对象'},
  'themeJson.missingName': { ja: '必須フィールド "name" がありません', en: 'Missing required field: "name"', zh: '缺少必填字段："name"'},
  'themeJson.invalidName': { ja: '"name" は小文字英数字・ハイフン・アンダースコアのみ使用可能です（入力値: "${name}"）', en: '"name" must be lowercase alphanumeric, hyphens, or underscores (got "${name}")', zh: '"name" 只能使用小写字母、数字、连字符或下划线（输入值："${name}"）'},
  'themeJson.builtinConflict': { ja: '"${name}" はビルトインテーマ名と競合しています', en: '"${name}" conflicts with a built-in theme name', zh: '"${name}" 与内置主题名冲突'},
  'themeJson.duplicateName': { ja: '"${name}" という名前のカスタムテーマは既に存在します', en: 'A custom theme named "${name}" already exists', zh: '名为 "${name}" 的自定义主题已存在'},
  'themeJson.missingLabel': { ja: '必須フィールド "label" がありません', en: 'Missing required field: "label"', zh: '缺少必填字段："label"'},
  'themeJson.missingColors': { ja: '必須フィールド "colors" がありません', en: 'Missing required field: "colors"', zh: '缺少必填字段："colors"'},
  'themeJson.missingColorsVariant': { ja: '"colors.${variant}" は必須です', en: '"colors.${variant}" is required', zh: '"colors.${variant}" 为必填项'},
  'themeJson.missingColor': { ja: '必須カラー "${path}" がありません', en: 'Missing required color "${path}"', zh: '缺少必填颜色 "${path}"'},

  // Mascot
  'settings.mascot': { ja: 'マスコット', en: 'Mascot', zh: '吉祥物'},
  'settings.mascotDesc': { ja: '記事を全て読み終えたときに表示されるピクセルアートのマスコットです', en: 'Pixel art mascot shown when all articles are read', zh: '所有文章读完后显示的像素风吉祥物'},
  'settings.mascotOff': { ja: 'オフ', en: 'Off', zh: '关'},
  'settings.mascotDreamPuff': { ja: 'Dream Puff', en: 'Dream Puff', zh: 'Dream Puff'},
  'settings.mascotSleepyGiant': { ja: 'Sleepy Giant', en: 'Sleepy Giant', zh: 'Sleepy Giant'},
  'settings.mascotRequiresAutoMark': { ja: '「スクロールで自動既読」がオンのときのみ設定できます', en: 'Requires "Auto-Mark As Read On Scroll" to be enabled', zh: '需要启用"滚动时自动标为已读"'},

  // Article font
  'settings.articleFont': { ja: '記事フォント', en: 'Article Font', zh: '文章字体'},
  'settings.articleFontDesc': { ja: '記事一覧のタイトル・抜粋と記事本文に適用されます。Google Fontsから読み込むため初回表示が少し遅れる場合があります', en: 'Applied to article list titles, excerpts, and article body. Loaded from Google Fonts, so the first render may be slightly delayed', zh: '应用于文章列表标题、摘要和正文。从 Google Fonts 加载，首次渲染可能稍有延迟' },
  'settings.layout': { ja: 'レイアウト', en: 'Layout', zh: '布局'},
  'settings.layoutDesc': { ja: '記事一覧の並べ方を変更します。リスト・カード・マガジン・コンパクトから選べます', en: 'Change how articles are displayed. Choose from list, card, magazine, or compact views', zh: '更改文章显示方式。可选列表、卡片、杂志或紧凑视图' },
  'settings.layoutList': { ja: 'リスト', en: 'List', zh: '列表'},
  'settings.layoutCard': { ja: 'カード', en: 'Card', zh: '卡片'},
  'settings.layoutMagazine': { ja: 'マガジン', en: 'Magazine', zh: '杂志'},
  'settings.layoutCompact': { ja: 'コンパクト', en: 'Compact', zh: '紧凑'},

  // ConfirmDialog
  'confirm.cancel': { ja: 'キャンセル', en: 'Cancel', zh: '取消'},

  // Setup
  'setup.title': { ja: '初期設定', en: 'Initial Setup', zh: '初始设置'},
  'setup.subtitle': { ja: 'アカウントを作成して始めましょう', en: 'Create your account to get started', zh: '创建账户以开始使用'},
  'setup.confirmPassword': { ja: 'パスワード（確認）', en: 'Confirm password', zh: '确认密码'},
  'setup.submit': { ja: 'アカウントを作成', en: 'Create Account', zh: '创建账户'},
  'setup.creating': { ja: '作成中...', en: 'Creating...', zh: '创建中...'},
  'setup.passwordTooShort': { ja: 'パスワードは8文字以上にしてください', en: 'Password must be at least 8 characters', zh: '密码至少 8 个字符'},
  'setup.passwordMismatch': { ja: 'パスワードが一致しません', en: 'Passwords do not match', zh: '密码不匹配'},
  'setup.failed': { ja: 'アカウントの作成に失敗しました', en: 'Failed to create account', zh: '创建账户失败'},
  'setup.networkError': { ja: 'ネットワークエラー', en: 'Network error', zh: '网络错误'},

  // Login
  'login.title': { ja: 'ログイン', en: 'Sign in', zh: '登录'},
  'login.subtitle': { ja: 'メールアドレスでログイン', en: 'Sign in with your email', zh: '使用邮箱登录'},
  'login.email': { ja: 'メールアドレス', en: 'Email', zh: '邮箱'},
  'login.password': { ja: 'パスワード', en: 'Password', zh: '密码'},
  'login.submit': { ja: 'ログイン', en: 'Sign in', zh: '登录'},
  'login.loading': { ja: 'ログイン中...', en: 'Signing in...', zh: '登录中...'},
  'login.failed': { ja: 'ログインに失敗しました', en: 'Login failed', zh: '登录失败'},
  'login.networkError': { ja: 'ネットワークエラー', en: 'Network error', zh: '网络错误'},

  // Login — passkey
  'login.passkey': { ja: 'パスキーでログイン', en: 'Sign in with passkey', zh: '使用通行密钥登录'},
  'login.or': { ja: 'または', en: 'or', zh: '或'},
  'login.passkeyError': { ja: 'パスキー認証に失敗しました', en: 'Passkey authentication failed', zh: '通行密钥认证失败'},
  'login.github': { ja: 'GitHubでログイン', en: 'Sign in with GitHub', zh: '使用 GitHub 登录'},
  'login.githubError': { ja: 'GitHub認証に失敗しました', en: 'GitHub authentication failed', zh: 'GitHub 认证失败'},

  // Settings — AI
  'settings.integration': { ja: 'AI・翻訳', en: 'AI & Translation', zh: 'AI 与翻译'},
  'integration.providerConfig': { ja: 'プロバイダー設定', en: 'Provider Configuration', zh: '提供商配置'},
  'integration.providerConfigDesc': { ja: 'APIキーや認証情報を管理します', en: 'Manage API keys and authentication', zh: '管理 API 密钥和认证'},
  'integration.llmProviderConfig': { ja: 'LLM プロバイダー', en: 'LLM Providers', zh: 'LLM 提供商'},
  'integration.llmProviderConfigDesc': { ja: 'チャット・記事の要約・記事の翻訳に使用します。1つ以上の API キーが設定されていないとこれらの機能は利用できません', en: 'Used for chat, article summarization, and article translation. At least one API key must be configured to use these features', zh: '用于聊天、文章摘要和文章翻译。至少需要配置一个 API 密钥才能使用这些功能' },
  'integration.translateServiceConfig': { ja: '翻訳サービス', en: 'Translation Services', zh: '翻译服务'},
  'integration.translateServiceConfigDesc': { ja: '記事の翻訳に使用します。LLM プロバイダーまたはこちらのいずれかが設定されていないと翻訳は利用できません', en: 'Used for article translation. Either an LLM provider or one of these services must be configured to use translation', zh: '用于文章翻译。需要配置 LLM 提供商或以下翻译服务之一' },
  'integration.taskSettings': { ja: '機能ごとのプロバイダー', en: 'Provider per Feature', zh: '按功能选择提供商'},
  'integration.taskSettingsDesc': { ja: '要約・翻訳・チャットそれぞれでどのプロバイダーとモデルを使うかを設定します', en: 'Choose which provider and model to use for summarization, translation, and chat', zh: '选择用于摘要、翻译和聊天的提供商和模型' },
  'integration.taskSettingsNoKeys': { ja: 'API キーが設定されていないため変更できません。上のセクションで API キーを設定してください', en: 'Cannot change settings because no API keys are configured. Please set up an API key in the section above', zh: '无法更改设置，因为未配置 API 密钥。请在上方配置 API 密钥' },
  'integration.selectProviderFirst': { ja: 'プロバイダーを選択してください', en: 'Select a provider first', zh: '请先选择提供商'},
  'integration.selectModel': { ja: 'モデルを選択', en: 'Select a model', zh: '选择模型'},
  'integration.task.chat': { ja: 'チャット', en: 'Chat', zh: '聊天'},
  'integration.task.summary': { ja: '要約', en: 'Summary', zh: '摘要'},
  'integration.task.translate': { ja: '翻訳', en: 'Translation', zh: '翻译'},
  'integration.maxTokens': { ja: '最大出力トークン数', en: 'Max output tokens', zh: '最大输出 token 数'},
  'integration.maxTokensDesc': { ja: '空欄でデフォルト値を使用。コンテキスト長が短いローカルLLMでは小さくしてください', en: 'Empty uses the default. Lower this for local LLMs with small context windows', zh: '留空使用默认值。上下文窗口较小的本地 LLM 请调低此值'},
  'integration.modeLLM': { ja: 'LLM', en: 'LLM', zh: 'LLM'},
  'integration.modeTranslateService': { ja: '翻訳サービス', en: 'Translation Service', zh: '翻译服务'},
  'integration.googleTranslateNote': {
    ja: 'Google Cloud Translation API v2 (Basic) を使用します。NMT（ニューラル機械翻訳）による高速な翻訳で、LLMより低品質ですが即座に結果が返ります。v3 (Advanced) の LLM 翻訳には未対応です。',
    en: 'Uses Google Cloud Translation API v2 (Basic). NMT-based fast translation — lower quality than LLM but returns results instantly. v3 (Advanced) LLM translation is not supported.',
    zh: '使用 Google Cloud Translation API v2（基础版）。基于 NMT 的快速翻译 — 质量低于 LLM 但即时返回结果。不支持 v3（高级版）LLM 翻译。'
  },
  'integration.googleTranslateFreeTier': {
    ja: '料金: 月50万文字まで無料、以降 $20 / 100万文字',
    en: 'Pricing: Free up to 500K chars/month, then $20 / 1M chars',
    zh: '定价：每月 50 万字符免费，之后 $20 / 百万字符'
  },
  'integration.googleTranslateUsage': {
    ja: '今月の使用量: ${used} / ${limit}',
    en: 'This month: ${used} / ${limit}',
    zh: '本月：${used} / ${limit}'
  },
  'integration.deeplNote': {
    ja: 'DeepL API v2 を使用します。高品質なニューラル機械翻訳で、特に日欧言語間の翻訳精度が高く評価されています。Free プランと Pro プランに対応しています。',
    en: 'Uses DeepL API v2. High-quality neural machine translation, especially well-regarded for European-Japanese translation accuracy. Supports both Free and Pro plans.',
    zh: '使用 DeepL API v2。高质量神经机器翻译，尤以欧洲语言与日语之间的翻译精度著称。支持免费版和专业版。'
  },
  'integration.deeplFreeTier': {
    ja: '料金: API Free は月50万文字まで無料、API Pro は月額¥630 + ¥2,500 / 100万文字',
    en: 'Pricing: API Free up to 500K chars/month, API Pro ¥630/mo + ¥2,500 / 1M chars',
    zh: '定价：API 免费版每月 50 万字符，API 专业版 ¥630/月 + ¥2,500/百万字符'
  },
  'integration.deeplUsage': {
    ja: '今月の使用量: ${used} / ${limit}',
    en: 'This month: ${used} / ${limit}',
    zh: '本月：${used} / ${limit}'
  },

  // Settings — security
  'settings.security': { ja: 'セキュリティ', en: 'Security', zh: '安全'},
  'settings.edit': { ja: '変更', en: 'Edit', zh: '编辑'},
  'settings.accountCredentials': { ja: 'アカウント情報', en: 'Account credentials', zh: '账户凭据'},
  'settings.password': { ja: 'パスワード', en: 'Password', zh: '密码'},
  'settings.passwordAuth': { ja: 'パスワード認証', en: 'Password authentication', zh: '密码认证'},
  'settings.passwordAuthDesc': { ja: 'パスワードによるログインを許可', en: 'Allow login with password', zh: '允许使用密码登录'},
  'settings.passwordAuthHint': { ja: 'メールアドレスはログイン用のIDとして使っているだけで、メール送信などには一切使われません。パスキーやGitHub連携を設定済みなら、パスワード認証はオフにしておくのがおすすめです。', en: "Your email is only used as a login ID — it's never used to send emails. If you've set up passkeys or GitHub login, we recommend turning password authentication off.", zh: "您的邮箱仅用作登录 ID — 不会用于发送邮件。如果已设置通行密钥或 GitHub 登录，建议关闭密码认证。"},
  'settings.passkeys': { ja: 'パスキー', en: 'Passkeys', zh: '通行密钥'},
  'settings.addPasskey': { ja: 'パスキーを追加', en: 'Add passkey', zh: '添加通行密钥'},
  'settings.deletePasskey': { ja: '削除', en: 'Delete', zh: '删除'},
  'settings.noPasskeys': { ja: '登録済みのパスキーはありません', en: 'No passkeys registered', zh: '未注册通行密钥'},
  'settings.cannotDisablePassword': { ja: '他のログイン方法が有効でないため無効にできません', en: 'Cannot disable without an alternative login method', zh: '没有其他登录方式时无法禁用'},
  'settings.cannotDeleteLastPasskey': { ja: '他のログイン方法が有効でないため、最後のパスキーは削除できません', en: 'Cannot delete the last passkey without an alternative login method', zh: '没有其他登录方式时无法删除最后一个通行密钥'},
  'settings.multiDevice': { ja: 'マルチデバイス', en: 'Multi-device', zh: '多设备'},
  'settings.singleDevice': { ja: 'シングルデバイス', en: 'Single-device', zh: '单设备'},
  'settings.passkeyAdded': { ja: 'パスキーを追加しました', en: 'Passkey added', zh: '通行密钥已添加'},
  'settings.passkeyDeleted': { ja: 'パスキーを削除しました', en: 'Passkey deleted', zh: '通行密钥已删除'},

  // Settings — API tokens
  'settings.apiTokens': { ja: 'APIトークン', en: 'API Tokens', zh: 'API 令牌'},
  'settings.apiTokensDesc': { ja: '外部スクリプトやツールからAPIにアクセスするためのトークンを管理します', en: 'Manage tokens for accessing the API from external scripts and tools', zh: '管理用于从外部脚本和工具访问 API 的令牌'},
  'settings.createToken': { ja: 'トークンを作成', en: 'Create token', zh: '创建令牌'},
  'settings.tokenName': { ja: '名前', en: 'Name', zh: '名称'},
  'settings.tokenNamePlaceholder': { ja: '例: 監視スクリプト', en: 'e.g. Monitoring script', zh: '例如监控脚本'},
  'settings.tokenScopes': { ja: '権限', en: 'Scopes', zh: '权限范围'},
  'settings.tokenScopeRead': { ja: '読み取り専用', en: 'Read only', zh: '只读'},
  'settings.tokenScopeReadWrite': { ja: '読み書き', en: 'Read & Write', zh: '读写'},
  'settings.tokenGenerate': { ja: '生成', en: 'Generate', zh: '生成'},
  'settings.tokenCreated': { ja: 'トークンを作成しました', en: 'Token created', zh: '令牌已创建'},
  'settings.tokenCreatedCopy': { ja: 'トークンが生成されました。今すぐコピーしてください：', en: 'Your token has been generated. Copy it now:', zh: '您的令牌已生成。请立即复制：'},
  'settings.tokenOnceWarning': { ja: 'このトークンは二度と表示されません。安全な場所に保管してください。', en: 'This token will not be shown again. Store it in a safe place.', zh: '此令牌不会再次显示。请妥善保管。'},
  'settings.tokenDeleted': { ja: 'トークンを削除しました', en: 'Token deleted', zh: '令牌已删除'},
  'settings.tokenDelete': { ja: '削除', en: 'Delete', zh: '删除'},
  'settings.tokenLastUsed': { ja: '最終使用:', en: 'Last used:', zh: '上次使用：'},
  'settings.noTokens': { ja: 'APIトークンはまだありません', en: 'No API tokens yet', zh: '暂无 API 令牌'},

  // Settings — email change
  'settings.changeEmail': { ja: 'メールアドレス変更', en: 'Change Email', zh: '更改邮箱'},
  'settings.currentEmail': { ja: '現在のメールアドレス', en: 'Current email', zh: '当前邮箱'},
  'settings.newEmail': { ja: '新しいメールアドレス', en: 'New email address', zh: '新邮箱地址'},
  'settings.emailChanged': { ja: 'メールアドレスを変更しました', en: 'Email changed successfully', zh: '邮箱更改成功'},
  'settings.emailChangeFailed': { ja: 'メールアドレスの変更に失敗しました', en: 'Failed to change email', zh: '邮箱更改失败'},
  'settings.passwordForEmailChange': { ja: 'パスワード（確認用）', en: 'Password (for verification)', zh: '密码（用于验证）'},

  // Settings — password change
  'settings.changePassword': { ja: 'パスワード変更', en: 'Change Password', zh: '更改密码'},
  'settings.currentPassword': { ja: '現在のパスワード', en: 'Current password', zh: '当前密码'},
  'settings.newPassword': { ja: '新しいパスワード', en: 'New password', zh: '新密码'},
  'settings.confirmPassword': { ja: '新しいパスワード（確認）', en: 'Confirm new password', zh: '确认新密码'},
  'settings.passwordChanged': { ja: 'パスワードを変更しました', en: 'Password changed successfully', zh: '密码更改成功'},
  'settings.passwordChangeFailed': { ja: 'パスワードの変更に失敗しました', en: 'Failed to change password', zh: '密码更改失败'},
  'settings.passwordMismatch': { ja: 'パスワードが一致しません', en: 'Passwords do not match', zh: '密码不匹配'},
  'settings.passwordTooShort': { ja: 'パスワードは8文字以上にしてください', en: 'Password must be at least 8 characters', zh: '密码至少 8 个字符'},

  // Password strength
  'password.tooShort': { ja: '8文字以上必要です', en: 'At least 8 characters required', zh: '至少需要 8 个字符'},
  'password.weak': { ja: '弱い', en: 'Weak', zh: '弱'},
  'password.fair': { ja: '普通', en: 'Fair', zh: '一般'},
  'password.strong': { ja: '強い', en: 'Strong', zh: '强'},

  // Settings — GitHub OAuth
  'settings.githubOauth': { ja: 'GitHub OAuth', en: 'GitHub OAuth', zh: 'GitHub OAuth'},
  'settings.githubOauthDesc': { ja: 'GitHubアカウントによるログインを許可', en: 'Allow login with GitHub account', zh: '允许使用 GitHub 账户登录'},
  'settings.githubClientId': { ja: 'Client ID', en: 'Client ID', zh: 'Client ID'},
  'settings.githubClientSecret': { ja: 'Client Secret', en: 'Client Secret', zh: 'Client Secret'},
  'settings.githubAllowedUsers': { ja: '許可ユーザー', en: 'Allowed users', zh: '允许的用户'},
  'settings.githubAllowedUsersDesc': {
    ja: 'GitHub OAuthは本来誰でもログインできる仕組みのため、このアプリでは許可するユーザーを明示的に制限しています。\n\n空欄の場合はOAuth Appを作成したオーナーのみがログインできます。他のユーザーにも許可する場合はGitHubユーザー名をカンマ区切りで入力してください。',
    en: 'GitHub OAuth normally allows anyone to log in, so this app explicitly restricts access.\n\nIf empty, only the owner who created the OAuth App can log in. To allow others, enter their GitHub usernames separated by commas.',
    zh: 'GitHub OAuth 通常允许任何人登录，因此此应用明确限制访问。\n\n如果为空，只有创建 OAuth 应用的所有者可以登录。要允许其他人登录，请输入他们的 GitHub 用户名，用逗号分隔。'
  },
  'settings.githubAllowedUsersPlaceholder': { ja: '空欄 = Appオーナーのみ', en: 'Empty = App owner only', zh: '留空 = 仅应用所有者'},
  'settings.githubCallbackUrl': { ja: 'Callback URL', en: 'Callback URL', zh: 'Callback URL'},
  'settings.githubGuideTitle': { ja: 'セットアップガイド', en: 'Setup guide', zh: '设置指南'},
  'settings.githubGuideStep1': { ja: 'を開き、OAuth Apps → New OAuth App をクリック', en: ', then click OAuth Apps → New OAuth App', zh: '，然后点击 OAuth Apps → New OAuth App'},
  'settings.githubGuideStep2': { ja: '以下を入力して Register application をクリック:', en: 'Fill in the following and click Register application:', zh: '填写以下信息并点击 Register application：'},
  'settings.githubGuideAppName': { ja: '任意の名前', en: 'Any name', zh: '任意名称'},
  'settings.githubGuideStep3': { ja: '作成後に表示される Client ID と Client Secret を下のフォームに貼り付けて保存', en: 'Copy the Client ID and Client Secret shown after creation, paste them below, and save', zh: '复制创建后显示的 Client ID 和 Client Secret，粘贴到下方并保存'},
  'settings.githubSave': { ja: '保存', en: 'Save', zh: '保存'},
  'settings.githubSaved': { ja: 'GitHub OAuth設定を保存しました', en: 'GitHub OAuth settings saved', zh: 'GitHub OAuth 设置已保存'},
  'settings.githubNotConfigured': { ja: 'Client IDとClient Secretを設定してください', en: 'Set Client ID and Client Secret first', zh: '请先设置 Client ID 和 Client Secret'},
  'settings.cannotDisableGithub': { ja: '他のログイン方法が有効でないため無効にできません', en: 'Cannot disable without an alternative login method', zh: '没有其他登录方式时无法禁用'},

  // Logout
  'sidebar.logout': { ja: 'ログアウト', en: 'Log out', zh: '退出登录'},

  // Home page — time-based greetings
  'home.greeting.morning': { ja: 'おはよう、{name}', en: 'Good morning, {name}', zh: '早上好，{name}'},
  'home.greeting.afternoon': { ja: 'こんにちは、{name}', en: 'Good afternoon, {name}', zh: '下午好，{name}'},
  'home.greeting.evening': { ja: 'こんばんは、{name}', en: 'Good evening, {name}', zh: '晚上好，{name}'},
  // Home page — random fallback (outside greeting windows)
  'home.greeting.random.0': { ja: '何について調べましょうか？', en: 'What would you like to explore?', zh: '想探索些什么？'},
  'home.greeting.random.1': { ja: '今日はどんな記事を読みますか？', en: 'What would you like to read today?', zh: '今天想读什么？'},
  'home.greeting.random.2': { ja: '何かお手伝いできることはありますか？', en: 'How can I help you?', zh: '有什么我能帮忙的？'},
  'home.greeting.random.3': { ja: '気になるトピックはありますか？', en: 'Any topics on your mind?', zh: '有什么感兴趣的话题吗？'},
  'home.greeting.random.4': { ja: '何から始めましょうか？', en: 'Where shall we start?', zh: '从哪里开始？'},
  'home.placeholder': { ja: '記事について何でも聞いてください...', en: 'Ask anything about your articles...', zh: '随便问关于文章的问题...'},
  'home.chatHistory': { ja: 'チャット履歴', en: 'Chat history', zh: '聊天历史'},
  'chat.noResponse': { ja: '(応答なし)', en: '(No response)', zh: '（无响应）'},

  // Chat
  'chat.title': { ja: 'チャット', en: 'Chat', zh: '聊天'},
  'chat.newChat': { ja: '新規チャット', en: 'New chat', zh: '新对话'},
  'chat.placeholder': { ja: 'メッセージを入力...', en: 'Type a message...', zh: '输入消息...'},
  'chat.send': { ja: '送信', en: 'Send', zh: '发送'},
  'chat.askAboutArticle': { ja: 'AIに質問', en: 'Ask AI', zh: '问 AI'},
  'chat.trySaying': { ja: 'こんな質問はどう？', en: 'Try asking...', zh: '试试问...'},
  'chat.suggestion.home.recommend': { ja: '今日のおすすめ記事は？', en: 'What should I read today?', zh: '今天读什么好？'},
  'chat.suggestion.home.unread': { ja: '未読で面白そうな記事ある？', en: 'Any interesting unread articles?', zh: '有什么有趣的未读文章吗？'},
  'chat.suggestion.home.trending': { ja: '最近のトレンドは？', en: 'What\'s trending recently?', zh: '最近有什么热门话题？'},
  'chat.suggestion.home.surprise': { ja: '何か意外な記事を教えて', en: 'Surprise me with something unexpected', zh: '给我推荐点意想不到的内容'},
  'chat.suggestion.home.digest': { ja: '今週のダイジェストをまとめて', en: 'Give me a digest of this week', zh: '给我这周的摘要'},
  // Dynamic suggestion keys (returned by /api/chat/suggestions)
  'suggestion.morning.newArticles': { ja: '昨夜の新着をまとめて', en: 'Summarize last night\'s new articles', zh: '总结昨晚的新文章'},
  'suggestion.morning.readToday': { ja: '今日読むべき記事は？', en: 'What should I read today?', zh: '今天读什么好？'},
  'suggestion.daytime.highlights': { ja: '今日のハイライトは？', en: 'What are today\'s highlights?', zh: '今天的亮点是什么？'},
  'suggestion.evening.review': { ja: '今日の記事を振り返って', en: 'Review today\'s articles', zh: '回顾今天的文章'},
  'suggestion.unreadMany': { ja: '未読${count}件、重要なのどれ？', en: '${count} unread — which are important?', zh: '${count} 篇未读 — 哪些重要？'},
  'suggestion.unreadSome': { ja: '未読で面白そうな記事ある？', en: 'Any interesting unread articles?', zh: '有什么有趣的未读文章吗？'},
  'suggestion.topCategory': { ja: '${category}の最新記事ある？', en: 'Any new ${category} articles?', zh: '有新的 ${category} 文章吗？'},
  'suggestion.weeklyDigest': { ja: '今週のダイジェストをまとめて', en: 'Give me a digest of this week', zh: '给我这周的摘要'},
  'suggestion.trending': { ja: '最近のトレンドは？', en: 'What\'s trending recently?', zh: '最近有什么热门话题？'},
  'suggestion.surprise': { ja: '何か意外な記事を教えて', en: 'Surprise me with something unexpected', zh: '给我推荐点意想不到的内容'},
  'chat.suggestion.summarize': { ja: 'この記事を3行でまとめて', en: 'Summarize this in 3 sentences', zh: '用 3 句话总结这篇文章'},
  'chat.suggestion.keyPoints': { ja: '重要なポイントを箇条書きで', en: 'List the key points', zh: '列出要点'},
  'chat.suggestion.explain': { ja: '初心者にもわかるように説明して', en: 'Explain this for a beginner', zh: '用初学者能理解的方式解释'},
  'chat.suggestion.opinion': { ja: 'この記事への反論を考えて', en: 'Think of counterarguments', zh: '想想反驳观点'},
  'chat.suggestion.related': { ja: '関連トピックを教えて', en: 'What are related topics?', zh: '有哪些相关话题？'},
  'chat.searching': { ja: '記事を検索中...', en: 'Searching articles...', zh: '搜索文章中...'},
  'chat.toolRunning': { ja: '${name} を実行中...', en: 'Running ${name}...', zh: '正在运行 ${name}...'},
  'chat.thinking': { ja: '考え中...', en: 'Thinking...', zh: '思考中...'},
  'chat.noConversations': { ja: '会話がありません', en: 'No conversations', zh: '暂无对话'},
  'chat.deleteConfirm': { ja: 'この会話を削除しますか？', en: 'Delete this conversation?', zh: '确定删除此对话？'},
  'chat.settings': { ja: 'チャット', en: 'Chat', zh: '聊天'},
  'chat.settingsDesc': { ja: 'チャット用のプロバイダーとモデル', en: 'Provider and model for chat', zh: '聊天使用的提供商和模型'},
  'chat.model': { ja: 'チャットモデル', en: 'Chat model', zh: '聊天模型'},
  'chat.modelDesc': { ja: 'チャットで使用するAIモデル', en: 'AI model used for chat', zh: '用于聊天的 AI 模型'},
  'chat.provider': { ja: 'チャットプロバイダー', en: 'Chat provider', zh: '聊天提供商'},
  'chat.providerDesc': { ja: 'チャットで使用するプロバイダー', en: 'Provider used for chat', zh: '用于聊天的提供商'},
  // Command Palette
  'command.navigation': { ja: 'ナビゲーション', en: 'Navigation', zh: '导航'},
  'command.actions': { ja: 'アクション', en: 'Actions', zh: '操作'},
  'command.feeds': { ja: 'フィード', en: 'Feeds', zh: '订阅源'},
  'command.appearance': { ja: '外観', en: 'Appearance', zh: '外观'},
  'command.placeholder': { ja: 'コマンドを入力...', en: 'Type a command or search...', zh: '输入命令或搜索...'},
  'command.noResults': { ja: '結果が見つかりません', en: 'No results found.', zh: '未找到结果。'},
  'command.searchArticles': { ja: '記事を検索', en: 'Search articles', zh: '搜索文章'},
  'command.addFeed': { ja: 'フィードを追加', en: 'Add new feed', zh: '添加新订阅源'},
  'command.importOpml': { ja: 'OPML インポート', en: 'Import OPML', zh: '导入 OPML'},
  'command.exportOpml': { ja: 'OPML エクスポート', en: 'Export OPML', zh: '导出 OPML'},

  'summary.settings': { ja: '要約', en: 'Summary', zh: '摘要'},
  'summary.settingsDesc': { ja: '要約で使用するプロバイダーとモデル', en: 'Provider and model for summary', zh: '摘要使用的提供商和模型'},
  'summary.model': { ja: '要約モデル', en: 'Summary model', zh: '摘要模型'},
  'summary.modelDesc': { ja: '要約で使用するAIモデル', en: 'AI model used for summary', zh: '用于摘要的 AI 模型'},
  'summary.provider': { ja: '要約プロバイダー', en: 'Summary provider', zh: '摘要提供商'},
  'summary.providerDesc': { ja: '要約で使用するプロバイダー', en: 'Provider used for summary', zh: '用于摘要的提供商'},
  'translate.settings': { ja: '翻訳', en: 'Translation', zh: '翻译'},
  'translate.settingsDesc': { ja: '翻訳で使用するプロバイダーとモデル', en: 'Provider and model for translation', zh: '翻译使用的提供商和模型'},
  'translate.model': { ja: '翻訳モデル', en: 'Translation model', zh: '翻译模型'},
  'translate.modelDesc': { ja: '翻訳で使用するAIモデル', en: 'AI model used for translation', zh: '用于翻译的 AI 模型'},
  'translate.provider': { ja: '翻訳プロバイダー', en: 'Translation provider', zh: '翻译提供商'},
  'translate.providerDesc': { ja: '翻訳で使用するプロバイダー', en: 'Provider used for translation', zh: '用于翻译的提供商'},
  'provider.anthropic': { ja: 'Anthropic API', en: 'Anthropic API', zh: 'Anthropic API'},
  'provider.gemini': { ja: 'Gemini API', en: 'Gemini API', zh: 'Gemini API'},
  'provider.openai': { ja: 'OpenAI API', en: 'OpenAI API', zh: 'OpenAI API'},
  'provider.claudeCode': { ja: 'Claude Code', en: 'Claude Code', zh: 'Claude Code'},
  'provider.ollama': { ja: 'Ollama', en: 'Ollama', zh: 'Ollama'},
  'provider.vllm': { ja: 'vLLM', en: 'vLLM', zh: 'vLLM'},
  'provider.googleTranslate': { ja: 'Google Translate', en: 'Google Translate', zh: 'Google 翻译'},
  'provider.deepl': { ja: 'DeepL', en: 'DeepL', zh: 'DeepL'},
  'ollama.baseUrl': { ja: 'Ollama サーバー URL', en: 'Ollama Server URL', zh: 'Ollama 服务器 URL'},
  'ollama.baseUrlDesc': { ja: 'Ollama サーバーのアドレスを設定', en: 'Set the Ollama server address', zh: '设置 Ollama 服务器地址'},
  'ollama.baseUrlPlaceholder': { ja: 'http://localhost:11434', en: 'http://localhost:11434', zh: 'http://localhost:11434'},
  'ollama.baseUrlSaved': { ja: 'Ollama サーバー URL を保存しました', en: 'Ollama server URL saved', zh: 'Ollama 服务器 URL 已保存'},
  'ollama.testConnection': { ja: '接続テスト', en: 'Test Connection', zh: '测试连接'},
  'ollama.testing': { ja: 'テスト中...', en: 'Testing...', zh: '测试中...'},
  'ollama.connected': { ja: '接続成功', en: 'Connected', zh: '已连接'},
  'ollama.connectionFailed': { ja: '接続失敗', en: 'Connection failed', zh: '连接失败'},
  'ollama.noModels': { ja: 'Ollama に接続できません', en: 'Cannot connect to Ollama', zh: '无法连接 Ollama'},
  'ollama.customHeaders': { ja: 'カスタムヘッダー', en: 'Custom Headers', zh: '自定义请求头'},
  'ollama.customHeadersDesc': { ja: 'リバースプロキシの認証ヘッダーなど', en: 'e.g. reverse proxy authentication headers', zh: '例如反向代理认证头'},
  'ollama.headerKey': { ja: 'ヘッダー名', en: 'Header name', zh: '请求头名称'},
  'ollama.headerValue': { ja: '値', en: 'Value', zh: '值'},
  'ollama.addHeader': { ja: '追加', en: 'Add', zh: '添加'},
  'ollama.headersSaved': { ja: 'カスタムヘッダーを保存しました', en: 'Custom headers saved', zh: '自定义请求头已保存'},

  // vLLM
  'vllm.baseUrl': { ja: 'vLLM サーバー URL', en: 'vLLM Server URL', zh: 'vLLM 服务器 URL'},
  'vllm.baseUrlDesc': { ja: 'vLLM サーバーのアドレスを設定', en: 'Set the vLLM server address', zh: '设置 vLLM 服务器地址'},
  'vllm.baseUrlPlaceholder': { ja: 'http://localhost:8000', en: 'http://localhost:8000', zh: 'http://localhost:8000'},
  'vllm.baseUrlSaved': { ja: 'vLLM サーバー URL を保存しました', en: 'vLLM server URL saved', zh: 'vLLM 服务器 URL 已保存'},
  'vllm.testConnection': { ja: '接続テスト', en: 'Test Connection', zh: '测试连接'},
  'vllm.testing': { ja: 'テスト中...', en: 'Testing...', zh: '测试中...'},
  'vllm.connected': { ja: '接続成功', en: 'Connected', zh: '已连接'},
  'vllm.connectionFailed': { ja: '接続失敗', en: 'Connection failed', zh: '连接失败'},
  'vllm.noModels': { ja: 'vLLM に接続できません', en: 'Cannot connect to vLLM', zh: '无法连接 vLLM'},
  'vllm.apiKeySaved': { ja: 'vLLM API キーを保存しました', en: 'vLLM API key saved', zh: 'vLLM API 密钥已保存'},
  'vllm.apiKeyDeleted': { ja: 'vLLM API キーを削除しました', en: 'vLLM API key deleted', zh: 'vLLM API 密钥已删除'},
  'googleTranslate.apiKeySaved': { ja: 'Google Translate API キーを保存しました', en: 'Google Translate API key saved', zh: 'Google 翻译 API 密钥已保存'},
  'googleTranslate.apiKeyDeleted': { ja: 'Google Translate API キーを削除しました', en: 'Google Translate API key deleted', zh: 'Google 翻译 API 密钥已删除'},
  'deepl.apiKeySaved': { ja: 'DeepL API キーを保存しました', en: 'DeepL API key saved', zh: 'DeepL API 密钥已保存'},
  'deepl.apiKeyDeleted': { ja: 'DeepL API キーを削除しました', en: 'DeepL API key deleted', zh: 'DeepL API 密钥已删除'},
  'openai.apiKey': { ja: 'OpenAI API キー', en: 'OpenAI API Key', zh: 'OpenAI API 密钥'},
  'openai.apiKeyDesc': { ja: 'OpenAI API キーを設定', en: 'Set your OpenAI API key', zh: '设置 OpenAI API 密钥'},
  'openai.apiKeySaved': { ja: 'OpenAI API キーを保存しました', en: 'OpenAI API key saved', zh: 'OpenAI API 密钥已保存'},
  'openai.apiKeyDeleted': { ja: 'OpenAI API キーを削除しました', en: 'OpenAI API key deleted', zh: 'OpenAI API 密钥已删除'},
  'gemini.apiKey': { ja: 'Gemini API キー', en: 'Gemini API Key', zh: 'Gemini API 密钥'},
  'gemini.apiKeyDesc': { ja: 'Google AI Gemini API キーを設定', en: 'Set your Google AI Gemini API key', zh: '设置 Google AI Gemini API 密钥'},
  'gemini.apiKeySaved': { ja: 'Gemini API キーを保存しました', en: 'Gemini API key saved', zh: 'Gemini API 密钥已保存'},
  'gemini.apiKeyDeleted': { ja: 'Gemini API キーを削除しました', en: 'Gemini API key deleted', zh: 'Gemini API 密钥已删除'},
  'chat.authConnected': { ja: '認証済み', en: 'Connected', zh: '已连接'},
  'chat.authNotConnected': { ja: '未認証', en: 'Not connected', zh: '未连接'},
  'chat.authNotInstalled': { ja: 'Claude Code がインストールされていません', en: 'Claude Code is not installed', zh: '未安装 Claude Code'},
  'chat.authRunLogin': { ja: 'サーバーで claude auth login を実行してください', en: 'Run claude auth login on the server', zh: '在服务器上运行 claude auth login'},
  'chat.authNote': {
    ja: 'Claude Code の認証はブラウザでの OAuth フローが必要なため、この画面からは設定できません。サーバーのターミナルで直接コマンドを実行してください。',
    en: 'Claude Code authentication requires a browser-based OAuth flow, so it cannot be configured from this screen. Run the commands directly in the server terminal.',
    zh: 'Claude Code 认证需要基于浏览器的 OAuth 流程，因此无法从此界面配置。请在服务器终端中直接运行命令。'
  },
  'chat.authNoteIssue': { ja: '関連: ', en: 'Related: ', zh: '相关：'},
  'chat.authHowToLogin': { ja: 'ログイン: claude auth login', en: 'Login: claude auth login', zh: '登录：claude auth login'},
  'chat.authHowToLoginLabel': { ja: 'ログイン:', en: 'Login:', zh: '登录：'},
  'chat.authHowToLogout': { ja: 'ログアウト: claude auth logout', en: 'Logout: claude auth logout', zh: '登出：claude auth logout'},
  'chat.authHowToLogoutLabel': { ja: 'ログアウト:', en: 'Logout:', zh: '登出：'},
  'chat.expand': { ja: '拡大', en: 'Expand', zh: '展开'},
  'chat.collapse': { ja: '縮小', en: 'Collapse', zh: '收起'},
  'chat.apiKey': { ja: 'API キー', en: 'API Key', zh: 'API 密钥'},
  'chat.apiKeyDesc': { ja: 'Anthropic API キーを設定', en: 'Set your Anthropic API key', zh: '设置 Anthropic API 密钥'},
  'chat.apiKeyConfigured': { ja: '設定済み', en: 'Configured', zh: '已配置'},
  'chat.apiKeyNotSet': { ja: '未設定', en: 'Not set', zh: '未设置'},
  'chat.apiKeySaved': { ja: 'API キーを保存しました', en: 'API key saved', zh: 'API 密钥已保存'},
  'chat.apiKeyDeleted': { ja: 'API キーを削除しました', en: 'API key deleted', zh: 'API 密钥已删除'},
  'chat.apiKeyDelete': { ja: '削除', en: 'Delete', zh: '删除'},
  'error.anthropicKeyNotSet': {
    ja: 'Anthropic API キーが設定されていません。',
    en: 'Anthropic API key is not configured.',
    zh: 'Anthropic API 密钥未配置。'
  },
  'error.geminiKeyNotSet': {
    ja: 'Gemini API キーが設定されていません。',
    en: 'Gemini API key is not configured.',
    zh: 'Gemini API 密钥未配置。'
  },
  'error.openaiKeyNotSet': {
    ja: 'OpenAI API キーが設定されていません。',
    en: 'OpenAI API key is not configured.',
    zh: 'OpenAI API 密钥未配置。'
  },
  'error.googleTranslateKeyNotSet': {
    ja: 'Google Translate API キーが設定されていません。',
    en: 'Google Translate API key is not configured.',
    zh: 'Google 翻译 API 密钥未配置。'
  },
  'error.deeplKeyNotSet': {
    ja: 'DeepL API キーが設定されていません。',
    en: 'DeepL API key is not configured.',
    zh: 'DeepL API 密钥未配置。'
  },
  'error.summarizationFailed': {
    ja: '要約に失敗しました。しばらくしてから再度お試しください。',
    en: 'Summarization failed. Please try again later.',
    zh: '摘要生成失败。请稍后重试。'
  },
  'error.translationFailed': {
    ja: '翻訳に失敗しました。しばらくしてから再度お試しください。',
    en: 'Translation failed. Please try again later.',
    zh: '翻译失败。请稍后重试。'
  },
  'error.goToSettings': {
    ja: '設定画面',
    en: 'Settings',
    zh: '设置'
  },
  'error.setApiKeyFromSettings': {
    ja: 'から API キーを入力してください。',
    en: ' to configure your API key.',
    zh: '中配置您的 API 密钥。'
  },

  // Search
  'search.title': { ja: '検索', en: 'Search', zh: '搜索'},
  'search.placeholder': { ja: '記事を検索...', en: 'Search articles...', zh: '搜索文章...'},
  'search.noResults': { ja: '一致する記事がありません', en: 'No matching articles', zh: '没有匹配的文章'},
  'search.indexBuilding': { ja: '検索インデックスを構築中です…', en: 'Building search index…', zh: '正在构建搜索索引…'},
  'search.hint': { ja: '↑↓ 移動 · Enter 開く · Esc 閉じる', en: '↑↓ navigate · Enter open · Esc close', zh: '↑↓ 导航 · Enter 打开 · Esc 关闭'},
  'search.filterBookmarked': { ja: 'あとで読む', en: 'Read Later', zh: '稍后阅读'},
  'search.filterLiked': { ja: 'いいね', en: 'Liked', zh: '已点赞'},
  'search.filterUnread': { ja: '未読', en: 'Unread', zh: '未读'},
  'search.period.today': { ja: '今日', en: 'Today', zh: '今天'},
  'search.period.week': { ja: '1週間', en: 'Week', zh: '周'},
  'search.period.month': { ja: '1ヶ月', en: 'Month', zh: '月'},

  // About
  'settings.about': { ja: 'About', en: 'About', zh: '关于'},
  'about.version': { ja: 'バージョン', en: 'Version', zh: '版本'},
  'about.github': { ja: 'GitHub', en: 'GitHub', zh: 'GitHub'},
  'about.issues': { ja: 'フィードバック', en: 'Feedback', zh: '反馈'},
  'about.commit': { ja: 'コミット', en: 'Commit', zh: '提交'},
  'about.buildDate': { ja: 'ビルド日時', en: 'Build Date', zh: '构建日期'},

  // Toast
  'toast.fetchedArticles': { ja: '${name}: ${count}件の新しい記事を取得', en: '${name}: Fetched ${count} new articles', zh: '${name}：获取了 ${count} 篇新文章'},
  'toast.noNewArticles': { ja: '${name}: 新着なし', en: '${name}: No new articles', zh: '${name}：无新文章'},
  'toast.fetchError': { ja: '${name}: フェッチに失敗しました', en: '${name}: Fetch failed', zh: '${name}：获取失败'},
  'toast.newVersion': { ja: '新しいバージョンが利用可能です', en: 'A new version is available', zh: '有新版本可用'},
  'toast.reload': { ja: '更新', en: 'Reload', zh: '重新加载'},
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

const defaultLocale: Locale = navigator.language.startsWith('ja') ? 'ja' : navigator.language.startsWith('zh') ? 'zh' : 'en'

function resolveLocale(): Locale {
  const stored = localStorage.getItem('locale')
  if (stored === 'ja' || stored === 'en' || stored === 'zh') return stored
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

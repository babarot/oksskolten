type Locale = 'ja' | 'en' | 'zh'

const dict = {
  'demo.defaultUser': { ja: 'Demo User', en: 'Demo User', zh: 'Demo User' },
  'demo.disabled': { ja: 'デモでは利用できません', en: 'Not available in demo', zh: '演示模式下不可用' },
  'demo.aiDisabled': { ja: 'AI機能はセルフホスト版で利用できます', en: 'AI features require your own instance', zh: 'AI 功能需要自托管实例' },
  'demo.sampleArticle': { ja: 'サンプル記事', en: 'Sample Article', zh: '示例文章' },
  'demo.sampleArticleBody': { ja: 'これはデモ用のサンプル記事です。', en: 'This is a sample article generated for the demo.', zh: '这是为演示生成的示例文章。' },
  'demo.chatReply': {
    ja: 'こんにちは！これは Oksskolten のデモ版です。\n\nチャット機能では、記事の内容について AI に質問したり、要約を依頼したりできます。セルフホスト版では以下のプロバイダーが利用可能です：\n\n- **Anthropic** (Claude)\n- **Google** (Gemini)\n- **OpenAI** (GPT)\n\n`docker compose up` で簡単にセットアップできます。ぜひお試しください！',
    en: 'Hi there! This is a demo of Oksskolten.\n\nThe chat feature lets you ask AI questions about articles, request summaries, and explore your reading list conversationally. In the self-hosted version, you can connect:\n\n- **Anthropic** (Claude)\n- **Google** (Gemini)\n- **OpenAI** (GPT)\n\nGet started with `docker compose up`. Give it a try!',
    zh: '你好！这是 Oksskolten 的演示版。\n\n聊天功能可以让您就文章内容向 AI 提问、请求摘要，并以对话方式探索阅读列表。在自托管版本中，您可以连接：\n\n- **Anthropic** (Claude)\n- **Google** (Gemini)\n- **OpenAI** (GPT)\n\n使用 `docker compose up` 即可快速部署。欢迎试用！',
  },
  'demo.chatReply.recommend': {
    ja: '今日のおすすめはこちらです！\n\n1. [Allocation Optimizations in Go](/go.dev/blog/allocation-optimizations) — Go 1.26 のエスケープ解析の改善でヒープ割り当てが大幅に減少。パフォーマンスに興味があるなら必読です\n2. [Streaming AI Inference on Workers](/blog.cloudflare.com/workers-ai-streaming) — Cloudflare Workers で AI 推論をストリーミング実行する方法。エッジコンピューティングの最前線\n3. [What does it take to ship Rust in safety-critical?](/blog.rust-lang.org/2026/01/14/what-does-it-take-to-ship-rust-in-safety-critical/) — 安全性が求められる領域で Rust を使うための課題と取り組み\n\nどれも読み応えがありますよ。気になる記事があればクリックして詳細を見てみてください！',
    en: 'Here are my top picks for today!\n\n1. [Allocation Optimizations in Go](/go.dev/blog/allocation-optimizations) — Go 1.26\'s escape analysis improvements significantly reduce heap allocations. A must-read if you care about performance\n2. [Streaming AI Inference on Workers](/blog.cloudflare.com/workers-ai-streaming) — How to run AI inference on Cloudflare Workers with streaming. Cutting-edge stuff\n3. [What does it take to ship Rust in safety-critical?](/blog.rust-lang.org/2026/01/14/what-does-it-take-to-ship-rust-in-safety-critical/) — Challenges and approaches for using Rust in safety-critical domains\n\nAll great reads. Click on any article to dive deeper!',
    zh: '以下是今天的推荐！\n\n1. [Go 中的分配优化](/go.dev/blog/allocation-optimizations) — Go 1.26 的逃逸分析改进显著减少了堆分配。关注性能的话必读\n2. [在 Workers 上进行流式 AI 推理](/blog.cloudflare.com/workers-ai-streaming) — 如何在 Cloudflare Workers 上运行流式 AI 推理。前沿技术\n3. [在安全关键领域使用 Rust 需要什么？](/blog.rust-lang.org/2026/01/14/what-does-it-take-to-ship-rust-in-safety-critical/) — 在安全关键领域使用 Rust 的挑战和方法\n\n都是好文章。点击任何文章深入了解！',
  },
  'demo.chatReply.unread': {
    ja: '未読記事をチェックしてみました！面白そうなものをピックアップ：\n\n- [Experimental JSON v2 Package](/go.dev/blog/jsonv2-exp) — Go の新しい JSON パッケージ。既存の `encoding/json` の課題を解決するアプローチが興味深いです\n- [Multi-agent workflows often fail. Here\'s how to engineer ones that don\'t.](/github.blog/ai-and-ml/generative-ai/multi-agent-workflows-often-fail-heres-how-to-engineer-ones-that-dont/) — マルチエージェントの設計パターン。AI 開発者なら押さえておきたい\n- [Introducing Deno Sandbox](/deno.com/blog/introducing-deno-sandbox) — Deno のサンドボックス機能。セキュリティ面で注目\n\nまだ読んでいない記事が結構ありますね。時間があるときにぜひ！',
    en: 'I checked your unread articles! Here are some interesting picks:\n\n- [Experimental JSON v2 Package](/go.dev/blog/jsonv2-exp) — Go\'s new JSON package with a fresh approach to solving `encoding/json` pain points\n- [Multi-agent workflows often fail. Here\'s how to engineer ones that don\'t.](/github.blog/ai-and-ml/generative-ai/multi-agent-workflows-often-fail-heres-how-to-engineer-ones-that-dont/) — Design patterns for multi-agent systems. Essential for AI developers\n- [Introducing Deno Sandbox](/deno.com/blog/introducing-deno-sandbox) — Deno\'s sandboxing feature. Great for security-conscious developers\n\nYou have quite a few unread articles. Check them out when you have time!',
    zh: '我检查了您的未读文章！以下是一些有趣的推荐：\n\n- [实验性 JSON v2 包](/go.dev/blog/jsonv2-exp) — Go 的新 JSON 包，采用全新方法解决 `encoding/json` 的痛点\n- [多智能体工作流经常失败。以下是成功的方法。](/github.blog/ai-and-ml/generative-ai/multi-agent-workflows-often-fail-heres-how-to-engineer-ones-that-dont/) — 多智能体系统的设计模式。AI 开发者必读\n- [介绍 Deno Sandbox](/deno.com/blog/introducing-deno-sandbox) — Deno 的沙箱功能。安全意识强的开发者值得关注\n\n您还有不少未读文章。有空的时候看看！',
  },
  'demo.chatReply.trending': {
    ja: '最近のトレンドを分析してみました：\n\n**AI × 開発ツール** が熱いですね。[What\'s new with GitHub Copilot coding agent](/github.blog/ai-and-ml/github-copilot/whats-new-with-github-copilot-coding-agent/) や [Streaming AI Inference on Workers](/blog.cloudflare.com/workers-ai-streaming) など、AI をインフラレベルで活用する動きが加速しています\n\n**ランタイム競争** も面白い展開です。[Deno 2.7](/deno.com/blog/v2.7) の Temporal API 対応、[Go 1.26](/go.dev/blog/go1.26) の最適化、[Rust 1.92](/blog.rust-lang.org/2025/12/11/Rust-1.92.0) のリリースと、各言語・ランタイムが着実に進化中\n\n**セキュリティ** 関連も目立ちます。[Cloudflare 2026 Internet Threat Report](/blog.cloudflare.com/2026-threat-report) や耐量子暗号の話題など\n\nフィードのラインナップが良いので、トレンドがよく見えますね！',
    en: 'Here\'s what\'s trending across your feeds:\n\n**AI × Developer Tools** is hot. [What\'s new with GitHub Copilot coding agent](/github.blog/ai-and-ml/github-copilot/whats-new-with-github-copilot-coding-agent/) and [Streaming AI Inference on Workers](/blog.cloudflare.com/workers-ai-streaming) show AI being integrated at the infrastructure level\n\n**Runtime competition** is heating up. [Deno 2.7](/deno.com/blog/v2.7) with Temporal API, [Go 1.26](/go.dev/blog/go1.26) optimizations, [Rust 1.92](/blog.rust-lang.org/2025/12/11/Rust-1.92.0) — all evolving steadily\n\n**Security** is prominent too, with [Cloudflare 2026 Internet Threat Report](/blog.cloudflare.com/2026-threat-report) and post-quantum cryptography discussions\n\nYour feed lineup gives great visibility into what\'s happening!',
    zh: '分析了您订阅源中的热门话题：\n\n**AI × 开发工具** 非常火热。[GitHub Copilot 编码智能体的最新进展](/github.blog/ai-and-ml/github-copilot/whats-new-with-github-copilot-coding-agent/) 和 [在 Workers 上进行流式 AI 推理](/blog.cloudflare.com/workers-ai-streaming) 展示了 AI 在基础设施层面的整合\n\n**运行时竞争** 也在升温。[Deno 2.7](/deno.com/blog/v2.7) 支持 Temporal API，[Go 1.26](/go.dev/blog/go1.26) 优化，[Rust 1.92](/blog.rust-lang.org/2025/12/11/Rust-1.92.0) 发布 — 各语言和运行时都在稳步进化\n\n**安全** 话题也很突出，[Cloudflare 2026 年互联网威胁报告](/blog.cloudflare.com/2026-threat-report) 和后量子密码学讨论\n\n您的订阅源阵容很棒，热门话题一目了然！',
  },
  'demo.chatReply.surprise': {
    ja: '意外な一本をどうぞ：\n\n[Build a dinosaur runner game with Deno, pt. 1](/deno.com/blog/build-a-game-with-deno-1)\n\nDeno でブラウザの「恐竜ランゲーム」を作るチュートリアルです。普段インフラやバックエンドの記事が多い中で、こういう遊び心のある記事は新鮮ですよね。\n\nあとは [16 Years of Go](/go.dev/blog/16years) も意外と面白いです。16年の歴史を振り返ると、今では当たり前の機能がどういう経緯で入ったのかがわかります。\n\n息抜きにいかがですか？',
    en: 'Here\'s something unexpected:\n\n[Build a dinosaur runner game with Deno, pt. 1](/deno.com/blog/build-a-game-with-deno-1)\n\nA tutorial on building the browser\'s dinosaur runner game with Deno. A fun break from the usual infrastructure and backend articles.\n\nAlso, [16 Years of Go](/go.dev/blog/16years) is surprisingly interesting — looking back at 16 years of history shows how features we take for granted today came to be.\n\nPerfect for a change of pace!',
    zh: '给您来点意想不到的：\n\n[用 Deno 构建恐龙跑步游戏，第 1 部分](/deno.com/blog/build-a-game-with-deno-1)\n\n一个关于用 Deno 构建浏览器恐龙跑步游戏的教程。在大量基础设施和后端文章中，这种有趣的文章令人耳目一新。\n\n另外，[Go 的 16 年](/go.dev/blog/16years) 也很有趣 — 回顾 16 年的历史，可以看到今天我们认为理所当然的功能是如何诞生的。\n\n换换脑子如何？',
  },
  'demo.chatReply.digest': {
    ja: '今週のダイジェストをまとめました：\n\n## Go\n- [Go 1.26 is Released](/go.dev/blog/go1.26) — エスケープ解析の最適化やフェイクタイムによるテスト機能が追加\n- [Experimental JSON v2 Package](/go.dev/blog/jsonv2-exp) が登場\n\n## Cloudflare\n- [Welcome to AI Week 2025](/blog.cloudflare.com/welcome-to-ai-week-2025) — Workers での AI 推論ストリーミングが可能に\n- [Cloudflare Outage: February 20, 2026](/blog.cloudflare.com/cloudflare-outage-february-20-2026) — ポストモーテムが公開\n\n## Kubernetes\n- [Kubernetes v1.35 Sneak Peek](/kubernetes.io/blog/2025/11/26/kubernetes-v1-35-sneak-peek) — Mutable PV Node Affinity など\n- [Ingress-NGINX Retirement Plan](/kubernetes.io/blog/2025/11/11/ingress-nginx-retirement) が発表\n\n## Rust\n- [Announcing Rust 1.92.0](/blog.rust-lang.org/2025/12/11/Rust-1.92.0)\n- [What does it take to ship Rust in safety-critical?](/blog.rust-lang.org/2026/01/14/what-does-it-take-to-ship-rust-in-safety-critical/) が話題\n\n## その他\n- [Deno Deploy is Generally Available](/deno.com/blog/deno-deploy-is-ga)\n- [Tailscale Services](/tailscale.com/blog/services-ga) が GA、[Peer Relays](/tailscale.com/blog/peer-relays-ga) も GA\n\n盛りだくさんの一週間でしたね！',
    en: 'Here\'s your weekly digest:\n\n## Go\n- [Go 1.26 is Released](/go.dev/blog/go1.26) — escape analysis optimizations and fake time testing\n- [Experimental JSON v2 Package](/go.dev/blog/jsonv2-exp) announced\n\n## Cloudflare\n- [Welcome to AI Week 2025](/blog.cloudflare.com/welcome-to-ai-week-2025) — streaming AI inference on Workers\n- [Cloudflare Outage: February 20, 2026](/blog.cloudflare.com/cloudflare-outage-february-20-2026) — postmortem published\n\n## Kubernetes\n- [Kubernetes v1.35 Sneak Peek](/kubernetes.io/blog/2025/11/26/kubernetes-v1-35-sneak-peek) — Mutable PV Node Affinity and more\n- [Ingress-NGINX Retirement Plan](/kubernetes.io/blog/2025/11/11/ingress-nginx-retirement) announced\n\n## Rust\n- [Announcing Rust 1.92.0](/blog.rust-lang.org/2025/12/11/Rust-1.92.0)\n- [What does it take to ship Rust in safety-critical?](/blog.rust-lang.org/2026/01/14/what-does-it-take-to-ship-rust-in-safety-critical/) gaining attention\n\n## Other\n- [Deno Deploy is Generally Available](/deno.com/blog/deno-deploy-is-ga)\n- [Tailscale Services](/tailscale.com/blog/services-ga) and [Peer Relays](/tailscale.com/blog/peer-relays-ga) both reached GA\n\nBusy week!',
    zh: '这是您的每周摘要：\n\n## Go\n- [Go 1.26 发布](/go.dev/blog/go1.26) — 逃逸分析优化和假时间测试功能\n- [实验性 JSON v2 包](/go.dev/blog/jsonv2-exp) 发布\n\n## Cloudflare\n- [欢迎来到 AI 周 2025](/blog.cloudflare.com/welcome-to-ai-week-2025) — Workers 上的流式 AI 推理\n- [Cloudflare 故障：2026 年 2 月 20 日](/blog.cloudflare.com/cloudflare-outage-february-20-2026) — 事后分析已发布\n\n## Kubernetes\n- [Kubernetes v1.35 抢先看](/kubernetes.io/blog/2025/11/26/kubernetes-v1-35-sneak-peek) — 可变 PV 节点亲和性等\n- [Ingress-NGINX 退役计划](/kubernetes.io/blog/2025/11/11/ingress-nginx-retirement) 发布\n\n## Rust\n- [Rust 1.92.0 发布](/blog.rust-lang.org/2025/12/11/Rust-1.92.0)\n- [在安全关键领域使用 Rust 需要什么？](/blog.rust-lang.org/2026/01/14/what-does-it-take-to-ship-rust-in-safety-critical/) 引发关注\n\n## 其他\n- [Deno Deploy 正式发布](/deno.com/blog/deno-deploy-is-ga)\n- [Tailscale Services](/tailscale.com/blog/services-ga) 和 [Peer Relays](/tailscale.com/blog/peer-relays-ga) 均已 GA\n\n忙碌的一周！',
  },
  'demo.summaryReply': {
    ja: 'これはデモ版のため、実際の AI 要約は生成されません。セルフホスト版では Anthropic / Gemini / OpenAI を使ってワンクリックで記事を要約できます。',
    en: 'This is a demo, so actual AI summaries are not generated. In the self-hosted version, you can summarize articles with one click using Anthropic, Gemini, or OpenAI.',
    zh: '这是演示版，不会生成实际的 AI 摘要。在自托管版本中，您可以使用 Anthropic、Gemini 或 OpenAI 一键摘要文章。',
  },
  'demo.translateReply': {
    ja: 'これはデモ版のため、実際の AI 翻訳は生成されません。セルフホスト版では 6 つの翻訳エンジン（Anthropic / Gemini / OpenAI / DeepL / Google Translate）から選択できます。',
    en: 'This is a demo, so actual AI translations are not generated. In the self-hosted version, you can choose from 6 translation engines including Anthropic, Gemini, OpenAI, DeepL, and Google Translate.',
    zh: '这是演示版，不会生成实际的 AI 翻译。在自托管版本中，您可以从 6 种翻译引擎中选择：Anthropic、Gemini、OpenAI、DeepL 和 Google 翻译。',
  },
} as const

type DemoMessageKey = keyof typeof dict

export function getLocale(): Locale {
  const v = localStorage.getItem('locale')
  return v === 'ja' ? 'ja' : v === 'zh' ? 'zh' : 'en'
}

export function dt(key: DemoMessageKey): string {
  return dict[key][getLocale()]
}

/** Simulate SSE-like streaming by emitting text in small chunks with delays. */
export function streamText(text: string, onChunk: (chunk: string) => void): Promise<void> {
  return new Promise(resolve => {
    // Split into small chunks (CJK vs latin)
    const locale = getLocale()
    const chunkSize = locale === 'ja' || locale === 'zh' ? 2 : 5
    const chunks: string[] = []
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize))
    }

    let idx = 0
    const interval = setInterval(() => {
      if (idx >= chunks.length) {
        clearInterval(interval)
        resolve()
        return
      }
      onChunk(chunks[idx])
      idx++
    }, 15) // 15ms per chunk → feels like fast streaming
  })
}

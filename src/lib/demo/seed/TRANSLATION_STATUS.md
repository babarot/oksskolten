# Demo Article Translation Status

各記事の `summary` / `summary_ja` / `full_text_ja` の状況。

## 記事別チェックシート

凡例:
- **EN** = 英語で入っている (正常)
- **JA** = 日本語で入っている (正常)
- **DeepL** = DeepL フル翻訳済み (50-70% が正常範囲)
- **LLM** = Claude 要約 (フル翻訳ではない、DeepL でやり直し必要)
- **---** = 未設定 / プレースホルダ

summary / summary_ja は全記事「パラグラフ + ブレットリスト3点」形式で統一済み。

### Go Blog (feed_id=1)

| id | Title | summary | summary_ja | full_text_ja |
|----|-------|---------|------------|--------------|
| 1 | Allocation Optimizations in Go | EN | JA | --- |
| 2 | Gofix: Automated Code Migrations | EN | JA | --- |
| 3 | Go 1.26 is Released | EN | JA | --- |
| 4 | Go Developer Survey 2025 Results | EN | JA | --- |
| 5 | Green Tea GC: A New Garbage Collector | EN | JA | --- |
| 6 | Flight Recorder for Go Programs | EN | JA | --- |
| 7 | Experimental JSON v2 Package | EN | JA | --- |
| 8 | Testing with Fake Time in Go | EN | JA | --- |
| 9 | Container-Aware GOMAXPROCS | EN | JA | --- |
| 10 | 16 Years of Go | EN | JA | --- |

**TODO**: full_text_ja 全記事 (DeepL: ~224K chars)

### Cloudflare Blog (feed_id=2)

| id | Title | summary | summary_ja | full_text_ja |
|----|-------|---------|------------|--------------|
| 11 | Cloudflare 2026 Internet Threat Report | EN | JA | LLM (11%) |
| 12 | DDoS Threat Report Q4 2025 | EN | JA | LLM (7%) |
| 13 | Developer Week 2025 Wrap-Up | EN | JA | LLM (13%) |
| 14 | Welcome to AI Week 2025 | EN | JA | LLM (10%) |
| 15 | Network Performance Update: Birthday Week 2025 | EN | JA | LLM (6%) |
| 16 | Birthday Week 2025 Wrap-Up | EN | JA | LLM (5%) |
| 17 | Streaming AI Inference on Workers | EN | JA | LLM (17%) |
| 18 | Cloudflare Outage: February 20, 2026 | EN | JA | LLM (7%) |

**TODO**: full_text_ja 全記事 (DeepL: ~144K chars)

### Kubernetes Blog (feed_id=3) — Done

| id | Title | summary | summary_ja | full_text_ja |
|----|-------|---------|------------|--------------|
| 19 | Before You Migrate: Five Surprising Ingress-NGINX Behaviors | EN | JA | DeepL (75%) |
| 20 | Spotlight on SIG Architecture: API Governance | EN | JA | DeepL (52%) |
| 21 | Introducing Node Readiness Controller | EN | JA | DeepL (59%) |
| 22 | Kubernetes v1.35 Sneak Peek | EN | JA | DeepL (58%) |
| 23 | Ingress-NGINX Retirement Plan | EN | JA | DeepL (60%) |
| 24 | Headlamp in 2025: Project Highlights | EN | JA | DeepL (68%) |
| 25 | Announcing the Checkpoint/Restore Working Group | EN | JA | DeepL (69%) |
| 26 | Uniform API server access using clientcmd | EN | JA | DeepL (68%) |
| 27 | Kubernetes v1.35: Mutable PersistentVolume Node Affinity | EN | JA | DeepL (61%) |

### Rust Blog (feed_id=4) — Done

| id | Title | summary | summary_ja | full_text_ja |
|----|-------|---------|------------|--------------|
| 28 | 2025 State of Rust Survey Results | EN | JA | DeepL (61%) |
| 29 | Rust Participates in GSoC 2026 | EN | JA | DeepL (53%) |
| 30 | Announcing Rust 1.92.0 | EN | JA | DeepL (78%) |
| 31 | Updating to musl 1.2.5 | EN | JA | DeepL (86%) |
| 32 | Announcing Rust 1.91.0 | EN | JA | DeepL (89%) |
| 33 | What does it take to ship Rust in safety-critical systems? | EN | JA | DeepL (51%) |
| 34 | Rust Project Goals for 2025 H2 | EN | JA | DeepL (83%) |
| 35 | Announcing Rust 1.89.0 | EN | JA | DeepL (75%) |
| 36 | crates.io: development update | EN | JA | DeepL (62%) |

**Done**

### GitHub Blog (feed_id=5) — Done

| id | Title | summary | summary_ja | full_text_ja |
|----|-------|---------|------------|--------------|
| 37 | 60 million Copilot code reviews and counting | EN | JA | DeepL (58%) |
| 38 | Scaling AI opportunity across the globe | EN | JA | DeepL (48%) |
| 39 | How we rebuilt the search architecture for GHES | EN | JA | DeepL (68%) |
| 40 | Join or host a GitHub Copilot Dev Days event | EN | JA | DeepL (67%) |
| 41 | GitHub for Beginners: Issues and Projects | EN | JA | DeepL (54%) |
| 42 | From idea to PR: Building with Copilot CLI | EN | JA | DeepL (61%) |
| 43 | What's new with GitHub Copilot coding agent | EN | JA | DeepL (65%) |
| 44 | Multi-agent workflows often fail | EN | JA | DeepL (65%) |
| 45 | How AI is reshaping developer choice | EN | JA | DeepL (59%) |

### Deno Blog (feed_id=6) — Done

| id | Title | summary | summary_ja | full_text_ja |
|----|-------|---------|------------|--------------|
| 46 | Deno 2.7: Temporal API, Windows ARM, and npm overrides | EN | JA | DeepL (79%) |
| 47 | Deno Deploy is Generally Available | EN | JA | DeepL (71%) |
| 48 | Introducing Deno Sandbox | EN | JA | DeepL (67%) |
| 49 | React / Next.js DoS Vulnerability: Deno Deploy protected | EN | JA | DeepL (62%) |
| 50 | React Server Functions / Next.js Vulnerability | EN | JA | DeepL (62%) |
| 51 | My highlights from the new Deno Deploy | EN | JA | DeepL (63%) |
| 52 | Deno's Other Open Source Projects | EN | JA | DeepL (79%) |
| 53 | How Deno protects against npm exploits | EN | JA | DeepL (66%) |
| 54 | Build a dinosaur runner game with Deno, pt. 1 | EN | JA | DeepL (76%) |

### Tailscale Blog (feed_id=7) — Done

| id | Title | summary | summary_ja | full_text_ja |
|----|-------|---------|------------|--------------|
| 55 | LM Link: Use local models on remote devices | EN | JA | DeepL (61%) |
| 56 | Tailscale Services is now generally available | EN | JA | DeepL (61%) |
| 57 | Making infrastructure access lighter, simpler, smarter | EN | JA | DeepL (62%) |
| 58 | Tailscale Peer Relays is now generally available | EN | JA | DeepL (67%) |
| 59 | Aperture: Stop choosing between safe AI and fast AI | EN | JA | DeepL (59%) |

## 残作業まとめ

| 作業 | 対象 | 方法 |
|------|------|------|
| full_text_ja を DeepL 翻訳 | Cloudflare (8記事) | DeepL ~144K chars — 来月枠 |
| full_text_ja を DeepL 翻訳 | Go Blog (10記事) | DeepL ~224K chars — 来月枠 |

summary / summary_ja は **全59記事で完了**（EN + JA、パラグラフ+ブレットリスト形式）。

## DeepL API 残り枠 (full_text_ja)

| Feed | 原文文字数 | 推定API消費 |
|------|-----------|------------|
| Cloudflare | 131K | ~144K |
| Go Blog | 204K | ~224K |
| **合計** | **335K** | **~368K** |

DeepL Free: 月 500K 文字上限（超過→リクエスト拒否、課金なし）。
今月の枠はほぼ使い切り（~12K残）。CF+Go は来月リセット後に翻訳。

## 翻訳スクリプト

```bash
# 使用量確認
DEEPL_AUTH_KEY=xxx node src/lib/demo/seed/deepl_translate.mjs --usage

# コスト見積もり
DEEPL_AUTH_KEY=xxx node src/lib/demo/seed/deepl_translate.mjs --estimate --feed 3

# 翻訳実行
DEEPL_AUTH_KEY=xxx node src/lib/demo/seed/deepl_translate.mjs --feed 3

# やり直し
git restore src/lib/demo/seed/articles.json
```

詳細は `deepl_translate.mjs` のヘッダーコメントを参照。

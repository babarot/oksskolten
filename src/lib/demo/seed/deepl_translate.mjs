/**
 * DeepL translation script for demo seed articles.
 *
 * Translates full_text (English Markdown) → full_text_ja (Japanese Markdown)
 * using the same pipeline as the production translation server:
 *
 *   MD → marked() → HTML → DeepL API (tag_handling:html) → HTML → Turndown → MD
 *
 * After Turndown conversion, CJK-specific cleanup is applied:
 *   - fixBoldBoundaries: moves CJK punctuation outside ** markers
 *   - fixUnpairedEmphasis: removes orphaned ** or * markers
 *
 * Both are ported from server/providers/translate/markdown-to-tagged.ts.
 *
 * Prerequisites:
 *   - DEEPL_AUTH_KEY env var (Free or Pro key)
 *   - npm dependencies: marked, turndown
 *
 * Usage:
 *   export DEEPL_AUTH_KEY=xxx
 *
 *   # Translate all articles in a feed
 *   node src/lib/demo/seed/deepl_translate.mjs --feed 7
 *
 *   # Translate specific article(s) by ID
 *   node src/lib/demo/seed/deepl_translate.mjs --id 55 56 57
 *
 *   # Translate all articles
 *   node src/lib/demo/seed/deepl_translate.mjs --all
 *
 *   # Check DeepL API usage (no translation performed)
 *   node src/lib/demo/seed/deepl_translate.mjs --usage
 *
 *   # Show estimated API cost before translating
 *   node src/lib/demo/seed/deepl_translate.mjs --estimate --feed 7
 *
 * Feed IDs:
 *   1=Go Blog, 2=Cloudflare, 3=Kubernetes, 4=Rust, 5=GitHub, 6=Deno, 7=Tailscale
 *
 * Notes:
 *   - Articles are processed sequentially with a 300ms delay between requests.
 *   - Writes articles.json once at the end (no intermediate writes).
 *   - If translation fails mid-way, articles.json is NOT modified.
 *   - To undo: git restore src/lib/demo/seed/articles.json
 */
import { readFileSync, writeFileSync } from "fs";
import { marked } from "marked";
import TurndownService from "turndown";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const DEEPL_KEY = process.env.DEEPL_AUTH_KEY;
if (!DEEPL_KEY) { console.error("Set DEEPL_AUTH_KEY"); process.exit(1); }

const API_BASE = DEEPL_KEY.endsWith(":fx")
  ? "https://api-free.deepl.com/v2"
  : "https://api.deepl.com/v2";
const MAX_CHARS_PER_REQUEST = 50_000;

const ARTICLES_PATH = "./src/lib/demo/seed/articles.json";

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const mode = args[0];
if (!mode || !["--feed", "--id", "--all", "--usage", "--estimate"].includes(mode)) {
  console.error("Usage:");
  console.error("  --feed <feed_id>       Translate all articles in a feed");
  console.error("  --id <id> [id...]      Translate specific article(s) by ID");
  console.error("  --all                  Translate all articles");
  console.error("  --usage                Check DeepL API usage (no translation)");
  console.error("  --estimate [--feed N | --id N...]  Show estimated API cost");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// --usage: check API quota and exit
// ---------------------------------------------------------------------------
if (mode === "--usage") {
  const res = await fetch(`${API_BASE}/usage`, {
    headers: { "Authorization": `DeepL-Auth-Key ${DEEPL_KEY}` },
  });
  const j = await res.json();
  const used = j.character_count;
  const limit = j.character_limit;
  const remaining = limit - used;
  const pct = ((used / limit) * 100).toFixed(1);
  console.log(`Used:      ${used.toLocaleString()} / ${limit.toLocaleString()} (${pct}%)`);
  console.log(`Remaining: ${remaining.toLocaleString()}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Resolve target articles
// ---------------------------------------------------------------------------
const data = JSON.parse(readFileSync(ARTICLES_PATH, "utf8"));

function resolveArticles() {
  const subMode = args.includes("--feed") ? "--feed" : args.includes("--id") ? "--id" : "--all";
  if (subMode === "--feed") {
    const idx = args.indexOf("--feed");
    const feedId = Number(args[idx + 1]);
    if (!feedId) { console.error("--feed requires a feed_id"); process.exit(1); }
    return data.filter(a => a.feed_id === feedId);
  } else if (subMode === "--id") {
    const idx = args.indexOf("--id");
    const ids = args.slice(idx + 1).filter(a => !a.startsWith("--")).map(Number).filter(Boolean);
    if (ids.length === 0) { console.error("--id requires at least one article ID"); process.exit(1); }
    const articles = data.filter(a => ids.includes(a.id));
    const found = articles.map(a => a.id);
    const missing = ids.filter(id => !found.includes(id));
    if (missing.length) console.warn(`Warning: IDs not found: ${missing.join(", ")}`);
    return articles;
  } else {
    return data;
  }
}

// ---------------------------------------------------------------------------
// --estimate: show cost estimate and exit
// ---------------------------------------------------------------------------
if (mode === "--estimate") {
  const articles = resolveArticles();
  let totalChars = 0;
  for (const a of articles) {
    const len = (a.full_text || "").length;
    // HTML is roughly 1.1x the markdown size
    const estimated = Math.round(len * 1.1);
    totalChars += estimated;
    console.log(`  [${a.id}] ${a.title} — ${len.toLocaleString()} chars (≈${estimated.toLocaleString()} API chars)`);
  }
  console.log(`\nEstimated total: ≈${totalChars.toLocaleString()} API characters (${articles.length} articles)`);

  // Also show current usage
  const res = await fetch(`${API_BASE}/usage`, {
    headers: { "Authorization": `DeepL-Auth-Key ${DEEPL_KEY}` },
  });
  const j = await res.json();
  const remaining = j.character_limit - j.character_count;
  const fits = totalChars <= remaining;
  console.log(`API remaining: ${remaining.toLocaleString()} — ${fits ? "OK, fits within quota" : "WARNING: may exceed quota"}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Turndown (same config as server/providers/translate/markdown-protect.ts)
// ---------------------------------------------------------------------------
const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
turndown.keep(["table", "thead", "tbody", "tr", "th", "td"]);

// ---------------------------------------------------------------------------
// CJK cleanup (ported from server/providers/translate/markdown-to-tagged.ts)
// ---------------------------------------------------------------------------
const CJK_OPEN_PUNCT = "「『（【〈《〔｛＜";
const CJK_CLOSE_PUNCT = "」』）】〉》〕｝＞";
const CJK_MID_PUNCT = "。、！？・：；〜～…─―ー";
const CJK_PUNCT = `[${CJK_OPEN_PUNCT}${CJK_CLOSE_PUNCT}${CJK_MID_PUNCT}]`;

function fixBoldBoundaries(text) {
  text = text.replace(new RegExp(`\\*\\*(${CJK_PUNCT}+)\\*\\*`, "g"), "$1");
  text = text.replace(new RegExp(`\\*\\*([^*]+?)(${CJK_PUNCT}+)\\*\\*`, "g"), "**$1**$2");
  text = text.replace(new RegExp(`\\*\\*([${CJK_OPEN_PUNCT}]+)([^*]+?)\\*\\*`, "g"), "$1**$2**");
  text = text.replace(/\*\*\*\*/g, "");
  text = text.replace(/\*\*\[([^\]]+)\]\(([^)]+)\)\*\*/g, "[**$1**]($2)");
  return text;
}

function fixUnpairedEmphasis(text) {
  return text.split("\n").map(line => {
    const boldParts = line.split("**");
    if (boldParts.length % 2 === 0) {
      const lastIdx = line.lastIndexOf("**");
      if (lastIdx >= 0) {
        line = line.substring(0, lastIdx) + line.substring(lastIdx + 2);
      }
    }
    return line;
  }).join("\n");
}

// ---------------------------------------------------------------------------
// Chunk splitting (same as markdown-protect.ts)
// ---------------------------------------------------------------------------
function splitIntoChunks(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const paragraphs = text.split("\n\n");
  const chunks = [];
  let current = "";
  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current.length > 0) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// ---------------------------------------------------------------------------
// DeepL translate chunk
// ---------------------------------------------------------------------------
async function translateChunk(html) {
  const res = await fetch(`${API_BASE}/translate`, {
    method: "POST",
    headers: {
      "Authorization": `DeepL-Auth-Key ${DEEPL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: [html],
      target_lang: "JA",
      tag_handling: "html",
      ignore_tags: ["code", "pre", "img"],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepL API error: ${res.status} ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  return { translated: json.translations[0].text, characters: html.length };
}

// ---------------------------------------------------------------------------
// Full translation pipeline (mirrors translateWithProtection)
// ---------------------------------------------------------------------------
async function translateArticle(text) {
  const mdChunks = splitIntoChunks(text, MAX_CHARS_PER_REQUEST);

  const translatedHtmlParts = [];
  let totalCharacters = 0;

  for (const mdChunk of mdChunks) {
    const html = await marked(mdChunk);
    const result = await translateChunk(html);
    translatedHtmlParts.push(result.translated);
    totalCharacters += result.characters;
  }

  // Clean up API artifacts before turndown
  let translatedHtml = translatedHtmlParts.join("\n");
  translatedHtml = translatedHtml.replace(/<pre>\s*<code/g, "<pre><code");

  // Convert translated HTML back to Markdown
  let translated = turndown.turndown(translatedHtml);

  // Fix CJK bold boundary issues
  translated = fixBoldBoundaries(translated);
  translated = fixUnpairedEmphasis(translated);

  return { translated, characters: totalCharacters };
}

// ---------------------------------------------------------------------------
// Main: translate
// ---------------------------------------------------------------------------
const articles = resolveArticles();

if (articles.length === 0) {
  console.error("No articles matched.");
  process.exit(1);
}

if (mode === "--feed") {
  console.log(`Translating ${articles.length} articles for feed_id=${args[1]}`);
} else if (mode === "--id") {
  console.log(`Translating ${articles.length} articles by ID: ${articles.map(a => a.id).join(", ")}`);
} else {
  console.log(`Translating ALL ${articles.length} articles`);
}

let totalChars = 0;
for (const article of articles) {
  const origLen = (article.full_text || "").length;
  console.log(`  [${article.id}] "${article.title}" (${origLen} chars)...`);
  try {
    const { translated, characters } = await translateArticle(article.full_text || "");
    article.full_text_ja = translated;
    totalChars += characters;
    const ratio = ((translated.length / origLen) * 100).toFixed(1);
    console.log(`    → ${translated.length} chars (${ratio}% of original), API chars: ${characters}`);
  } catch (e) {
    console.error(`    ERROR: ${e.message}`);
    process.exit(1);
  }
  // Rate limit courtesy
  await new Promise(r => setTimeout(r, 300));
}

// Write back
const output = JSON.stringify(data, null, 2);
JSON.parse(output); // validate
writeFileSync(ARTICLES_PATH, output + "\n");
console.log(`\nDone. Total API characters used: ${totalChars}`);

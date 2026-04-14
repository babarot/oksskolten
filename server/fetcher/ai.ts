import { getSetting } from '../db.js'
import { getProvider } from '../providers/llm/index.js'
import { googleTranslate } from '../providers/translate/google-translate.js'
import { deeplTranslate } from '../providers/translate/deepl.js'
import { TASK_DEFAULTS } from '../../shared/models.js'
import { DEFAULT_LANGUAGE, languageName } from '../../shared/lang.js'

export type AiBillingMode = 'anthropic' | 'gemini' | 'openai' | 'claude-code' | 'ollama' | 'vllm' | 'google-translate' | 'deepl'

export interface AiTextResult {
  inputTokens: number
  outputTokens: number
  billingMode: AiBillingMode
  model: string
  monthlyChars?: number
}

export function detectLanguage(fullText: string): string {
  const sample = fullText.slice(0, 1000)
  const jaCount = (sample.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length
  return jaCount / sample.length > 0.1 ? 'ja' : 'en'
}


function buildSummarizePrompt(fullText: string): string {
  const lang = getSetting('general.language') || DEFAULT_LANGUAGE
  return `Summarize the following article in ${languageName(lang)}. Follow the format strictly.

## Format
Line 1: A concise 1-2 sentence summary of the article's main point (what the article is about and the author's key argument or conclusion)
Line 2: Empty line
Line 3+: Key points as bullet points. Each item should follow the format "**Point title** — supplementary explanation" (only the title in bold)

## Rules
- Each bullet point must faithfully reflect the article's arguments, claims, or facts
- Maintain the order of the article's flow
- Minimize the number of points (3-4 is ideal). Only add more if the content is truly wide-ranging, but never exceed 7
- Output in Markdown (bullet points start with "- ")
- Do not include any text other than the summary (no headings, preambles, or notes)

--- Article body ---
${fullText}`
}

function buildTranslatePrompt(fullText: string): string {
  const lang = getSetting('translate.target_lang') || getSetting('general.language') || DEFAULT_LANGUAGE
  const targetLang = languageName(lang)
  return `Translate the following article into ${targetLang}.
Translate every word faithfully — do not summarize, compress, or omit anything.
The translation must be 1:1 with the original text in volume.
Preserve Markdown formatting. In particular, keep blockquote lines starting with ">".

--- Article body ---
${fullText}`
}

interface AiTaskConfig {
  providerKey: string
  modelKey: string
  defaultModel: string
  maxTokens: number
  buildPrompt: (text: string) => string
}

async function runAiTask(
  config: AiTaskConfig,
  fullText: string,
  onText?: (delta: string) => void,
): Promise<{ text: string } & AiTextResult> {
  const providerName = getSetting(config.providerKey) || TASK_DEFAULTS.summarize.provider
  const model = getSetting(config.modelKey) || config.defaultModel
  const provider = getProvider(providerName)
  provider.requireKey()
  const prompt = config.buildPrompt(fullText)
  const result = onText
    ? await provider.streamMessage(
        { model, maxTokens: config.maxTokens, messages: [{ role: 'user', content: prompt }] },
        onText,
      )
    : await provider.createMessage({
        model,
        maxTokens: config.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      })
  return {
    text: result.text,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    billingMode: providerName as AiBillingMode,
    model,
  }
}

const SUMMARIZE_MAX_TOKENS = 2048
const TRANSLATE_MAX_TOKENS = 16384

const summarizeConfig: AiTaskConfig = {
  providerKey: 'summary.provider',
  modelKey: 'summary.model',
  defaultModel: TASK_DEFAULTS.summarize.model,
  maxTokens: SUMMARIZE_MAX_TOKENS,
  buildPrompt: buildSummarizePrompt,
}

const translateConfig: AiTaskConfig = {
  providerKey: 'translate.provider',
  modelKey: 'translate.model',
  defaultModel: TASK_DEFAULTS.translate.model,
  maxTokens: TRANSLATE_MAX_TOKENS,
  buildPrompt: buildTranslatePrompt,
}

export async function summarizeArticle(fullText: string): Promise<{ summary: string } & AiTextResult> {
  const r = await runAiTask(summarizeConfig, fullText)
  return { summary: r.text, inputTokens: r.inputTokens, outputTokens: r.outputTokens, billingMode: r.billingMode, model: r.model }
}

export async function streamSummarizeArticle(
  fullText: string,
  onText: (delta: string) => void,
): Promise<{ summary: string } & AiTextResult> {
  const r = await runAiTask(summarizeConfig, fullText, onText)
  return { summary: r.text, inputTokens: r.inputTokens, outputTokens: r.outputTokens, billingMode: r.billingMode, model: r.model }
}

export async function translateArticle(fullText: string): Promise<{ fullTextTranslated: string } & AiTextResult> {
  const provider = getSetting('translate.provider') || TASK_DEFAULTS.translate.provider
  if (provider === 'google-translate') {
    return runGoogleTranslate(fullText)
  }
  if (provider === 'deepl') {
    return runDeepl(fullText)
  }
  const r = await runAiTask(translateConfig, fullText)
  return { fullTextTranslated: r.text, inputTokens: r.inputTokens, outputTokens: r.outputTokens, billingMode: r.billingMode, model: r.model }
}

export async function streamTranslateArticle(
  fullText: string,
  onText: (delta: string) => void,
): Promise<{ fullTextTranslated: string } & AiTextResult> {
  const provider = getSetting('translate.provider') || TASK_DEFAULTS.translate.provider
  if (provider === 'google-translate') {
    const result = await runGoogleTranslate(fullText)
    onText(result.fullTextTranslated)
    return result
  }
  if (provider === 'deepl') {
    const result = await runDeepl(fullText)
    onText(result.fullTextTranslated)
    return result
  }
  const r = await runAiTask(translateConfig, fullText, onText)
  return { fullTextTranslated: r.text, inputTokens: r.inputTokens, outputTokens: r.outputTokens, billingMode: r.billingMode, model: r.model }
}

function getTargetLang(): string {
  return getSetting('translate.target_lang') || getSetting('general.language') || DEFAULT_LANGUAGE
}

async function runGoogleTranslate(fullText: string): Promise<{ fullTextTranslated: string } & AiTextResult> {
  const result = await googleTranslate(fullText, getTargetLang())
  return {
    fullTextTranslated: result.translatedText,
    inputTokens: result.characters,
    outputTokens: result.translatedText.length,
    billingMode: 'google-translate',
    model: 'google-translate-v2',
    monthlyChars: result.monthlyChars,
  }
}

async function runDeepl(fullText: string): Promise<{ fullTextTranslated: string } & AiTextResult> {
  const result = await deeplTranslate(fullText, getTargetLang())
  return {
    fullTextTranslated: result.translatedText,
    inputTokens: result.characters,
    outputTokens: result.translatedText.length,
    billingMode: 'deepl',
    model: 'deepl-v2',
    monthlyChars: result.monthlyChars,
  }
}

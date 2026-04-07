export interface ArticleFont {
  value: string
  label: string
  family: string
  googleFontsUrl: string | null
  category: 'sans-serif' | 'serif'
}

export const FONT_SAMPLE_EN = 'The quick brown fox jumps'

export const FONT_SAMPLE_LOCALIZED: Record<string, string> = {
  ja: 'あのイーハトーヴォの透きとおった風',
}

export const articleFonts: ArticleFont[] = [
  {
    value: 'system',
    label: 'System Default',
    family: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    googleFontsUrl: null,
    category: 'sans-serif',
  },
  {
    value: 'inter',
    label: 'Inter',
    family: '"Inter", sans-serif',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap',
    category: 'sans-serif',
  },
  {
    value: 'noto-sans-jp',
    label: 'Noto Sans JP',
    family: '"Noto Sans JP", sans-serif',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700&display=swap',
    category: 'sans-serif',
  },
  {
    value: 'hiragino-sans',
    label: 'Hiragino Sans',
    family: '"Hiragino Sans", "ヒラギノ角ゴシック", "Hiragino Kaku Gothic ProN", sans-serif',
    googleFontsUrl: null,
    category: 'sans-serif',
  },
  {
    value: 'line-seed-jp',
    label: 'LINE Seed JP',
    family: '"LINE Seed JP", sans-serif',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=LINE+Seed+JP:wght@400;700&display=swap',
    category: 'sans-serif',
  },
  {
    value: 'georgia',
    label: 'Georgia',
    family: 'Georgia, "Times New Roman", serif',
    googleFontsUrl: null,
    category: 'serif',
  },
  {
    value: 'system-serif',
    label: 'System Serif',
    family: 'serif',
    googleFontsUrl: null,
    category: 'serif',
  },
  {
    value: 'lora',
    label: 'Lora',
    family: '"Lora", serif',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&display=swap',
    category: 'serif',
  },
  {
    value: 'merriweather',
    label: 'Merriweather',
    family: '"Merriweather", serif',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap',
    category: 'serif',
  },
  {
    value: 'noto-serif-jp',
    label: 'Noto Serif JP',
    family: '"Noto Serif JP", serif',
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;600;700&display=swap',
    category: 'serif',
  },
]

function detectSystemFontName(): string {
  const ua = navigator.userAgent
  if (/Mac|iPhone|iPad|iPod/.test(ua)) return 'San Francisco'
  if (/Windows/.test(ua)) return 'Segoe UI'
  if (/Android/.test(ua)) return 'Roboto'
  return 'System'
}

let _systemFontLabel: string | null = null
export function getSystemFontLabel(): string {
  if (!_systemFontLabel) _systemFontLabel = `Default (${detectSystemFontName()})`
  return _systemFontLabel
}

export function findArticleFont(value: string | null): ArticleFont {
  return articleFonts.find(f => f.value === value) ?? articleFonts[0]
}

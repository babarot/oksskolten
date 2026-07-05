import { JSDOM } from 'jsdom'
import { logger } from '../../logger.js'

const log = logger.child('cleaner')

// ---------------------------------------------------------------------------
// PRE_CLEAN_SELECTORS — Safe to remove before Readability.
// Only elements that are never article content.
// ---------------------------------------------------------------------------
export const PRE_CLEAN_SELECTORS: string[] = [
  // Scripts / styles (Readability also removes these internally)
  'script:not([type^="math/"])',
  'style',
  'noscript',
  'meta',
  'link',

  // Explicitly hidden elements
  '[hidden]',
  '[style*="display: none"]:not([class*="math"])',
  '[style*="display:none"]:not([class*="math"])',
  '[style*="visibility: hidden"]',
  '[style*="visibility:hidden"]',
  '.hidden',
  '.invisible',

  // Non-video iframes (ads / tracking)
  'iframe:not([src*="youtube"]):not([src*="youtu.be"]):not([src*="vimeo"]):not([src*="twitter"]):not([src*="x.com"]):not([src*="datawrapper"])',

  // Print-only / no-print markers
  '.noprint',
  '[data-print-layout="hide" i]',
  '[data-block="donotprint" i]',

  // Canvas / dialog / fieldset — interactive or decorative
  'canvas',
  'dialog',

  // Embeds that are never content
  'instaread-player',
]

// ---------------------------------------------------------------------------
// POST_CLEAN_SELECTORS — Applied to Readability output.
// More aggressive; may match elements that look like content in full-page
// context but are noise within extracted article HTML.
// ---------------------------------------------------------------------------
export const POST_CLEAN_SELECTORS: string[] = [
  // Ads
  '.ad:not([class*="gradient"])',
  '[class^="ad-" i]',
  '[class$="-ad" i]',
  '[id^="ad-" i]',
  '[id$="-ad" i]',
  '[role="banner" i]',
  '[alt*="advert" i]',
  '.promo',
  '.Promo',
  '#barrier-page',

  // Alerts
  '.alert',

  // Comments
  '[id="comments" i]',
  '[id="comment" i]',

  // Navigation / header
  'header',
  '.header:not(.banner)',
  '#header',
  '#Header',
  '#banner',
  '#Banner',
  'nav',
  '.navigation',
  '#navigation',
  '[role="navigation" i]',
  '[role="dialog" i]',
  '[role*="complementary" i]',
  '[class*="pagination" i]',
  '.menu',
  '#siteSub',
  '.previous',

  // Meta info
  '.author',
  '.Author',
  '[class$="_bio"]',
  '#categories',
  '.contributor',
  '.date',
  '#date',
  '[data-date]',
  '.entry-meta',
  '.meta',
  '.tags',
  '#tags',
  '.toc',
  '.Toc',
  '#toc',
  '.headline',
  '#headline',
  '#title',
  '#Title',
  '#articleTag',

  // Tag / author / TOC links
  '[href*="/tag/"]',
  '[href*="/tags/"]',
  '[href*="/topics"]',
  '[href*="author"]',
  '[href*="#toc"]',
  '[href="#top"]',
  '[href="#Top"]',
  '[href="#page-header"]',
  '[href="#content"]',
  '[href="#site-content"]',
  '[href="#main-content"]',
  '[href^="#main"]',
  '[src*="author"]',

  // Footer / forms / interactive
  'footer',
  '.aside',
  'aside:not([class*="callout"])',
  'button',
  'date',
  'fieldset',
  'form',
  'input:not([type="checkbox"])',
  'label',
  'option',
  'select',
  'textarea',

  // Aria-hidden (safe in post-clean context)
  '[aria-hidden="true"]:not([class*="math"])',

  // Logo
  '[class="logo" i]',
  '#logo',
  '#Logo',

  // Newsletter / subscribe
  '#newsletter',
  '#Newsletter',
  '.subscribe',

  // Clickable icons
  '[class*="clickable-icon" i]',

  // LaTeX tags
  'li span[class*="ltx_tag" i][class*="ltx_tag_item" i]',

  // Anchor links
  'a[href^="#"][class*="anchor" i]',
  'a[href^="#"][class*="ref" i]',

  // Most-viewed / skip links
  '[data-container*="most-viewed" i]',
  '[data-link-name*="skip" i]',
  '[aria-label*="skip" i]',

  // Sidebar
  '.sidebar',
  '.Sidebar',
  '#sidebar',
  '#Sidebar',
  '#side-bar',
  '#sitesub',

  // Copyright / license
  '.copyright',
  '#copyright',
  '.licensebox',
  '#page-info',

  // RSS / feed
  '#rss',
  '#feed',

  // Misc site-specific
  '.gutter',
  '#primaryaudio',
  '#NYT_ABOVE_MAIN_CONTENT_REGION',
  '[data-testid="photoviewer-children-figure"] > span',
  'table.infobox',
  '[data-optimizely="related-articles-section" i]',
  '[data-orientation="vertical"]',
  '.gh-header-sticky',
  '[data-testid="issue-metadata-sticky"]',
]

// ---------------------------------------------------------------------------
// PARTIAL_SELECTORS — substring patterns matched against TEST_ATTRIBUTES.
// Used only in post-clean phase.
// ---------------------------------------------------------------------------
export const PARTIAL_SELECTORS: string[] = [
  'a-statement',
  'access-wall',
  'activitypub',
  'actioncall',
  'addcomment',
  'advert',
  'adlayout',
  'ad-tldr',
  'ad-placement',
  'ads-container',
  '_ad_',
  'after_content',
  'after_main_article',
  'afterpost',
  'allterms',
  '-alert-',
  'alert-box',
  'appendix',
  '_archive',
  'around-the-web',
  'aroundpages',
  'article-author',
  'article-badges',
  'article-banner',
  'article-bottom-section',
  'article-bottom',
  'article-category',
  'article-card',
  'article-citation',
  // Note: 'article__copy' intentionally omitted — BEM __copy = article body text in many CMS systems
  'article_date',
  'article-date',
  'article-end ',
  'article_header',
  'article-header',
  'article__header',
  'article__hero',
  'article__info',
  'article-info',
  'article-meta',
  'article_meta',
  'article__meta',
  'articlename',
  'article-subject',
  'article_subject',
  'article-snippet',
  'article-separator',
  'article--share',
  'article--topics',
  'articletags',
  'article-tags',
  'article_tags',
  'articletitle',
  'article-title',
  'article_title',
  'articletopics',
  'article-topics',
  'article--lede',
  'articlewell',
  'associated-people',
  'audio-card',
  'author-bio',
  'author-box',
  'author-info',
  'author_info',
  'authorm',
  'author-mini-bio',
  'author-name',
  'author-publish-info',
  'authored-by',
  'avatar',
  'back-to-top',
  'backlink_container',
  'backlinks-section',
  'bio-block',
  'biobox',
  'blog-pager',
  'bookmark-',
  '-bookmark',
  'bottominfo',
  'bottomnav',
  'bottom-of-article',
  'bottom-wrapper',
  'brand-bar',
  'breadcrumb',
  'brdcrumb',
  'button-wrapper',
  'buttons-container',
  'btn-',
  '-btn',
  'byline',
  'captcha',
  'card-text',
  'card-media',
  'card-post',
  'carouselcontainer',
  'carousel-container',
  'cat_header',
  'catlinks',
  '_categories',
  'card-author',
  'card-content',
  'chapter-list',
  'collections',
  'comments',
  'commentbox',
  'comment-button',
  'commentcomp',
  'comment-content',
  'comment-count',
  'comment-form',
  'comment-number',
  'comment-respond',
  'comment-thread',
  'comment-wrap',
  'complementary',
  'consent',
  'contact-',
  'content-card',
  'content-topics',
  'contentpromo',
  'context-bar',
  'context-widget',
  'core-collateral',
  'cover-',
  'created-date',
  'creative-commons_',
  'c-subscribe',
  '_cta',
  '-cta',
  'cta-',
  'cta_',
  'current-issue',
  'custom-list-number',
  'dateline',
  'dateheader',
  'date-header',
  'date-pub',
  'disclaimer',
  'disclosure',
  'discussion',
  'discuss_',
  'disqus',
  'donate',
  'donation',
  'dropdown',
  'eletters',
  'emailsignup',
  'engagement-widget',
  'enhancement',
  'entry-author-info',
  'entry-categories',
  'entry-date',
  'entry-title',
  'entry-utility',
  '-error',
  'error-',
  'eyebrow',
  'expand-reduce',
  'external-anchor',
  'externallinkembedwrapper',
  'extra-services',
  'extra-title',
  'facebook',
  'fancy-box',
  'favorite',
  'featured-content',
  'feature_feed',
  'feedback',
  'feed-links',
  'field-site-sections',
  'fixheader',
  'floating-vid',
  'follower',
  'footer',
  'footnote-back',
  'footnoteback',
  'form-group',
  'for-you',
  'frontmatter',
  'further-reading',
  'fullbleedheader',
  'gated-',
  'gh-feed',
  'gist-meta',
  'goog-',
  'graph-view',
  'hamburger',
  'header_logo',
  'header-logo',
  'header-pattern',
  'hero-list',
  'hide-for-print',
  'hide-print',
  'hide-when-no-script',
  'hidden-print',
  'hidden-sidenote',
  'hidden-accessibility',
  'infoline',
  'instacartIntegration',
  'interlude',
  'interaction',
  'itemendrow',
  'invisible',
  'jumplink',
  'jump-to-',
  'js-skip-to-content',
  'keepreading',
  'keep-reading',
  'keep_reading',
  'keyword_wrap',
  'kicker',
  'labstab',
  '-labels',
  'language-name',
  'lastupdated',
  'latest-content',
  '-ledes-',
  '-license',
  'license-',
  'lightbox-popup',
  'like-button',
  'link-box',
  'links-grid',
  'links-title',
  'listing-dynamic-terms',
  'list-tags',
  'listinks',
  'loading',
  'loa-info',
  'logo_container',
  'ltx_role_refnum',
  'ltx_tag_bibitem',
  'ltx_error',
  'masthead',
  'marketing',
  'media-inquiry',
  '-menu',
  'menu-',
  'metadata',
  'might-like',
  'minibio',
  'more-about',
  '_modal',
  '-modal',
  'more-',
  'morenews',
  'morestories',
  'more_wrapper',
  'most-read',
  'move-helper',
  'mw-editsection',
  'mw-cite-backlink',
  'mw-indicators',
  'mw-jump-link',
  'nav-',
  'nav_',
  'navigation-post',
  'next-',
  'newsgallery',
  'news-story-title',
  'newsletter_',
  'newsletterbanner',
  'newslettercontainer',
  'newsletter-form',
  'newsletter-signup',
  'newslettersignup',
  'newsletterwidget',
  'newsletterwrapper',
  'not-found',
  'notessection',
  'nomobile',
  'noprint',
  'open-slideshow',
  'originally-published',
  'other-blogs',
  'outline-view',
  'pagehead',
  'page-header',
  'page-title',
  'paywall_message',
  '-partners',
  'permission-',
  'plea',
  'popular',
  'popup_links',
  'pop_stories',
  'pop-up',
  'post-author',
  'post-bottom',
  'post__category',
  'postcomment',
  'postdate',
  'post-date',
  'post_date',
  'post-details',
  'post-feeds',
  'postinfo',
  'post-info',
  'post_info',
  'post-inline-date',
  'post-links',
  'postlist',
  'post_list',
  'post_meta',
  'post-meta',
  'postmeta',
  'post_more',
  'postnavi',
  'post-navigation',
  'postpath',
  'post-preview',
  'postsnippet',
  'post_snippet',
  'post-snippet',
  'post-subject',
  'posttax',
  'post-tax',
  'post_tax',
  'posttag',
  'post_tag',
  'post-tag',
  'post_time',
  'posttitle',
  'post-title',
  'post_title',
  'post__title',
  'post-ufi-button',
  'prev-post',
  'prevnext',
  'prev_next',
  'prev-next',
  'previousnext',
  'press-inquiries',
  'print-none',
  'print-header',
  'print:hidden',
  'privacy-notice',
  'privacy-settings',
  'profile',
  'promo_article',
  'promo-bar',
  'promo-box',
  'pubdate',
  'pub_date',
  'pub-date',
  'publish_date',
  'publish-date',
  'publication-date',
  'publicationName',
  'qr-code',
  'qr_code',
  'quick_up',
  '_rail',
  'ratingssection',
  'read_also',
  'readmore',
  'read-next',
  'read_next',
  'read_time',
  'read-time',
  'reading_time',
  'reading-time',
  'reading-list',
  'recent-',
  'recent-articles',
  'recentpost',
  'recent_post',
  'recent-post',
  'recommend',
  'redirectedfrom',
  'recirc',
  'register',
  'related',
  'relevant',
  'reversefootnote',
  '_rss',
  'rss-link',
  'screen-reader-text',
  'scroll_to',
  'scroll-to',
  '_search',
  '-search',
  'section-nav',
  'series-banner',
  'share-box',
  'sharedaddy',
  'share-icons',
  'sharelinks',
  'share-post',
  'share-print',
  'share-section',
  'show-for-print',
  'sidebartitle',
  'sidebar-content',
  'sidebar-wrapper',
  'sideitems',
  'sidebar-author',
  'sidebar-item',
  'side-box',
  'side-logo',
  'sign-in-gate',
  'similar-',
  'similar_',
  'similars-',
  'site-index',
  'site-header',
  'siteheader',
  'site-logo',
  'site-name',
  'site-wordpress',
  'skip-content',
  'skip-to-content',
  'skip-link',
  'c-skip-link',
  '_skip-link',
  '-slider',
  'slug-wrap',
  'social-author',
  'social-shar',
  'social-date',
  'speechify-ignore',
  'speedbump',
  'sponsor',
  'springercitation',
  'sr-only',
  '_stats',
  'story-date',
  'story-navigation',
  'storyreadtime',
  'storysmall',
  'storypublishdate',
  'subject-label',
  'subhead',
  'submenu',
  '-subscribe-',
  'subscriber-drive',
  'subscription-',
  '_tags',
  'tags__item',
  'tag_list',
  'taxonomy',
  'table-of-contents',
  'tabs-',
  'terminaltout',
  'time-rubric',
  'timestamp',
  'time-read',
  'time-to-read',
  'tip_off',
  'tiptout',
  'toc-container',
  'toggle-caption',
  'tooltip',
  'topbar',
  'topic-list',
  'topic-subnav',
  'top-wrapper',
  'tree-item',
  'trending',
  'trust-feat',
  'trust-badge',
  'trust-project',
  'twitter',
  'u-hide',
  'upsell',
  'viewbottom',
  'visually-hidden',
  'welcomebox',
  'widget_pages',
]

// ---------------------------------------------------------------------------
// TEST_ATTRIBUTES — attributes to check for partial pattern matches.
// Extended from defuddle to cover data-* attributes used in real sites.
// ---------------------------------------------------------------------------
export const TEST_ATTRIBUTES: string[] = [
  'class',
  'id',
  // Test automation (from defuddle)
  'data-test',
  'data-testid',
  'data-test-id',
  'data-qa',
  'data-cy',
  // Real-site component/widget attributes
  'data-component',
  'data-module',
  'data-widget',
  'data-block',
  'data-type',
  'data-role',
  'data-section',
  'data-area',
  'data-region',
  'data-container',
]

// ---------------------------------------------------------------------------
// ALLOWED_ATTRIBUTES — attributes to keep during HTML normalization.
// MathML attributes removed from defuddle's list.
// ---------------------------------------------------------------------------
export const ALLOWED_ATTRIBUTES = new Set([
  'alt',
  'href',
  'src',
  'srcset',
  'title',
  'role',
  'aria-label',
  'colspan',
  'rowspan',
  'headers',
  'controls',
  'allow',
  'allowfullscreen',
  'width',
  'height',
  'data-lang',
  'data-src',
  'data-srcset',
  'dir',
  'lang',
  'type',
  'kind',
  'label',
  'srclang',
])

// ---------------------------------------------------------------------------
// ALLOWED_EMPTY_ELEMENTS — elements that may be empty without removal.
// ---------------------------------------------------------------------------
export const ALLOWED_EMPTY_ELEMENTS = new Set([
  'br',
  'hr',
  'img',
  'picture',
  'source',
  'video',
  'audio',
  'iframe',
  'embed',
  'td',
  'th',
  'svg',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'use',
  'defs',
  'g',
  'mask',
  'ellipse',
  'stop',
  'pattern',
])

// ---------------------------------------------------------------------------
// CleanerConfig — per-feed configuration for the cleaning pipeline.
// ---------------------------------------------------------------------------
export interface CleanerConfig {
  disablePreClean?: boolean
  excludePreClean?: string[]
  additionalPreClean?: string[]

  disablePostCleanSelectors?: boolean
  additionalExact?: string[]
  excludeExact?: string[]

  disablePartialSelectors?: boolean
  additionalPartial?: string[]
  excludePartial?: string[]

  disableScoring?: boolean
  scoringThresholdOffset?: number

  disableNormalization?: boolean
  additionalAllowedAttributes?: string[]
}

export interface PipelineConfig {
  preCleanSelectors: string[]
  postCleanSelectors: string[]
  partialSelectors: string[]
  allowedAttributes: Set<string>
  scoringEnabled: boolean
  scoringThresholdOffset: number
  normalizationEnabled: boolean
}

export function buildPipelineConfig(config?: CleanerConfig): PipelineConfig {
  // pre-clean
  let pre: string[] = []
  if (!config?.disablePreClean) {
    pre = [...PRE_CLEAN_SELECTORS]
    if (config?.excludePreClean) pre = pre.filter(s => !config.excludePreClean!.includes(s))
    if (config?.additionalPreClean) pre.push(...config.additionalPreClean)
  }

  // post-clean exact
  let post: string[] = []
  if (!config?.disablePostCleanSelectors) {
    post = [...POST_CLEAN_SELECTORS]
    if (config?.excludeExact) post = post.filter(s => !config.excludeExact!.includes(s))
    if (config?.additionalExact) post.push(...config.additionalExact)
  }

  // post-clean partial
  let partial: string[] = []
  if (!config?.disablePartialSelectors) {
    partial = [...PARTIAL_SELECTORS]
    if (config?.excludePartial) partial = partial.filter(s => !config.excludePartial!.includes(s))
    if (config?.additionalPartial) partial.push(...config.additionalPartial)
  }

  // allowed attributes
  const attrs = new Set(ALLOWED_ATTRIBUTES)
  if (config?.additionalAllowedAttributes) {
    config.additionalAllowedAttributes.forEach(a => attrs.add(a))
  }

  return {
    preCleanSelectors: pre,
    postCleanSelectors: post,
    partialSelectors: partial,
    allowedAttributes: attrs,
    scoringEnabled: !config?.disableScoring,
    scoringThresholdOffset: config?.scoringThresholdOffset ?? 0,
    normalizationEnabled: !config?.disableNormalization,
  }
}

// ---------------------------------------------------------------------------
// Selector validation — run at module load to filter out invalid selectors.
// Invalid selectors are skipped with a warning, never crash the pipeline.
// ---------------------------------------------------------------------------
function validateSelectorsOnce(selectors: string[], label: string): string[] {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
  const doc = dom.window.document
  const valid: string[] = []

  for (const sel of selectors) {
    try {
      doc.querySelectorAll(sel)
      valid.push(sel)
    } catch {
      log.warn(`Invalid selector in ${label}, skipping: ${sel}`)
    }
  }

  return valid
}

function validatePartialPatternsOnce(patterns: string[], label: string): string[] {
  const valid: string[] = []

  for (const p of patterns) {
    try {
      new RegExp(p, 'i')
      valid.push(p)
    } catch {
      log.warn(`Invalid pattern in ${label}, skipping: ${p}`)
    }
  }

  return valid
}

// Validate at module load — mutate the exported arrays in place so all
// consumers automatically use the validated versions.
const validatedPre = validateSelectorsOnce(PRE_CLEAN_SELECTORS, 'PRE_CLEAN_SELECTORS')
if (validatedPre.length !== PRE_CLEAN_SELECTORS.length) {
  PRE_CLEAN_SELECTORS.length = 0
  PRE_CLEAN_SELECTORS.push(...validatedPre)
}

const validatedPost = validateSelectorsOnce(POST_CLEAN_SELECTORS, 'POST_CLEAN_SELECTORS')
if (validatedPost.length !== POST_CLEAN_SELECTORS.length) {
  POST_CLEAN_SELECTORS.length = 0
  POST_CLEAN_SELECTORS.push(...validatedPost)
}

const validatedPartial = validatePartialPatternsOnce(PARTIAL_SELECTORS, 'PARTIAL_SELECTORS')
if (validatedPartial.length !== PARTIAL_SELECTORS.length) {
  PARTIAL_SELECTORS.length = 0
  PARTIAL_SELECTORS.push(...validatedPartial)
}

import DOMPurify from 'dompurify'

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'IMG') {
    node.setAttribute('loading', 'lazy')
  }
})

const PURIFY_CONFIG = {
  FORBID_TAGS: ['iframe'],
  ADD_TAGS: ['picture', 'source', 'video'],
  ADD_ATTR: ['loading', 'src', 'srcset', 'media', 'type', 'poster', 'controls', 'preload', 'playsinline', 'muted', 'loop'],
}

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, PURIFY_CONFIG) as string
}

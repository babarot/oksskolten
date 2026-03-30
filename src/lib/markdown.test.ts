// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { fixLegacyMarkdown, escapeNestedBrackets } from './markdown'

describe('fixLegacyMarkdown', () => {
  // --- Pattern 1: markdown link wrapping <picture> ---

  it('converts [<picture>...<img>...</picture>](url) to [![](src)](url)', () => {
    const input = '[<picture><source srcset="a.webp"><img src="img.jpg" alt=""></picture>](https://example.com)'
    expect(fixLegacyMarkdown(input)).toBe('[![](img.jpg)](https://example.com)')
  })

  it('preserves alt text in linked picture', () => {
    const input = '[<picture><source srcset="a.webp"><img src="img.jpg" alt="hero image"></picture>](https://example.com)'
    expect(fixLegacyMarkdown(input)).toBe('[![hero image](img.jpg)](https://example.com)')
  })

  it('handles whitespace/newlines between ] and (url)', () => {
    const input = `[<picture><source srcset="a.webp"><img src="img.jpg" alt="">
</picture>

](https://example.com/full.png)`
    expect(fixLegacyMarkdown(input)).toBe('[![](img.jpg)](https://example.com/full.png)')
  })

  it('handles complex Substack-style srcset URLs', () => {
    const input = `[<picture><source type="image/webp" srcset="https://substackcdn.com/image/fetch/$s_!AC1C!,w_424,c_limit,f_webp/https%3A%2F%2Fsubstack.com%2Fimg.png 424w, https://substackcdn.com/image/fetch/$s_!AC1C!,w_848/https%3A%2F%2Fsubstack.com%2Fimg.png 848w"><img src="https://substackcdn.com/image/fetch/w_1456/https%3A%2F%2Fsubstack.com%2Fimg.png" alt="chart"></picture>](https://substackcdn.com/image/fetch/f_auto/https%3A%2F%2Fsubstack.com%2Fimg.png)`
    const result = fixLegacyMarkdown(input)
    expect(result).toBe('[![chart](https://substackcdn.com/image/fetch/w_1456/https%3A%2F%2Fsubstack.com%2Fimg.png)](https://substackcdn.com/image/fetch/f_auto/https%3A%2F%2Fsubstack.com%2Fimg.png)')
  })

  // --- Pattern 2: standalone <picture> ---

  it('converts standalone <picture> to ![](src)', () => {
    const input = '<picture><source srcset="hero.webp"><img src="hero.jpg"></picture>'
    expect(fixLegacyMarkdown(input)).toBe('![](hero.jpg)')
  })

  it('preserves alt text in standalone picture', () => {
    const input = '<picture><img src="hero.jpg" alt="a hero shot"></picture>'
    expect(fixLegacyMarkdown(input)).toBe('![a hero shot](hero.jpg)')
  })

  it('handles multiline picture elements', () => {
    const input = `<picture>
  <source type="image/webp" srcset="hero.webp">
  <img src="hero.jpg" alt="hero">
</picture>`
    expect(fixLegacyMarkdown(input)).toBe('![hero](hero.jpg)')
  })

  // --- <source> cleanup ---

  it('removes stray <source> tags', () => {
    const input = 'before\n<source srcset="x">\nafter'
    expect(fixLegacyMarkdown(input)).toBe('before\n\nafter')
  })

  it('removes self-closing <source> tags', () => {
    const input = 'text <source srcset="a" type="image/webp" /> more'
    expect(fixLegacyMarkdown(input)).toBe('text  more')
  })

  it('preserves <source> tags inside <video>', () => {
    const input = '<video controls><source src="https://video.example.com/post.mp4" type="video/mp4"></video>'
    expect(fixLegacyMarkdown(input)).toBe(input)
  })

  // --- Fenced code block preservation ---

  it('does not transform <picture> inside fenced code blocks (```)', () => {
    const input = '```html\n<picture><source srcset="a.webp"><img src="img.jpg"></picture>\n```'
    expect(fixLegacyMarkdown(input)).toBe(input)
  })

  it('does not transform <picture> inside ~~~ fenced code blocks', () => {
    const input = '~~~\n<picture><img src="img.jpg"></picture>\n~~~'
    expect(fixLegacyMarkdown(input)).toBe(input)
  })

  it('does not remove <source> inside fenced code blocks', () => {
    const input = '```\n<source srcset="x">\n```'
    expect(fixLegacyMarkdown(input)).toBe(input)
  })

  it('transforms prose but preserves code blocks in mixed content', () => {
    const input = `Some text

<picture><img src="hero.jpg" alt="photo"></picture>

\`\`\`html
<picture><source srcset="demo.webp"><img src="demo.jpg"></picture>
\`\`\`

<picture><img src="footer.jpg" alt=""></picture>`
    const result = fixLegacyMarkdown(input)
    // Prose pictures should be converted
    expect(result).toContain('![photo](hero.jpg)')
    expect(result).toContain('![](footer.jpg)')
    // Code block should be untouched
    expect(result).toContain('<picture><source srcset="demo.webp"><img src="demo.jpg"></picture>')
  })

  // --- Multiple pictures ---

  it('handles multiple picture elements in one document', () => {
    const input = `<picture><img src="a.jpg" alt="first"></picture>

Some text between images.

<picture><img src="b.jpg" alt="second"></picture>`
    const result = fixLegacyMarkdown(input)
    expect(result).toContain('![first](a.jpg)')
    expect(result).toContain('![second](b.jpg)')
    expect(result).toContain('Some text between images.')
  })

  // --- Multi-line link collapsing ---

  it('collapses multi-line markdown links into single line', () => {
    const input = `[
GitHub CopilotWrite better code with AI


](https://github.com/features/copilot)`
    expect(fixLegacyMarkdown(input)).toBe('[GitHub CopilotWrite better code with AI](https://github.com/features/copilot)')
  })

  it('collapses multi-line links in a list context', () => {
    const input = `* [
GitHub SparkBuild apps


](https://github.com/features/spark)
* [
GitHub ModelsManage prompts


](https://github.com/features/models)`
    const result = fixLegacyMarkdown(input)
    expect(result).toContain('[GitHub SparkBuild apps](https://github.com/features/spark)')
    expect(result).toContain('[GitHub ModelsManage prompts](https://github.com/features/models)')
  })

  it('does not collapse multi-line links inside fenced code blocks', () => {
    const input = '```\n[\nsome link\n](https://example.com)\n```'
    expect(fixLegacyMarkdown(input)).toBe(input)
  })

  // --- No-op cases ---

  it('returns plain markdown unchanged', () => {
    const input = '# Hello\n\nSome **bold** text and an ![img](pic.jpg).'
    expect(fixLegacyMarkdown(input)).toBe(input)
  })

  it('leaves regular <img> tags untouched', () => {
    const input = '<img src="photo.jpg" alt="photo">'
    expect(fixLegacyMarkdown(input)).toBe(input)
  })
})

describe('escapeNestedBrackets', () => {
  it('escapes brackets in link text', () => {
    const input = '[[AINews] Anthropic study](https://example.com)'
    expect(escapeNestedBrackets(input)).toBe('[\\[AINews\\] Anthropic study](https://example.com)')
  })

  it('leaves links without brackets untouched', () => {
    const input = '[Normal title](https://example.com)'
    expect(escapeNestedBrackets(input)).toBe(input)
  })

  it('leaves image links untouched', () => {
    const input = '![alt text](https://example.com/img.jpg)'
    expect(escapeNestedBrackets(input)).toBe(input)
  })

  it('handles multiple links with brackets', () => {
    const input = '- [[AINews] Study A](https://a.com)\n- [[DevOps] Guide B](https://b.com)'
    expect(escapeNestedBrackets(input)).toBe(
      '- [\\[AINews\\] Study A](https://a.com)\n- [\\[DevOps\\] Guide B](https://b.com)',
    )
  })

  it('does not escape brackets inside fenced code blocks', () => {
    const input = '```\n[[AINews] Study](https://example.com)\n```'
    expect(escapeNestedBrackets(input)).toBe(input)
  })

  it('handles plain text with brackets (not links)', () => {
    const input = 'This is [just brackets] not a link'
    expect(escapeNestedBrackets(input)).toBe(input)
  })

  it('handles deeply nested brackets', () => {
    const input = '[Title [with [deep] nesting]](https://example.com)'
    expect(escapeNestedBrackets(input)).toBe('[Title \\[with \\[deep\\] nesting\\]](https://example.com)')
  })
})

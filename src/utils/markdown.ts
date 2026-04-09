/**
 * Converts markdown text to HTML suitable for Apple Notes.
 * Regex-based, no external dependencies.
 *
 * Supported elements:
 * - Headings (h1–h6)
 * - Bold, italic, bold+italic, strikethrough
 * - Inline code and fenced code blocks
 * - Links
 * - Unordered and ordered lists
 * - Blockquotes
 * - Horizontal rules
 * - Paragraphs and line breaks
 */
export function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Fenced code blocks (``` ... ```) — must be processed before inline elements
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`;
  });

  // Inline code (`...`) — before other inline formatting
  html = html.replace(/`([^`]+)`/g, (_match, code) => {
    return `<code>${escapeHtml(code)}</code>`;
  });

  // Headings (# to ######)
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Horizontal rules (---, ***, ___)
  html = html.replace(/^(?:[-*_]){3,}\s*$/gm, '<hr>');

  // Bold + italic (***text*** or ___text___)
  html = html.replace(/\*{3}(.+?)\*{3}/g, '<b><i>$1</i></b>');
  html = html.replace(/_{3}(.+?)_{3}/g, '<b><i>$1</i></b>');

  // Bold (**text** or __text__)
  html = html.replace(/\*{2}(.+?)\*{2}/g, '<b>$1</b>');
  html = html.replace(/_{2}(.+?)_{2}/g, '<b>$1</b>');

  // Italic (*text* or _text_)
  html = html.replace(/\*(.+?)\*/g, '<i>$1</i>');
  html = html.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<i>$1</i>');

  // Strikethrough (~~text~~)
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Links ([text](url))
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Process block-level elements (lists, blockquotes)
  html = processLists(html);
  html = processBlockquotes(html);

  // Paragraphs: convert remaining double newlines to paragraph breaks
  // Single newlines become <br>
  html = html
    .split('\n\n')
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // Don't wrap block-level elements in <p>
      if (/^<(?:h[1-6]|ul|ol|li|pre|blockquote|hr|p)/i.test(trimmed)) {
        return trimmed;
      }
      return `<p>${trimmed}</p>`;
    })
    .filter(Boolean)
    .join('\n');

  // Single newlines within paragraphs → <br>
  html = html.replace(/(<p>[\s\S]*?<\/p>)/g, (match) => {
    return match.replace(/\n/g, '<br>');
  });

  return html;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Converts markdown list blocks to HTML <ul>/<ol> lists.
 */
function processLists(html: string): string {
  // Unordered lists (- item, * item, + item)
  html = html.replace(/(?:^[ \t]*[-*+]\s+.+(?:\n|$))+/gm, (block) => {
    const items = block
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => `<li>${line.replace(/^[ \t]*[-*+]\s+/, '')}</li>`)
      .join('\n');
    return `<ul>\n${items}\n</ul>`;
  });

  // Ordered lists (1. item, 2. item)
  html = html.replace(/(?:^[ \t]*\d+\.\s+.+(?:\n|$))+/gm, (block) => {
    const items = block
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => `<li>${line.replace(/^[ \t]*\d+\.\s+/, '')}</li>`)
      .join('\n');
    return `<ol>\n${items}\n</ol>`;
  });

  return html;
}

/**
 * Converts markdown blockquotes (> text) to HTML <blockquote>.
 */
function processBlockquotes(html: string): string {
  return html.replace(/(?:^>\s?.+(?:\n|$))+/gm, (block) => {
    const content = block
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => line.replace(/^>\s?/, ''))
      .join('<br>');
    return `<blockquote>${content}</blockquote>`;
  });
}

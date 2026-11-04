// Allowlist HTML sanitizer for model output we render as markup (assistant
// replies, translate-tool furigana). Keeps only the given tags, with no
// attributes; other elements are unwrapped to their text, and dangerous
// containers are dropped with their content.

const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT']);

/**
 * @param {string} html
 * @param {object} options
 * @param {string[]} options.allow - tag names to keep, e.g. ['p', 'strong']
 * @param {(text: string, parent: Node) => void} [options.onText] - append a text
 *   node's content to `parent` (default: as a plain text node). Lets callers
 *   wrap parts of the text, e.g. reading highlights.
 * @returns {string}
 */
export function sanitizeHtml(html, { allow, onText }) {
  const allowed = new Set(allow.map((t) => t.toUpperCase()));
  const appendText = onText ?? ((text, parent) => parent.appendChild(document.createTextNode(text)));
  // <template> content is inert: nothing in it runs or loads while parsing.
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html ?? '');
  const out = document.createElement('div');

  /** @param {Node} from @param {Node} to */
  const walk = (from, to) => {
    for (const node of Array.from(from.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        appendText(node.textContent || '', to);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = /** @type {Element} */ (node).tagName;
        if (DROP_WITH_CONTENT.has(tag)) continue;
        if (allowed.has(tag)) {
          const el = document.createElement(tag.toLowerCase());
          walk(node, el);
          to.appendChild(el);
        } else {
          walk(node, to);
        }
      }
      // Comments and anything else are dropped.
    }
  };

  walk(tpl.content, out);
  return out.innerHTML;
}

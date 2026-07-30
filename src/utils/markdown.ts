/**
 * Small, dependency-free Markdown renderer for admin-authored content.
 *
 * Everything is HTML-escaped before any formatting is applied, so content
 * written in the admin portal can never inject markup into a page. Only a
 * deliberate subset of Markdown is supported: headings, bold, italic, inline
 * code, links, and lists.
 */

// Escaped text never contains a raw "<", so an angle-bracket sentinel can hold
// the place of inline code while the rest of the line is formatted.
const CODE_PLACEHOLDER_OPEN = "<%code";
const CODE_PLACEHOLDER_CLOSE = "%>";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Only allow link targets that cannot execute script. Values arrive already
 * HTML-escaped, which never changes these prefixes.
 */
export function sanitizeUrl(rawUrl: string): string | null {
  const url = rawUrl.trim();

  if (!url) {
    return null;
  }

  if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) {
    return url;
  }

  // Site-relative links and in-page anchors, but not protocol-relative URLs.
  if (/^\/(?!\/)/.test(url) || url.startsWith("#")) {
    return url;
  }

  return null;
}

function renderInline(text: string): string {
  const codeSegments: string[] = [];

  let html = text.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSegments.push(code);
    return `${CODE_PLACEHOLDER_OPEN}${codeSegments.length - 1}${CODE_PLACEHOLDER_CLOSE}`;
  });

  html = html.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_match, label: string, target: string) => {
      const safeUrl = sanitizeUrl(target);

      if (!safeUrl) {
        return label;
      }

      const attributes = /^https?:\/\//i.test(safeUrl)
        ? ' target="_blank" rel="noopener noreferrer"'
        : "";

      return `<a href="${safeUrl}"${attributes}>${label}</a>`;
    },
  );

  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return html.replace(
    new RegExp(`${CODE_PLACEHOLDER_OPEN}(\\d+)${CODE_PLACEHOLDER_CLOSE}`, "g"),
    (_match, index: string) =>
      `<code>${codeSegments[Number(index)] ?? ""}</code>`,
  );
}

export function renderContentMarkdown(markdown: string | undefined): string {
  if (!markdown) {
    return "";
  }

  const lines = escapeHtml(markdown).replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      blocks.push(`</${listType}>`);
      listType = null;
    }
  };

  const openList = (type: "ul" | "ol") => {
    if (listType !== type) {
      closeList();
      blocks.push(`<${type}>`);
      listType = type;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      // "#" maps to <h2> so admin content never competes with the page title.
      const level = Math.min(headingMatch[1].length + 1, 5);
      blocks.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      closeList();
      blocks.push("<hr />");
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (unorderedMatch) {
      openList("ul");
      blocks.push(`<li>${renderInline(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (orderedMatch) {
      openList("ol");
      blocks.push(`<li>${renderInline(orderedMatch[1])}</li>`);
      continue;
    }

    closeList();
    blocks.push(`<p>${renderInline(trimmed)}</p>`);
  }

  closeList();

  return blocks.join("\n");
}

/**
 * Strip Markdown syntax down to plain text, for summaries and meta tags.
 */
export function markdownToPlainText(markdown: string | undefined): string {
  if (!markdown) {
    return "";
  }

  return markdown
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

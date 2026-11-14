/**
 * Link assets — shortcuts to Google Docs (or any web page) kept in a project.
 *
 * A link is stored as an ordinary project asset: a tiny Windows Internet
 * Shortcut file (`<name>.url`). That way it needs no new storage schema,
 * works on every backend (browser library, SQLite, HTTP server), is mirrored
 * to Google Drive with the rest of the project's assets, and the `.url` file
 * that lands in the Drive folder still opens the doc when double-clicked.
 */

/** Mime type of a link asset (the registered type for `.url` files). */
export const LINK_MIME = 'application/internet-shortcut';

export type LinkKind = 'gdoc' | 'gsheet' | 'gslides' | 'gdrive' | 'web';

export interface LinkAssetLike { mime_type?: string; original_name?: string; filename?: string }

/** An http(s) URL, cleaned up, or null when `raw` isn't one. */
export function normalizeLinkUrl(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname.includes('.')) return null;
  return url.toString();
}

export function linkKind(url: string): LinkKind {
  let u: URL;
  try { u = new URL(url); } catch { return 'web'; }
  if (u.hostname === 'docs.google.com') {
    if (u.pathname.startsWith('/document/')) return 'gdoc';
    if (u.pathname.startsWith('/spreadsheets/')) return 'gsheet';
    if (u.pathname.startsWith('/presentation/')) return 'gslides';
  }
  if (u.hostname === 'drive.google.com') return 'gdrive';
  return 'web';
}

/** Small icon for a link of this kind. */
export function linkIcon(kind: LinkKind): string {
  switch (kind) {
    case 'gdoc': return '📄';
    case 'gsheet': return '📊';
    case 'gslides': return '📽';
    case 'gdrive': return '📁';
    default: return '🔗';
  }
}

/** The Google file id inside a docs.google.com / drive.google.com link, if any. */
export function googleFileId(url: string): string | null {
  const m = url.match(/\/d\/([A-Za-z0-9_-]{10,})/) ?? url.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

export function isLinkAsset(meta: LinkAssetLike | null | undefined): boolean {
  if (!meta) return false;
  if (meta.mime_type === LINK_MIME) return true;
  return /\.url$/i.test(meta.original_name ?? meta.filename ?? '');
}

/** The name shown for a link asset: its file name without `.url`. */
export function linkDisplayName(meta: LinkAssetLike): string {
  return (meta.original_name ?? meta.filename ?? '').replace(/\.url$/i, '');
}

/** Characters Windows, macOS and Drive all accept in a file name. */
function safeFileName(name: string): string {
  const printable = Array.from(name, (ch) => (ch.charCodeAt(0) < 32 ? ' ' : ch)).join('');
  const cleaned = printable.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 120) || 'Link';
}

export function linkFileText(url: string): string {
  return `[InternetShortcut]\r\nURL=${url}\r\n`;
}

/** Read the URL back out of a `.url` file's text. */
export function parseLinkFile(text: string): string | null {
  const m = text.match(/^\s*URL\s*=\s*(\S+)\s*$/im);
  return m ? normalizeLinkUrl(m[1]) : null;
}

/** The asset file for a link. `name` falls back to a label for its kind. */
export function makeLinkFile(url: string, name: string, fallbackName: string): File {
  const file = `${safeFileName(name.trim() || fallbackName)}.url`;
  return new File([linkFileText(url)], file, { type: LINK_MIME });
}

/** Text of the first `<a>` in an HTML snippet (what a browser puts on a dragged link). */
function anchorText(html: string): string {
  const m = html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
  if (!m) return '';
  return m[1]
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/** Minimal shape of DataTransfer the drop handler needs (keeps this testable in node). */
export interface DataTransferLike { getData(type: string): string; types?: readonly string[] | ArrayLike<string> }

/**
 * The link being dragged in, if any: a tab or address-bar URL from a browser,
 * a link from a page, or plain text that is a URL. The name is the link's
 * text when the browser offers it (Chrome does for tabs and links), and
 * never just the URL again.
 */
export function linkFromDataTransfer(dt: DataTransferLike): { url: string; name: string } | null {
  const uriList = dt.getData('text/uri-list') || '';
  const fromList = uriList.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
  const plain = (dt.getData('text/plain') || '').trim();
  const url = normalizeLinkUrl(fromList) ?? (/^https?:\/\//i.test(plain) ? normalizeLinkUrl(plain.split(/\s/)[0]) : null);
  if (!url) return null;
  let name = anchorText(dt.getData('text/html') || '');
  if (!name) {
    const title = (dt.getData('text/x-moz-url') || '').split(/\r?\n/)[1]?.trim() ?? '';
    name = title;
  }
  if (name && normalizeLinkUrl(name) === url) name = '';
  return { url, name };
}

/** Does this drag carry something linkFromDataTransfer could read? (dragover can't read data.) */
export function dragMayCarryLink(types: readonly string[] | ArrayLike<string> | undefined): boolean {
  if (!types) return false;
  const list = Array.from(types as ArrayLike<string>);
  return list.includes('text/uri-list') || list.includes('text/plain');
}

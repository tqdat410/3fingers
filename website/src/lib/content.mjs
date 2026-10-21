import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Marked } from 'marked';

// npm scripts run from website/, including Pages builds. Bundling relocates this module.
const root = path.resolve(process.cwd(), '..');
export const repository = 'https://github.com/tqdat410/3fingers';
export const download = `${repository}/releases/latest`;
export const sources = {
  en: { docs: 'docs/user-guide.en.md', guide: 'docs/user-guide.en.md', privacy: 'docs/privacy-policy.md' },
  vi: { docs: 'docs/user-guide.vi.md', guide: 'docs/user-guide.vi.md', privacy: 'docs/privacy-policy.vi.md' },
};

export function rewriteLink(href, source) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href)) return href;
  const [relative, hash = ''] = href.split('#');
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(source), relative));
  for (const [locale, pages] of Object.entries(sources)) {
    for (const [page, file] of Object.entries(pages)) {
      if (resolved === file) return `/${locale}/${page}/${hash ? `#${hash}` : ''}`;
    }
  }
  return `${repository}/blob/main/${resolved}${hash ? `#${hash}` : ''}`;
}

export async function documentHtml(locale, page) {
  const source = sources[locale][page];
  const markdown = await readFile(path.join(root, source), 'utf8');
  const parser = new Marked();
  parser.use({ walkTokens(token) {
    if (token.type === 'link' || token.type === 'image') token.href = rewriteLink(token.href, source);
    if (token.type === 'heading') {
      const slug = token.text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
      // Preserve existing guide bookmarks when visible titles are renamed or translated.
      const legacy = { '3fingers-docs': 'user-guide', 'tài-liệu-3fingers': 'hướng-dẫn-sử-dụng', 'kết-nối-mạng-xã-hội': 'kết-nối-social', 'sắp-xếp-khung': 'sắp-xếp-panel' };
      token.headingId = legacy[slug] || slug;
    }
  }, renderer: { heading(token) {
    return `<h${token.depth} id="${token.headingId}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
  } } });
  const html = parser.parse(markdown);
  if (page !== 'docs') return html;
  const privacy = (await documentHtml(locale, 'privacy')).replace(/<(\/?)h([1-5])\b/g, (_, close, level) => '<' + close + 'h' + (Number(level) + 1));
  return html + '\n<section class="docs-privacy">' + privacy + '</section>';
}

export function documentContents(html) {
  return Array.from(html.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g), match => ({
    id: match[2], label: match[3].replace(/<[^>]+>/g, ''), level: Number(match[1]),
  }));
}

export const text = {
  "en": {
    "docs": "Docs",
    "contents": "On this page",
    "available": "Available",
    "githubDownload": "Download .zip",
    "comingSoon": "Coming soon",
    "darkTheme": "Dark mode",
    "lightTheme": "Light mode",
    "install": "Ready in a few steps.",
    "fullGuide": "Installation guide",
    "steps": [
      {
        "title": "Download",
        "body": "Open the latest GitHub release and download the 3fingers ZIP from Assets."
      },
      {
        "title": "Add to Chrome",
        "body": "Extract the ZIP. Open chrome://extensions, turn on Developer mode, then choose Load unpacked and select the extracted folder."
      },
      {
        "title": "Open your feeds",
        "body": "Click 3fingers in the Chrome toolbar. Choose your social sites and allow access when asked."
      }
    ],
    "home": "Home",
    "guide": "User guide",
    "privacy": "Privacy",
    "download": "Download",
    "skip": "Skip to content",
    "intro": "Browse multiple social sites together in one tab.",
    "lang": "Language"
  },
  "vi": {
    "docs": "Docs",
    "contents": "Mục lục",
    "available": "Có sẵn",
    "githubDownload": "Tải .zip",
    "comingSoon": "Sắp ra mắt",
    "darkTheme": "Chế độ tối",
    "lightTheme": "Chế độ sáng",
    "install": "Bắt đầu sau vài bước.",
    "fullGuide": "Hướng dẫn cài đặt",
    "steps": [
      {
        "title": "Tải xuống",
        "body": "Mở bản phát hành mới nhất trên GitHub, tải tệp ZIP của 3fingers trong mục Assets."
      },
      {
        "title": "Thêm vào Chrome",
        "body": "Giải nén ZIP. Mở chrome://extensions, bật Chế độ dành cho nhà phát triển, chọn Tải tiện ích đã giải nén rồi chọn thư mục vừa giải nén."
      },
      {
        "title": "Mở bảng tin",
        "body": "Bấm 3fingers trên thanh công cụ Chrome. Chọn các mạng xã hội và cấp quyền khi được hỏi."
      }
    ],
    "home": "Trang chủ",
    "guide": "Hướng dẫn",
    "privacy": "Quyền riêng tư",
    "download": "Tải xuống",
    "skip": "Đến nội dung",
    "intro": "Lướt đồng thời nhiều trang mạng xã hội trong cùng một tab.",
    "lang": "Ngôn ngữ"
  }
};

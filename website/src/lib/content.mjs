import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Marked } from 'marked';

// npm scripts run from website/, including Pages builds. Bundling relocates this module.
const root = path.resolve(process.cwd(), '..');
export const repository = 'https://github.com/tqdat410/3fingers';
export const download = `${repository}/releases/latest`;
export const sources = {
  en: { guide: 'docs/user-guide.en.md', privacy: 'docs/privacy-policy.md' },
  vi: { guide: 'docs/user-guide.vi.md', privacy: 'docs/privacy-policy.vi.md' },
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
      // Match GitHub-style heading anchors so the shared Markdown links keep working.
      token.headingId = token.text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    }
  }, renderer: { heading(token) {
    return `<h${token.depth} id="${token.headingId}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
  } } });
  return parser.parse(markdown);
}

export const text = {
  en: {
    forChrome: 'A small extension for desktop Chrome.',
    supported: 'Your social feeds',
    install: 'Ready in a few steps.',
    fullGuide: 'Installation guide',
    steps: [
      { title: 'Download', body: 'Open the latest GitHub release and download the 3fingers ZIP from Assets.' },
      { title: 'Add to Chrome', body: 'Extract the ZIP. Open chrome://extensions, turn on Developer mode, then choose Load unpacked and select the extracted folder.' },
      { title: 'Open your feeds', body: 'Click 3fingers in the Chrome toolbar. Choose your social sites and allow access when asked.' },
    ],
    home: 'Home', guide: 'User guide', privacy: 'Privacy', download: 'Download', skip: 'Skip to content', intro: 'Read social feeds side by side in one Chrome tab.', detail: 'Up to three panels. Sync eligible feeds, or scroll each one independently.', note: 'For desktop Chrome. Install the ZIP from GitHub. Not on the Chrome Web Store yet.', heading: 'Your feeds, side by side.', sites: 'Facebook, Instagram, Threads, TikTok, X, Reddit and YouTube Shorts.', independent: 'TikTok and YouTube Shorts keep their own video navigation. Social sites can change and break compatibility.', local: 'Your workspace stays local.', privacyNote: 'No 3fingers account, analytics or product server. Social sites still receive your activity.', readGuide: 'Read the guide', footer: 'An independent, open source Chrome extension.', lang: 'Language' },
  vi: {
    forChrome: 'Một tiện ích nhỏ cho Chrome trên máy tính.',
    supported: 'Các bảng tin của bạn',
    install: 'Bắt đầu sau vài bước.',
    fullGuide: 'Hướng dẫn cài đặt',
    steps: [
      { title: 'Tải xuống', body: 'Mở bản phát hành mới nhất trên GitHub, tải tệp ZIP của 3fingers trong mục Assets.' },
      { title: 'Thêm vào Chrome', body: 'Giải nén ZIP. Mở chrome://extensions, bật Chế độ dành cho nhà phát triển, chọn Tải tiện ích đã giải nén rồi chọn thư mục vừa giải nén.' },
      { title: 'Mở bảng tin', body: 'Bấm 3fingers trên thanh công cụ Chrome. Chọn các mạng xã hội và cấp quyền khi được hỏi.' },
    ],
    home: 'Trang chủ', guide: 'Hướng dẫn', privacy: 'Quyền riêng tư', download: 'Tải xuống', skip: 'Đến nội dung', intro: 'Đọc các bảng tin mạng xã hội cạnh nhau trong một tab Chrome.', detail: 'Tối đa ba khung. Đồng bộ bảng tin được hỗ trợ hoặc cuộn từng khung riêng.', note: 'Dành cho Chrome trên máy tính. Cài bản ZIP từ GitHub. Chưa có trên Chrome Web Store.', heading: 'Các bảng tin, đặt cạnh nhau.', sites: 'Facebook, Instagram, Threads, TikTok, X, Reddit và YouTube Shorts.', independent: 'TikTok và YouTube Shorts giữ cách điều hướng video riêng. Thay đổi từ mạng xã hội có thể ảnh hưởng khả năng tương thích.', local: 'Không gian làm việc lưu cục bộ.', privacyNote: 'Không tài khoản 3fingers, phân tích sử dụng hay máy chủ sản phẩm. Mạng xã hội vẫn nhận hoạt động của bạn.', readGuide: 'Đọc hướng dẫn', footer: 'Tiện ích Chrome mã nguồn mở, phát triển độc lập.', lang: 'Ngôn ngữ' },
};

// Apply the saved theme before catalog loading so popup reopen keeps its first paint.
let bindAttribute = (node, attribute, value) => node.setAttribute(attribute, value);
function apply(mode) {
  document.documentElement.dataset.theme = mode === 'dark' ? 'dark' : 'light';
  const button = document.querySelector('#tool-theme');
  if (button) {
    const dark = mode === 'dark';
    button.setAttribute('aria-pressed', String(dark));
    bindAttribute(button, 'title', dark ? 'Light tool theme' : 'Dark tool theme');
    bindAttribute(button, 'aria-label', button.title);
  }
}
const saved = await chrome.storage.local.get('toolTheme');
apply(saved.toolTheme);
void import('./i18n.js').then(localization => {
  bindAttribute = localization.bindAttribute;
  apply(document.documentElement.dataset.theme);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.toolTheme) apply(changes.toolTheme.newValue);
});
export async function toggleToolTheme() {
  const mode = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  await chrome.storage.local.set({ toolTheme: mode });
  apply(mode);
}

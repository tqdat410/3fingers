function apply(mode) {
  document.documentElement.dataset.theme = mode === 'dark' ? 'dark' : 'light';
  const button = document.querySelector('#tool-theme');
  if (button) {
    const dark = mode === 'dark';
    button.setAttribute('aria-pressed', String(dark));
    button.title = dark ? 'Light tool theme' : 'Dark tool theme';
    button.setAttribute('aria-label', button.title);
  }
}
const saved = await chrome.storage.local.get('toolTheme');
apply(saved.toolTheme);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.toolTheme) apply(changes.toolTheme.newValue);
});
export async function toggleToolTheme() {
  const mode = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  await chrome.storage.local.set({ toolTheme: mode });
  apply(mode);
}

const workspaceUrl = chrome.runtime.getURL('myfeeds.html');
const legacyWorkspaceUrl = chrome.runtime.getURL('workspace.html');
let openingWorkspace;

export async function findWorkspace(windowId) {
  windowId ??= (await chrome.windows.getCurrent()).id;
  const workspaces = (await chrome.tabs.query({})).filter(tab => [workspaceUrl, legacyWorkspaceUrl].includes(tab.pendingUrl || tab.url));
  return workspaces.find(tab => tab.active && tab.windowId === windowId)
    || workspaces.find(tab => tab.windowId === windowId) || workspaces[0];
}

export function openWorkspace(windowId) {
  if (openingWorkspace) return openingWorkspace;
  openingWorkspace = (async () => {
    const tab = await findWorkspace(windowId);
    if (tab) {
      await chrome.tabs.update(tab.id, { active: true, ...((tab.pendingUrl || tab.url) === legacyWorkspaceUrl ? { url: workspaceUrl } : {}) });
      await chrome.windows.update(tab.windowId, { focused: true });
      return tab;
    }
    return chrome.tabs.create({ url: workspaceUrl, ...(windowId == null ? {} : { windowId }) });
  })().finally(() => { openingWorkspace = null; });
  return openingWorkspace;
}

export function updateActionPopup(tab) {
  return chrome.action.setPopup({ tabId: tab.id, popup: tab.url === workspaceUrl ? 'popup.html' : '' });
}

export async function handleActionClick(tab) {
  const current = await chrome.tabs.get(tab.id);
  if (current.url === workspaceUrl) {
    await updateActionPopup(current);
    return chrome.action.openPopup({ windowId: current.windowId });
  }
  return openWorkspace(current.windowId);
}

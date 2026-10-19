export function builtinThemeControls(host) {
  const youtube = host === 'www.youtube.com', reddit = host === 'www.reddit.com', facebook = host === 'www.facebook.com';
  const menu = `<div id="builtin-theme-menu" role="menu" hidden style="position:fixed;right:0;top:0;z-index:20;background:white;color:black">`;
  let html;
  if (youtube) html = `<ytd-app><button id="avatar-btn">Account</button></ytd-app><tp-yt-iron-dropdown id="builtin-dropdown" hidden style="position:fixed;right:0;top:0;z-index:20"><ytd-multi-page-menu-renderer><ytd-toggle-theme-compact-link-renderer>Appearance</ytd-toggle-theme-compact-link-renderer><div id="builtin-choices" hidden>${['Use device theme', 'Dark theme', 'Light theme'].map(label => `<ytd-compact-link-renderer>${label}</ytd-compact-link-renderer>`).join('')}</div></ytd-multi-page-menu-renderer></tp-yt-iron-dropdown>`;
  else if (reddit) html = `<shreddit-app></shreddit-app><button id="expand-user-drawer-button" aria-expanded="false">Account</button>${menu}<li id="darkmode-list-item"><div tabindex="0">Theme</div></li></div><rpl-modal-card id="builtin-choices" hidden style="position:fixed;top:0;right:0;z-index:21">${['Device', 'Light', 'Dark'].map((label, index) => `<li data-testid="theme-option-${index}"><div role="option" aria-selected="false">${label}</div></li>`).join('')}</rpl-modal-card>`;
  else html = `${facebook ? '<div role="button" aria-label="Your profile" tabindex="0" id="builtin-trigger">Account</div>' : `<nav style="position:fixed;top:0;left:0;z-index:20"><button id="builtin-trigger"><svg aria-label="${host === 'www.instagram.com' ? 'Settings' : 'More'}"></svg></button></nav>`}${menu}<button id="builtin-appearance">${facebook ? 'Display and accessibility' : 'Appearance'}</button><div id="builtin-choices" hidden>${facebook ? '<label>Off<input type="radio" name="dark-mode" value="DISABLED"></label><label>On<input type="radio" name="dark-mode" value="ENABLED"></label>' : '<button data-native-mode="light">Light</button><button data-native-mode="dark">Dark</button>'}</div></div>`;
  return html + `<button id="unrelated-theme-title">Appearance</button><button id="unrelated-dark-choice">Dark</button><script>
    window.nativeThemeCalls=[];
    window.unrelatedThemeClicks=0;
    for(const id of ['unrelated-theme-title','unrelated-dark-choice'])document.getElementById(id).onclick=()=>window.unrelatedThemeClicks++;
    const host=${JSON.stringify(host)};
    const nativeApply=(mode,save=true)=>{
      document.documentElement.classList.toggle('theme-dark',host==='www.reddit.com'&&mode==='dark');
      document.documentElement.classList.toggle('theme-light',host==='www.reddit.com'&&mode==='light');
      if(host==='www.youtube.com')document.documentElement.toggleAttribute('dark',mode==='dark');
      if(!['www.reddit.com','www.youtube.com'].includes(host)){
        document.documentElement.classList.toggle('__fb-dark-mode',mode==='dark');
        document.documentElement.classList.toggle('__fb-light-mode',mode==='light');
        if(host==='www.instagram.com'){document.documentElement.classList.toggle('_aa4d',mode==='dark');document.documentElement.classList.toggle('_aa4c',mode==='light');}
      }
      document.documentElement.style.colorScheme=mode;
      if(save){window.nativeThemeCalls.push(mode);localStorage.setItem('site-theme-preference',mode);}
    };
    window.nativeChooseTheme=nativeApply;
    nativeApply(['dark','light'].includes(localStorage.getItem('site-theme-preference'))?localStorage.getItem('site-theme-preference'):'light',false);
    const choices=document.querySelector('#builtin-choices');
    const menu=document.querySelector('#builtin-theme-menu');
    if(host==='www.youtube.com'){
      const dropdown=document.querySelector('#builtin-dropdown');
      dropdown.close=()=>{dropdown.hidden=true;choices.hidden=true;};
      document.querySelector('#avatar-btn').onclick=()=>{dropdown.hidden=false;};
      document.querySelector('ytd-toggle-theme-compact-link-renderer').addEventListener('tap',()=>{if(!window.nativeThemeBlocked)choices.hidden=false;});
      document.querySelectorAll('ytd-compact-link-renderer').forEach((item,index)=>item.addEventListener('tap',()=>nativeApply(index===1?'dark':'light')));
      document.addEventListener('keydown',event=>{if(event.key==='Escape')dropdown.close();});
    }else if(host==='www.reddit.com'){
      const drawer=document.querySelector('#expand-user-drawer-button');
      drawer.onclick=()=>{const open=drawer.getAttribute('aria-expanded')!=='true';drawer.setAttribute('aria-expanded',String(open));menu.hidden=!open;};
      document.querySelector('#darkmode-list-item [tabindex]').onclick=()=>{if(!window.nativeThemeBlocked)choices.hidden=false;};
      choices.querySelectorAll('[role="option"]').forEach((item,index)=>item.onclick=()=>{nativeApply(index===2?'dark':'light');choices.hidden=true;});
      document.addEventListener('keydown',event=>{if(event.key==='Escape')choices.hidden=true;});
    }else{
      document.querySelector('#builtin-trigger').onclick=()=>{menu.hidden=!menu.hidden;};
      document.querySelector('#builtin-appearance').onclick=()=>{if(!window.nativeThemeBlocked)choices.hidden=false;};
      document.querySelectorAll('input[name="dark-mode"]').forEach(input=>input.onclick=()=>nativeApply(input.value==='ENABLED'?'dark':'light'));
      document.querySelectorAll('[data-native-mode]').forEach(button=>button.onclick=()=>nativeApply(button.dataset.nativeMode));
      document.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.hidden=true;choices.hidden=true;}});
    }
  </script>`;
}

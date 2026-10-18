export function nativeThemeControls() {
  return `<div data-key-interaction="side_nav"><button data-e2e="nav-more-menu" aria-pressed="false" style="position:static">More</button>
    <div id="native-theme-menu" class="DivDrawerContainer" hidden><div data-testid="tux-segmented-control">
      <button data-testid="tux-segment-item" data-mode="site" style="position:static">System</button>
      <button data-testid="tux-segment-item" data-mode="dark" style="position:static">Dark</button>
      <button data-testid="tux-segment-item" data-mode="light" style="position:static">Light</button>
    </div><button class="StyledTUXMoreCloseButton">Close</button></div></div><span id="native-engagement" style="color:rgb(22,24,35)">42</span>
    <script>
      window.nativeThemeCalls=[];
      window.visibleNativeDrawerFrames=0;
      const sampleDrawer=()=>{const drawer=document.querySelector('#native-theme-menu');if(drawer?.getClientRects().length&&getComputedStyle(drawer).visibility==='visible')window.visibleNativeDrawerFrames++;requestAnimationFrame(sampleDrawer);};
      requestAnimationFrame(sampleDrawer);
      const nativeMore=document.querySelector('[data-e2e="nav-more-menu"]');
      const nativeThemeMenu=document.querySelector('#native-theme-menu');
      nativeMore.onclick=()=>setTimeout(()=>{nativeThemeMenu.hidden=false;nativeMore.setAttribute('aria-pressed','true');},25);
      document.querySelector('.StyledTUXMoreCloseButton').onclick=()=>{nativeMore.setAttribute('aria-pressed','false');setTimeout(()=>{nativeThemeMenu.hidden=true;},50);};
      document.addEventListener('keydown',event=>{if(event.key==='Escape'){nativeThemeMenu.hidden=true;nativeMore.setAttribute('aria-pressed','false');}});
      for(const button of document.querySelectorAll('[data-testid="tux-segment-item"]'))button.onclick=()=>{
        const mode=button.dataset.mode==='site'?'light':button.dataset.mode;
        window.nativeThemeCalls.push(mode);
        document.cookie='tiktok_webapp_theme='+mode+'; Path=/';
        const selected=document.cookie.split(';').some(value=>value.trim()==='tiktok_webapp_theme='+mode)?mode:'light';
        document.documentElement.dataset.theme=selected;document.documentElement.setAttribute('data-tux-color-scheme',selected);
        document.querySelector('#native-engagement').style.color=selected==='dark'?'rgb(255,255,255)':'rgb(22,24,35)';
      };
    </script>`;
}

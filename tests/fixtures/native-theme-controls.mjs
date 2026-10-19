export function nativeThemeControls() {
  return String.raw`<div data-key-interaction="side_nav"><button data-e2e="nav-more-menu" aria-pressed="false" style="position:static">More</button>
    <div id="native-theme-menu" class="DivDrawerContainer" hidden><div data-testid="tux-segmented-control">
      <button data-testid="tux-segment-item" data-mode="site" style="position:static">System</button>
      <button data-testid="tux-segment-item" data-mode="dark" style="position:static">Dark</button>
      <button data-testid="tux-segment-item" data-mode="light" style="position:static">Light</button>
    </div><button class="StyledTUXMoreCloseButton">Close</button></div></div><span id="native-engagement" style="color:rgb(22,24,35)">42</span>
    <script>
      window.nativeThemeCalls=[];
      // Representative app bundle: the provider and its own cookie library.
      const factories={1:function(module,exports){
        const create=(converter,attributes)=>Object.create({
          set:function(name,value,options={}){const attrs={...attributes,...options};document.cookie=name+'='+converter.write(value)+Object.entries(attrs).map(([key,value])=>'; '+key+'='+value).join('');},
          get:function(name){const value=document.cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith(name+'='));return value?converter.read(value.slice(name.length+1)):undefined;},
          withAttributes:function(options){return create(converter,{...attributes,...options});},
          withConverter:function(next){return create({...converter,...next},attributes);}
        },{attributes:{value:Object.freeze(attributes)},converter:{value:Object.freeze(converter)}});
        exports.A=create({read:decodeURIComponent,write:encodeURIComponent},{path:'/'});
      },2:function(module,exports,require){
        var cookie=require(1);
        let option=cookie.A.get('tiktok_webapp_theme_source')||'light';
        const value={value:false,currentThemeOption:option,toggle(){},setCurrentThemeOption:function(mode){value.currentThemeOption=mode;cookie.A.set('tiktok_webapp_theme_source',mode);setTimeout(()=>{if(!window.nativeThemeBlocked){const selected=cookie.A.get('tiktok_webapp_theme_manual')==='1'?mode:'light';cookie.A.set('tiktok_webapp_theme',selected);window.nativeThemeCalls.push(selected);document.documentElement.dataset.theme=selected;document.documentElement.dataset.tuxColorScheme=selected;document.querySelector('#native-engagement').style.color=selected==='dark'?'rgb(255,255,255)':'rgb(22,24,35)';}},30);}};
        document.body['__reactContainer$fixture']={current:{memoizedProps:{value}}};
        document.documentElement.dataset.theme=cookie.A.get('tiktok_webapp_theme')||'light';
        document.documentElement.dataset.tuxColorScheme=document.documentElement.dataset.theme;
      }};
      const cache={};const runtime=id=>{if(!cache[id]){cache[id]={exports:{}};factories[id](cache[id],cache[id].exports,runtime);}return cache[id].exports;};runtime.m=factories;
      runtime(2);
      window.__LOADABLE_LOADED_CHUNKS__=[];window.__LOADABLE_LOADED_CHUNKS__.push=chunk=>chunk[2](runtime);

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

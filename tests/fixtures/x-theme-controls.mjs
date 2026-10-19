export function xThemeControls() {
  return `<style>html[data-theme="light"]{background:#fff;color:#0f1419}html[data-theme="dark"]{background:#000;color:#e7e9ea}</style>
    <div id="react-root"><button data-testid="AppTabBar_More_Menu">More</button><div id="native-display"></div></div>
    <script>
      document.documentElement.dataset.theme='light';
      document.documentElement.style.colorScheme='light';
      window.nativeThemeCalls=[];
      window.nativeThemeRoutes=[];
      const renderDisplay=()=>{
        window.nativeThemeRoutes.push(location.pathname);
        const display=document.querySelector('#native-display');
        display.replaceChildren();
        if(location.pathname!=='/i/display'||window.nativeThemeBlocked)return;
        for(const [index,label] of ['Light','Lights out'].entries()){
          const radio=document.createElement('input');radio.type='radio';radio.name='background-picker';radio.setAttribute('aria-label',label);
          radio.onclick=()=>{const mode=index?'dark':'light';window.nativeThemeCalls.push(mode);document.documentElement.dataset.theme=mode;document.documentElement.style.colorScheme=mode;};
          display.append(radio);
        }
      };
      addEventListener('popstate',()=>setTimeout(renderDisplay,20));
      renderDisplay();
    </script>`;
}

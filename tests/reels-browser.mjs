import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {builtinThemeControls} from './fixtures/builtin-theme-controls.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const temporary=await mkdtemp(path.join(tmpdir(),'3fingers-reels-'));
let context;
async function until(read,predicate,label){const deadline=Date.now()+12000;let value;while(Date.now()<deadline){value=await read();if(predicate(value))return value;await new Promise(r=>setTimeout(r,50));}throw Error(label+': '+JSON.stringify(value));}
try{
  const extension=path.join(temporary,'extension');await cp('extension',extension,{recursive:true});
  const file=path.join(extension,'manifest.json'),manifest=JSON.parse(await readFile(file,'utf8'));
  const socialUrls=['https://www.facebook.com/','https://www.instagram.com/','https://www.threads.com/'];
  manifest.host_permissions=socialUrls.map(url=>url+'*');await writeFile(file,JSON.stringify(manifest));
  context=await chromium.launchPersistentContext(path.join(temporary,'profile'),{channel:'chromium',headless:true,viewport:{width:1440,height:900},args:['--disable-extensions-except='+extension,'--load-extension='+extension]});
  const errors=[];context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
  await context.route(/^https:\/\/www\.(facebook|instagram|threads)\.com\//,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}main{height:6000px}nav svg{width:20px;height:20px}</style>'+builtinThemeControls(new URL(route.request().url()).hostname)+'<main>Feed</main>'}));
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await worker.evaluate(urls=>chrome.storage.local.set({workspace:{panes:urls.map((url,index)=>({id:'social-'+index,url,enabled:true,pinned:false}))}}),socialUrls);
  const workspace=await context.newPage();await workspace.goto('chrome-extension://'+new URL(worker.url()).host+'/workspace.html');
  await until(()=>workspace.locator('.pane[data-status="connected"]').count(),n=>n===3,'feeds connect');
  const socialFrames=socialUrls.map(url=>workspace.frames().find(f=>f.url()===url));

  for (const index of [0, 1]) {
    const frame=socialFrames[index], pin=workspace.locator('.pane-drag-handle').nth(index);
    const peerIndex=index===0?1:0, peer=socialFrames[peerIndex];
    const originalHandle=await workspace.locator('.pane-frame').nth(index).elementHandle();
    const positions=()=>Promise.all(socialFrames.map(f=>f.evaluate(()=>scrollY)));
    const wheel=async targetIndex=>{
      const box=await workspace.locator('.pane-frame').nth(targetIndex).boundingBox();
      await workspace.mouse.move(box.x+box.width/2,box.y+box.height*.65);
      await workspace.mouse.wheel(0,140);
    };
    await frame.evaluate(()=>history.pushState({},'', '/reel/fixture'));
    await until(()=>pin.getAttribute('aria-disabled'),value=>value==='true','Reels temporarily disables sync pin');
    assert.equal(await pin.getAttribute('aria-pressed'),'true');
    const before=await positions();
    await wheel(peerIndex);
    await until(()=>peer.evaluate(()=>scrollY),top=>top>before[peerIndex]+30,'other feeds still scroll');
    await workspace.waitForTimeout(400);
    assert.equal(await frame.evaluate(()=>scrollY),before[index],'Reels ignores synced follower movement');
    const beforeReel=await positions();
    await wheel(index);
    await until(()=>frame.evaluate(()=>scrollY),top=>top>beforeReel[index]+30,'Reels retains native wheel');
    await workspace.waitForTimeout(400);
    for(const peerIndex of [0,1,2].filter(i=>i!==index))assert.equal((await positions())[peerIndex],beforeReel[peerIndex],'Reels does not send scroll to peers');
    await frame.evaluate(()=>history.pushState({},'', '/'));
    await until(()=>pin.getAttribute('aria-disabled'),value=>value==='false','feed restores user sync preference');
    assert.equal(await pin.getAttribute('aria-pressed'),'false');
    const beforeResume=await positions();
    await wheel(index);
    await until(positions,values=>values.every((top,i)=>top>beforeResume[i]+20),`feed ${index} resumes synchronized scrolling from ${JSON.stringify(beforeResume)}`);
    await pin.click();
    await frame.evaluate(()=>{history.pushState({},'', '/reels/');history.pushState({},'', '/');});
    await until(()=>pin.getAttribute('aria-disabled'),value=>value==='false','rapid route changes use the latest policy');
    assert.equal(await pin.getAttribute('aria-pressed'),'true','manual pin survives Reels and return');
    assert.equal((await worker.evaluate(()=>chrome.storage.local.get('workspace'))).workspace.panes[index].pinned,true);
    assert.equal(await originalHandle.evaluate(node=>node.isConnected),true,'Reels policy keeps the iframe document');
    await pin.click();
    for(const f of socialFrames)await f.evaluate(()=>scrollTo(0,0));
    await workspace.waitForTimeout(300);
  }
  console.log('PASS Facebook/Instagram Reels temporarily exclude both scroll directions, restore pins and preserve iframe documents');

  await worker.evaluate(async()=>{
    const {workspace}=await chrome.storage.local.get('workspace');
    workspace.panes[0].url='https://www.facebook.com/reel/direct';
    await chrome.storage.local.set({workspace});
  });
  await workspace.reload();
  await until(()=>workspace.locator('.pane[data-status="connected"]').count(),n=>n===3,'direct Reels workspace connects');
  const directPin=workspace.locator('.pane-drag-handle').first();
  await until(()=>directPin.getAttribute('aria-disabled'),value=>value==='true','direct Reels URL starts independently');
  const directFrame=workspace.frames().find(f=>f.url()==='https://www.facebook.com/reel/direct');
  await directFrame.evaluate(()=>history.pushState({},'', '/'));
  await until(()=>directPin.getAttribute('aria-disabled'),value=>value==='false','leaving a configured Reels URL uses live feed policy');
  assert.equal(await directPin.getAttribute('aria-pressed'),'false');
  await directPin.click();
  await until(()=>worker.evaluate(()=>chrome.storage.local.get('workspace')),data=>data.workspace.panes[0].pinned===true,'manual pin remains available on feed');
  console.log('PASS initial Reels load and return use the live route while keeping the configured URL and user pin independent');

  assert.deepEqual(errors,[]);
}finally{await context?.close();await rm(temporary,{recursive:true,force:true});}

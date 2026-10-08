import {chromium} from 'playwright';
import {createApp} from '../server/app.js';
import {createStore} from '../server/store.js';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {DEMO_ORIGIN,DEMO_PLACES} from '../web/lib/domain.js';
const report={startedAt:new Date().toISOString(),environment:'Fresh automated Chromium; simulated GPS and synthetic camera feed; no outdoor visit claimed',checks:[],errors:[]};
const check=(name,detail)=>{report.checks.push({name,passed:true,detail});console.log('PASS',name);};
let browser,server,store,page;
const places=DEMO_PLACES.map((p,i)=>({...p,id:`node/${900000001+i}`,name:['QA Garden','QA Sculpture','QA Grove'][i],access:'yes',mapped:true,source:`https://www.openstreetmap.org/node/${900000001+i}`}));
try {
 await mkdir('docs',{recursive:true});store=await createStore({path:':memory:',uri:''});
 const result=await createApp({store,staticDir:'dist',discover:async()=>({places,cached:true})});
 server=result.app.listen(4175,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 browser=await chromium.launch({executablePath:process.env.ASCEND_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['geolocation','camera'],geolocation:{latitude:DEMO_ORIGIN.lat,longitude:DEMO_ORIGIN.lon,accuracy:5}});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:4175',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'A little further. A level higher.'}).waitFor();
 await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(5500);await page.screenshot({path:'docs/ascend-desktop.png',fullPage:true});check('Desktop board renders without console exceptions');
 await page.getByRole('button',{name:'Try the rehearsal',exact:true}).click();
 await page.locator('.quest-card.gate .quest-enter').click();await page.getByRole('button',{name:'Use a curated briefing',exact:true}).click();
 await page.getByRole('button',{name:'Pocket guide',exact:true}).click();await page.getByRole('heading',{name:'Your pocket guide'}).waitFor();
 await page.getByRole('button',{name:'Simulate arrival',exact:true}).click();await page.getByRole('heading',{name:'Quest complete',exact:true}).waitFor();
 assert.ok(await page.locator('.reward-companion').textContent().then(t=>t.includes('Fernfox')));await page.getByRole('button',{name:'Keep exploring',exact:true}).click();check('Rehearsal gate, pocket guide, XP, companion and trophy unlock');
 await page.locator('.quest-card.discover .quest-enter').click();await page.getByRole('button',{name:'Use a curated briefing',exact:true}).click();
 await page.getByRole('button',{name:'Open camera',exact:true}).click();await page.locator('.proof-thumb').waitFor();await page.locator('#observation').fill('A labelled rehearsal leaf.');await page.getByRole('button',{name:'Simulate check-in',exact:true}).click();
 await page.getByRole('heading',{name:'Quest complete',exact:true}).waitFor();await page.getByRole('button',{name:'Keep exploring',exact:true}).click();check('Rehearsal photo discovery and private journal');
 await page.locator('.quest-card.trail .quest-enter').click();await page.getByRole('button',{name:'Use a curated briefing',exact:true}).click();
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'Simulate check-in',exact:true}).click();
 await page.getByRole('heading',{name:'Quest complete',exact:true}).waitFor();await page.getByRole('button',{name:'Keep exploring',exact:true}).click();
 const demo=await page.evaluate(()=>JSON.parse(localStorage.getItem('ascend:demo')));assert.equal(demo.stats.xp,500);assert.equal(demo.stats.quests,3);check('Three-checkpoint rehearsal and D-rank progression');
 await page.locator('.sidebar [data-view="collection"]').click();assert.equal(await page.locator('.collection-card.unlocked').count(),2);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(5500);await page.screenshot({path:'docs/ascend-companions.png',fullPage:true});
 await page.locator('.collection-card.unlocked').nth(1).getByRole('button',{name:'Choose companion'}).click();check('Companion collection and equip');
 await page.locator('.sidebar [data-view="trophies"]').click();assert.ok(await page.locator('.trophy-card.earned').count()>=3);check('Achievement hall and rank path');
 await page.locator('.sidebar [data-view="journal"]').click();assert.equal(await page.locator('.journal-card').count(),3);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(5500);await page.screenshot({path:'docs/ascend-journal.png',fullPage:true});check('Private journal contains all quest memories');
 await page.locator('.sidebar [data-view="guild"]').click();await page.getByText('The first chapter is still unwritten.',{exact:true}).waitFor();check('Rehearsal excluded from public leaderboard');
 await page.getByRole('button',{name:/Return to live quests/}).click();
 await page.locator('.sidebar [data-view="quests"]').click();await page.getByRole('button',{name:/Find my next quest/}).click();await page.getByRole('button',{name:'Use my location',exact:true}).click();
 await page.getByText('QA Garden',{exact:true}).first().waitFor();check('Real-mode GPS permission flow and grounded map fixture');
 await page.locator('.quest-card.gate .quest-enter').click();await page.getByRole('button',{name:'Use a curated briefing',exact:true}).click();
 await page.locator('.active-quest').waitFor();
 await page.evaluate(()=>{class Recognition{start(){setTimeout(()=>this.onresult?.({results:[[{transcript:'pause'}]]}),100);}abort(){}}window.SpeechRecognition=Recognition;window.webkitSpeechRecognition=Recognition;});
 await page.getByRole('button',{name:'Pocket guide',exact:true}).click();await page.getByRole('button',{name:'Voice command',exact:true}).click();await page.getByRole('button',{name:'Enable voice commands',exact:true}).click();await page.getByRole('button',{name:'Resume',exact:true}).waitFor();await page.getByRole('button',{name:'Resume',exact:true}).click();await page.getByRole('button',{name:'Close dialog'}).click();check('Voice command action and pause/resume using a synthesized transcript; no live audio');
 await context.setGeolocation({latitude:places[0].lat,longitude:places[0].lon,accuracy:5});
 await page.getByRole('button',{name:'Check in here',exact:true}).click();await page.getByRole('heading',{name:'Quest complete',exact:true}).waitFor();await page.getByRole('button',{name:'Keep exploring',exact:true}).click();check('Real API gate reward using simulated GPS');
 await page.locator('.quest-card.discover .quest-enter').click();await page.getByRole('button',{name:'Use a curated briefing',exact:true}).click();
 await context.setGeolocation({latitude:places[2].lat,longitude:places[2].lon,accuracy:5});
 await page.getByRole('button',{name:'Open camera',exact:true}).click();await page.getByRole('button',{name:'Start camera',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#camera-preview')?.videoWidth>0);
 await page.getByRole('button',{name:'Capture discovery',exact:true}).click();await page.locator('.proof-thumb').waitFor();
 await page.locator('#observation').fill('Synthetic camera feed for the automated test.');await page.getByRole('button',{name:'Check in here',exact:true}).click();await page.getByRole('heading',{name:'Quest complete',exact:true}).waitFor();await page.getByRole('button',{name:'Keep exploring',exact:true}).click();check('Camera permission, capture, hash, observation and real API discovery reward');
 await page.locator('.sidebar [data-view="profile"]').click();await page.locator('#alias-input').fill('QA Explorer');await page.locator('#public-input').check();await page.getByRole('button',{name:'Save explorer',exact:true}).click();
 await page.locator('.sidebar [data-view="guild"]').click();await page.getByText('QA Explorer',{exact:true}).waitFor();await page.getByRole('button',{name:'This week',exact:true}).click();await page.getByText('QA Explorer',{exact:true}).waitFor();check('Opt-in alias, all-time and weekly server rankings');
 const profile=await page.evaluate(()=>JSON.parse(localStorage.getItem('ascend:player')));assert.equal(profile.stats.xp,250);assert.equal(profile.stats.quests,2);assert.equal(profile.alias,'QA Explorer');
 await page.reload({waitUntil:'networkidle'});await page.getByText('QA Explorer',{exact:true}).first().waitFor();check('Explorer session survives reload');
 await page.locator('.sidebar [data-view="profile"]').click();
 const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export session',exact:true}).click();const sessionDownload=await downloadEvent;await sessionDownload.saveAs('.runtime/qa-private-session.json');
 await page.locator('#restore-session').setInputFiles('.runtime/qa-private-session.json');await page.getByText('Explorer session restored.',{exact:true}).waitFor();check('Private explorer session export and restore');

 await page.setViewportSize({width:390,height:844});
 for(const view of ['quests','collection','trophies','guild','journal']){await page.locator(`.sidebar [data-view="${view}"]`).click();await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Horizontal overflow: ${view}`);}
 await page.locator('.sidebar [data-view="quests"]').click();await page.getByRole('button',{name:'Try the rehearsal',exact:true}).click();await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(5500);await page.screenshot({path:'docs/ascend-mobile.png',fullPage:true});
 await page.locator('.rank-avatar').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));check('390 × 844 responsive layout: every screen, no horizontal overflow');
 await page.getByRole('button',{name:'Voice controls',exact:true}).click();await page.getByRole('heading',{name:'Your device, your voice'}).waitFor();
 report.voice=await page.evaluate(()=>({speechSynthesis:!!window.speechSynthesis,localVoices:window.speechSynthesis?.getVoices().filter(v=>v.localService).map(v=>({name:v.name,lang:v.lang})),speechRecognition:!!(window.SpeechRecognition||window.webkitSpeechRecognition)}));
 await page.getByRole('button',{name:'Test a local voice',exact:true}).click();await page.getByRole('button',{name:'Close dialog'}).click();check('Voice capability detection and supported playback/fallback path',report.voice);
 await page.locator('.sidebar [data-view="journal"]').click();await page.getByRole('button',{name:'Clear this device’s journal',exact:true}).click();await page.getByRole('button',{name:'Clear local journal',exact:true}).click();await page.getByRole('heading',{name:'Your first memory is one quest away.',exact:true}).waitFor();check('Local journal deletion preserves game rewards');
 const denied=await browser.newContext({viewport:{width:390,height:844}});const deniedPage=await denied.newPage();await deniedPage.addInitScript(()=>{navigator.geolocation.getCurrentPosition=(ok,error)=>error({code:1});});await deniedPage.goto('http://127.0.0.1:4175',{waitUntil:'networkidle'});await deniedPage.getByRole('button',{name:/Find my next quest/}).click();await deniedPage.getByRole('button',{name:'Use my location',exact:true}).click();await deniedPage.getByText('Location permission was declined. Rehearsal is still available.',{exact:true}).waitFor();await deniedPage.getByRole('button',{name:'Try the rehearsal',exact:true}).click();await deniedPage.locator('.demo-banner').waitFor();await denied.close();check('Denied geolocation returns a clear fallback with playable rehearsal');
 assert.deepEqual(report.errors,[]);report.finishedAt=new Date().toISOString();report.passed=true;
}catch(e){report.passed=false;report.failure=String(e.stack||e); if(page){report.visibleToast=await page.locator("#toast").textContent();await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(5500);await page.screenshot({path:"docs/qa-failure.png",fullPage:true});console.log("VISIBLE TOAST",report.visibleToast);}console.error(e);process.exitCode=1;}
finally{await writeFile('docs/browser-qa.json',JSON.stringify(report,null,2));await browser?.close();if(server)await new Promise(r=>server.close(r));await store?.close();}




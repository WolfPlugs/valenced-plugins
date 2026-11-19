// Adapted from Qwester (https://github.com/Discord-ID/qwester, GPL-3.0) and aamiaa's quest script.
// Runs inside discord.com in a WebView, in its own web session.
export const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Discord/1.0.0 Chrome/120.0.0.0 Electron/28.0.0 Safari/537.36'

// The desktop user agent forces Discord's desktop layout, so fit a desktop-width viewport (pinch to zoom).
// Re-asserted on a timer because Discord's page resets the viewport on some loads.
export const BEFORE_LOAD = `Object.defineProperty(navigator,'platform',{get:function(){return 'Win32'},configurable:true});
(function(){var want='width=1100,user-scalable=yes';function fit(){var root=document.head||document.documentElement;if(!root)return;var m=document.querySelector('meta[name=viewport]');if(!m){m=document.createElement('meta');m.name='viewport';root.appendChild(m)}if(m.content!==want)m.content=want}fit();document.addEventListener('DOMContentLoaded',fit);setInterval(fit,500)})();true;`


export const RUN_SCRIPT = `(function(){
if(window.__questRunning){return}
window.__questRunning=true;window.__questStop=false;
var TASKS=['WATCH_VIDEO','PLAY_ON_DESKTOP','STREAM_ON_DESKTOP','PLAY_ACTIVITY','WATCH_VIDEO_ON_MOBILE'];
function post(type,data){window.ReactNativeWebView.postMessage(JSON.stringify({type:type,data:data}))}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
function describe(e){return e&&e.status?('HTTP '+e.status+(e.body&&e.body.message?' '+e.body.message:'')):(e&&e.message)||String(e)}
function getRequire(){
var original=window.$;delete window.$;
var req=window.webpackChunkdiscord_app.push([[Symbol()],{},function(r){return r}]);
window.webpackChunkdiscord_app.pop();
if(original)window.$=original;
return req}
function find(req,filter){
var mods=Object.values(req.c);
for(var i=0;i<mods.length;i++){var ex=mods[i]&&mods[i].exports;if(!ex)continue;
var keys=['A','Ay','ZP'];
for(var k=0;k<keys.length;k++){if(ex[keys[k]]&&filter(ex[keys[k]]))return ex[keys[k]]}
if(filter(ex))return ex}
return null}
function load(){
var req=getRequire();
if(!req||!req.c||Object.keys(req.c).length<10)throw new Error('Discord is still loading. Wait for the page, then press Run again.');
var quests=find(req,function(m){return m.__proto__&&m.__proto__.getQuest});
var channels=find(req,function(m){return m.__proto__&&m.__proto__.getAllThreadsForParent});
var guilds=find(req,function(m){return m.getSFWDefaultChannel});
var api=find(req,function(m){return (m.Bo&&m.Bo.get)||(m.tn&&m.tn.get)});
if(!quests||!api)throw new Error('This Discord web version is not supported. Update the plugin.');
return {quests:quests,channels:channels,guilds:guilds,api:api.Bo||api.tn||api}}
function taskConfig(q){return q.config.taskConfig||q.config.taskConfigV2}
function active(store){
return Array.from(store.quests.values()).filter(function(q){
var us=q.userStatus;
if(!us||!us.enrolledAt||us.completedAt)return false;
if(new Date(q.config.expiresAt).getTime()<=Date.now())return false;
var t=taskConfig(q).tasks;
return TASKS.some(function(n){return t[n]!=null})})}
function state(q){
var t=taskConfig(q).tasks;
var type=TASKS.find(function(n){return t[n]!=null});
var need=(t[type]&&t[type].target)||0;
var us=q.userStatus;
var cur=(us.progress&&us.progress[type]&&us.progress[type].value)||us.streamProgressSeconds||0;
return {quest:q,type:type,need:need,cur:cur,done:cur>=need,name:q.config.messages.questName}}
function update(s){post('update',{id:s.quest.id,name:s.name,progress:Math.floor(s.cur),target:s.need,completed:s.done})}
async function video(s,api){
var next=Math.min(s.need,s.cur+1+Math.random());
var res=await api.post({url:'/quests/'+s.quest.id+'/video-progress',body:{timestamp:next}});
s.cur=next;update(s);
if(res.body.completed_at!==null||s.cur>=s.need){s.done=true;update(s);
await api.post({url:'/quests/'+s.quest.id+'/video-progress',body:{timestamp:s.need}})}}
async function beat(s,st){
var ch=st.channels&&st.channels.getSortedPrivateChannels()[0];var id=ch&&ch.id;
if(!id&&st.guilds){var g=Object.values(st.guilds.getAllGuilds()).find(function(x){return x&&x.VOCAL&&x.VOCAL.length>0});if(g)id=g.VOCAL[0].channel.id}
var key=id?('call:'+id+':1'):('call:'+s.quest.id+':1');
var res=await st.api.post({url:'/quests/'+s.quest.id+'/heartbeat',body:{stream_key:key,terminal:false}});
var p=res.body&&res.body.progress&&res.body.progress[s.type]&&res.body.progress[s.type].value||0;
s.cur=p;s.done=p>=s.need;update(s);
if(s.done){await st.api.post({url:'/quests/'+s.quest.id+'/heartbeat',body:{stream_key:key,terminal:true}});update(s)}}
(async function(){
var failures=0;
try{
var st=load();
var states=active(st.quests).map(state);
if(!states.length){post('status','No enrolled quests to complete. Accept a quest first.');return}
post('list',states.map(function(s){return {id:s.quest.id,name:s.name,progress:Math.floor(s.cur),target:s.need,completed:s.done}}));
for(var i=0;i<states.length;i++){var s=states[i];
while(!s.done&&!window.__questStop){
try{
if(s.type.indexOf('WATCH_VIDEO')===0){await video(s,st.api);if(!s.done)await sleep(1000+Math.random()*500)}
else{await beat(s,st);if(!s.done)await sleep(20000+Math.random()*2000)}
failures=0}
catch(e){failures++;post('error',s.name+': '+describe(e));
if(failures>=3){post('status','Stopped after 3 failed requests.');return}
await sleep(5000)}}
if(window.__questStop)break}
post('status',window.__questStop?'Stopped.':'All quests finished.')}
catch(e){post('error',describe(e))}
finally{window.__questRunning=false}})();
})();true;`

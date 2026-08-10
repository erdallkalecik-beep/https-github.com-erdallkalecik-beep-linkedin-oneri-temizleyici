const D={enabled:true,intervalMs:5000,maxPerScan:8,totalClosed:0};
const $=id=>document.getElementById(id);
function refresh(){chrome.storage.local.get(D,d=>{
 $("enabled").checked=!!d.enabled;$("interval").value=Math.round((d.intervalMs||5000)/1000);
 $("max").value=d.maxPerScan||8;$("count").textContent=d.totalClosed||0;
 $("status").textContent=d.enabled?"● AKTİF":"○ KAPALI";
});}
$("enabled").onchange=()=>{chrome.storage.local.set({enabled:$("enabled").checked});refresh()};
$("interval").onchange=()=>{let n=Math.min(60,Math.max(3,Number($("interval").value)||5));$("interval").value=n;chrome.storage.local.set({intervalMs:n*1000})};
$("max").onchange=()=>{let n=Math.min(20,Math.max(1,Number($("max").value)||8));$("max").value=n;chrome.storage.local.set({maxPerScan:n})};
$("scan").onclick=async()=>{
 const tabs=await chrome.tabs.query({active:true,currentWindow:true}),tab=tabs[0];
 if(!tab?.id||!tab.url?.includes("linkedin.com")){$("status").textContent="Önce LinkedIn sekmesini aç.";return}
 chrome.tabs.sendMessage(tab.id,{type:"SCAN_NOW"},()=>{refresh();setTimeout(refresh,700)});
};
$("reset").onclick=()=>chrome.storage.local.set({totalClosed:0},refresh);
refresh();
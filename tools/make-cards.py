import re,sys,io
src,out,tag=sys.argv[1],sys.argv[2],sys.argv[3]
h=io.open(src,encoding='utf-8',errors='surrogateescape').read()
sty=re.search(r'<style>(.*?)</style>',h,re.S).group(1)
body=h.split('<body>',1)[1].rsplit('</body>',1)[0]
ov="""
html,body{margin:0;padding:0}
body{background:#3a3a3a;max-width:none;padding:60px 0 40px}
#wrap{display:flex;flex-direction:column;align-items:flex-start;gap:20px;
transform-origin:0 0;width:1080px}
.card{width:1080px;height:1440px;overflow:hidden;position:relative;flex:0 0 auto}
.card>.pg{width:430px!important;height:573.34px!important;min-height:0!important;
margin:0!important;position:absolute;left:0;top:0;display:block!important;
transform:scale(2.5116279);transform-origin:0 0}
.card>.pg>.inner{display:flex;flex-direction:column;transform-origin:0 0}
#bar{position:fixed;top:0;left:0;right:0;z-index:99;background:#1a1a1a;color:#eee;
padding:9px 14px;font:12px/1.5 system-ui;display:flex;gap:10px;align-items:center}
#bar button{background:#b85c72;color:#fff;border:0;padding:6px 13px;border-radius:4px;
font:inherit;cursor:pointer}
#bar span{opacity:.7;font-size:11px}
"""
parts=re.split(r'(?=<div class="pg)',body)
cards=[];n=0
for p in parts:
    if not p.strip().startswith('<div class="pg'): continue
    n+=1; cards.append('<div class="card">%s</div>'%p)
js="""
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
var W=1080,H=1440;
function layout(){document.querySelectorAll('.card>.pg').forEach(function(pg){
 var inner=document.createElement('div');inner.className='inner';
 while(pg.firstChild)inner.appendChild(pg.firstChild);
 pg.appendChild(inner);
 var cs=getComputedStyle(pg);
 var avail=pg.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
 inner.style.width='100%%';inner.style.transform='none';inner.style.height='auto';
 var nat=inner.scrollHeight;
 var k=Math.min(1,avail/nat);
 if(k<0.999){inner.style.width=(100/k)+'%%';inner.style.transform='scale('+k+')';
  inner.style.height=(avail/k)+'px';}
 else{inner.style.height=avail+'px';}
 pg.dataset.k=k.toFixed(3);});}
function fit(){var w=document.documentElement.clientWidth-12;
 var k=Math.min(1,w/W),wr=document.getElementById('wrap');
 wr.style.transform='scale('+k+')';
 wr.style.height=(wr.scrollHeight*k)+'px';
 document.getElementById('zm').textContent='预览 '+Math.round(k*100)+'%%';}
async function ex(){var wr=document.getElementById('wrap'),old=wr.style.transform;
 wr.style.transform='none';
 var cs=document.querySelectorAll('.card'),s=document.getElementById('st');
 for(var i=0;i<cs.length;i++){s.textContent='导出 '+(i+1)+'/'+cs.length;
  var cv=await html2canvas(cs[i],{width:W,height:H,scale:1,backgroundColor:null,useCORS:true});
  var a=document.createElement('a');a.download='%s-'+String(i+1).padStart(2,'0')+'.png';
  a.href=cv.toDataURL('image/png');a.click();await new Promise(r=>setTimeout(r,450));}
 wr.style.transform=old;s.textContent='完成 '+cs.length+' 张';}
window.addEventListener('load',function(){layout();fit();});
window.addEventListener('resize',fit);
</script>"""%tag
bar=('<div id="bar"><button onclick="ex()">导出全部 PNG</button>'
 '<span id="st">%d 张 · 1080×1440</span><span id="zm"></span></div>')%n
o='<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">'
o+='<meta name="viewport" content="width=device-width,initial-scale=1">'
o+='<title>小红书图文卡 · %s</title><link rel="stylesheet" href="/fonts/fonts.css">'%tag
o+='<style>%s\n%s</style></head><body>%s<div id="wrap">%s</div>%s</body></html>'%(sty,ov,bar,''.join(cards),js)
io.open(out,'w',encoding='utf-8',errors='surrogateescape').write(o)
print(out,n,'cards')

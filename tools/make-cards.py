import re,sys,io
src,out,tag=sys.argv[1],sys.argv[2],sys.argv[3]
h=io.open(src,encoding='utf-8',errors='surrogateescape').read()
sty=re.search(r'<style>(.*?)</style>',h,re.S).group(1)
body=h.split('<body>',1)[1].rsplit('</body>',1)[0]
W,H,S=430,573.34,1080/430
ov="""
body{margin:0;padding:24px;background:#3a3a3a;max-width:none;display:flex;flex-wrap:wrap;gap:24px;justify-content:center}
.card{width:1080px;height:1440px;overflow:hidden;position:relative;flex:0 0 auto;background:#000}
.card>.pg{width:%dpx!important;height:%.2fpx!important;min-height:0!important;margin:0!important;
transform:scale(%.6f);transform-origin:0 0;position:absolute;top:0;left:0}
#bar{position:fixed;top:0;left:0;right:0;z-index:99;background:#1a1a1a;color:#eee;padding:10px 16px;
font:13px/1.6 system-ui;display:flex;gap:12px;align-items:center}
#bar button{background:#b85c72;color:#fff;border:0;padding:7px 16px;border-radius:4px;font:inherit;cursor:pointer}
#bar span{opacity:.7}
body{padding-top:70px}
@media print{#bar{display:none}}
"""%(W,H,S)
cards=[]
for i,m in enumerate(re.finditer(r'<div class="pg[^"]*"',h)):
    pass
parts=re.split(r'(?=<div class="pg)',body)
n=0
for p in parts:
    if not p.strip().startswith('<div class="pg'): continue
    n+=1
    cards.append('<div class="card" data-n="%02d">%s</div>'%(n,p))
js="""
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
async function ex(){const cs=document.querySelectorAll('.card');const s=document.getElementById('st');
for(let i=0;i<cs.length;i++){s.textContent='导出 '+(i+1)+'/'+cs.length;
const cv=await html2canvas(cs[i],{width:1080,height:1440,scale:1,backgroundColor:null,useCORS:true});
const a=document.createElement('a');a.download='%s-'+String(i+1).padStart(2,'0')+'.png';
a.href=cv.toDataURL('image/png');a.click();await new Promise(r=>setTimeout(r,450));}
s.textContent='完成 '+cs.length+' 张';}
</script>"""%tag
bar='<div id="bar"><button onclick="ex()">导出全部 PNG</button><span id="st">%d 张 · 1080×1440 · 3:4</span></div>'%n
o='<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>小红书图文卡 · %s</title>'%tag
o+='<link rel="stylesheet" href="/fonts/fonts.css"><style>%s\n%s</style></head><body>%s%s%s</body></html>'%(sty,ov,bar,''.join(cards),js)
io.open(out,'w',encoding='utf-8',errors='surrogateescape').write(o)
print(out,n,'cards')

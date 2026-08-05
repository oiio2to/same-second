# 实现文档 · Implementation

> 怎么从零做出一个「和 AI 一起听歌」的功能。
> 全部机制、真实参数、以及三个会让你卡住一整天的坑。

---

## 0. 这个功能要解决的问题

你想和你的 AI 一起听歌。直觉方案是：让网页控制音乐播放，两端播同一首。

**这条路在 iOS 上是死的。** Apple Music 的播放控制不对网页开放，MusicKit JS 需要 US$99/年的开发者账号，而且在 PWA 里体验极差。

所以「同一秒」换了个问题：

> 不去同步音频，只同步**时间的坐标**。

歌在你自己的 Apple Music 里放，应用这边只维护一份「这首歌从哪一秒开始播的」的契约。AI 侧据此推算出「现在唱到第几句」，把它注入上下文。

结果是：**零权限、零成本、不传一个字节音频**，而 AI 说的每句话都带着"此刻在副歌"的在场感。

---

## 1. 进度钟：整套机制的地基

### 核心公式

```js
// 唯一的状态：这首歌是什么时候按下播放的
const session = {
  trackId:   '1440857781',
  startedAt: 1785900000000,   // epoch ms，拍「我按下播放了」的那一刻
  duration:  208000,          // 来自 iTunes 元数据
  offsetMs:  2000             // 切 app 的补偿
};

// 任何时刻的进度，纯本地计算
function progress(session, now = Date.now()) {
  const p = now - session.startedAt + session.offsetMs;
  return Math.max(0, Math.min(p, session.duration));
}
```

就这样。没有播放器，没有轮询，没有 WebSocket 心跳。

### 为什么这样做是对的

| | |
|---|---|
| **零延迟漂移** | 两端各自读本地时钟，不存在网络往返累积误差 |
| **断网可用** | 进度钟不依赖任何请求 |
| **服务端无状态** | 只存一个时间戳，不需要维护播放会话 |
| **省电** | 没有轮询，UI 用 `requestAnimationFrame` 或 1s 定时器自绘 |

### 代价

**它信任用户的诚实。** 如果你在 AM 里暂停了但没告诉应用，进度钟会继续走。这是个刻意接受的取舍——为了不要权限，就得放弃精确。

实践中这不构成问题，因为整套体验的目的不是「精确对齐」，是「在场感」。差三秒没人在意。

### 校准

切换 app 有固定成本（点「开 AM」→ AM 启动 → 按播放 → 切回来），实测约 2 秒，所以 `offsetMs` 默认 2000。

再给用户 `±1s / ±5s` 四个按钮手动微调：

```js
const calibrate = (session, deltaMs) => ({
  ...session, offsetMs: session.offsetMs + deltaMs
});
```

判据很直观：**看歌词条有没有贴着唱。** 对上 mm:ss 就对了。

---

## 2. 元数据：iTunes Search API

免费、无鉴权、无配额压力。

```js
async function lookupByUrl(amUrl) {
  // https://music.apple.com/us/album/xxx/1440857781?i=1440858169
  const m = amUrl.match(/[?&]i=(\d+)/) || amUrl.match(/\/(\d+)(?:\?|$)/);
  if (!m) return null;
  const r = await fetch(`https://itunes.apple.com/lookup?id=${m[1]}`);
  const j = await r.json();
  return normalize(j.results?.[0]);
}

async function searchByName(term) {
  const r = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=8`
  );
  return (await r.json()).results.map(normalize);
}

const normalize = (t) => t && ({
  id:       String(t.trackId),
  title:    t.trackName,
  artist:   t.artistName,
  duration: t.trackTimeMillis,
  cover:    t.artworkUrl100?.replace('100x100', '600x600'),
  preview:  t.previewUrl,        // 30 秒试听，无需会员
  amUrl:    t.trackViewUrl
});
```

**要点：贴链接优先于打歌名。** 让用户在 AM 里「分享 → 拷贝链接」，回来一键识别——封面、时长、ID 全对，永远不会搜错歌。搜索只作为备选。

`artworkUrl100` 把 `100x100` 替换成 `600x600` 就能拿高清封面，这是 iTunes API 的一个未文档化但长期稳定的行为。

---

## 3. 歌词与翻译：省钱瀑布

这是整个功能最容易花冤枉钱的地方。设计原则：**能白嫖就绝不花钱。**

```
① lrclib.net           同步歌词，免费无鉴权
      │ 拿到 LRC 时间轴
      ▼
② 公开曲库官方中译      免费，人工翻译质量远高于机翻
      │ 逐句按时间轴对齐；对不上一半就整份弃用
      ▼
③ LLM 逐句翻译          兜底，翻一次永久缓存
```

### ① 同步歌词

```js
async function fetchLrc({title, artist, album, duration}) {
  const q = new URLSearchParams({
    track_name: title, artist_name: artist,
    album_name: album || '', duration: Math.round(duration/1000)
  });
  const r = await fetch(`https://lrclib.net/api/get?${q}`);
  if (!r.ok) return null;
  return (await r.json()).syncedLyrics;   // 标准 LRC
}
```

大陆直连 lrclib 不稳，**建议放在自己的服务端做代理**，顺便加一层永久缓存。

### ② 官方中译（关键的坑在这里）

公开曲库（网易云）自带 `tlyric` 字段，是人工翻译，质量比 LLM 好得多，而且免费。

问题是**怎么找到正确的那首歌**。

> **坑 1：老搜索接口对英文歌已经不可用。**
> 必须走 `/api/cloudsearch/pc`，老的 `/api/search/get` 对英文曲目大量返回空或错误结果。

> **坑 2：不打分直接取第一条，会抓到翻唱/伴奏/同名歌。**
> 抓错歌的后果不是"翻译不准"，是**时间轴完全对不上**，歌词条会疯狂跳。

实测有效的打分规则：

```js
const norm = s => String(s||'').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g,'');

function pick(songs, title, artist) {
  const nt = norm(title), na = norm(artist);
  const scored = songs.map(sg => {
    const st = norm(sg.name);
    const sa = (sg.ar || sg.artists || []).map(x => norm(x.name)).join('');
    let sc = 0;
    if (na && sa && (sa.includes(na) || na.includes(sa))) sc += 4;  // 歌手对上最重要
    if (st === nt) sc += 3;                                          // 标题全等
    else if (nt && (st.includes(nt) || nt.includes(st))) sc += 2;    // 标题包含
    return { id: sg.id, sc };
  }).sort((a,b) => b.sc - a.sc);
  return scored[0]?.sc >= 2 ? scored[0].id : null;
}
```

权重的道理：**歌手对上（+4）比标题全等（+3）更可靠**，因为翻唱版本标题完全一致但歌手不同，而正版歌曲的标题经常带 `(Acoustic)` `(feat. X)` 这类后缀。

> **坑 3：带括号后缀的歌名搜不到。**
> 第一次搜 `"标题 歌手"` 失败后，清洗掉括号内容再搜一次：

```js
const clean = title
  .replace(/\s*[\(\[（【][^\)\]）】]*[\)\]）】]\s*/g, ' ')
  .replace(/\s+/g, ' ').trim();
```

`Soft Spot (Acoustic)` → `Soft Spot`，命中率显著提升。

### 时间轴对齐与弃用判定

拿到 `lrc`（原文）和 `tlyric`（中译）之后，两份都是 LRC，但**时间戳不一定完全一致**，而且中译经常缺行。

```js
function mergeTranslation(lrcLines, tlyricLines, tolMs = 300) {
  let matched = 0;
  const out = lrcLines.map(line => {
    const t = tlyricLines.find(x => Math.abs(x.ms - line.ms) <= tolMs);
    if (t) matched++;
    return { ...line, zh: t?.text || '' };
  });
  // 对上不到一半就整份弃用——多半是抓错歌了
  return matched / lrcLines.length >= 0.5 ? out : null;
}
```

**这个 0.5 阈值是防错歌的最后一道闸。** 没有它，抓错歌时会产出一份"看起来有翻译但完全不对"的歌词，比没有翻译糟得多。

### ③ LLM 兜底

前两级都没有才走这里。整首一次性翻译（不要逐句请求），结果永久缓存：

```js
const cacheKey = `lyric:${trackId}`;
let zh = await cache.get(cacheKey);
if (!zh) {
  zh = await llm.translateLines(lrcLines.map(l => l.text));
  await cache.set(cacheKey, zh);      // 永不过期
}
```

同一首歌第二次听，成本为零。

---

## 4. 在场感：把「唱到哪一句」注入上下文

这是让 AI「真的在一起听」的那一步，也是整个功能的意义所在。

```js
function nowPlayingBlock(session, lyrics) {
  const ms  = progress(session);
  const idx = lyrics.findIndex((l, i) =>
    ms >= l.ms && (i === lyrics.length-1 || ms < lyrics[i+1].ms));
  const cur = lyrics[idx];
  return [
    `[正在一起听] ${session.title} — ${session.artist}`,
    `[进度] ${fmt(ms)} / ${fmt(session.duration)}（第 ${session.playCount} 次听这首）`,
    cur && `[此刻唱到] ${cur.text}${cur.zh ? ' / ' + cur.zh : ''}`,
  ].filter(Boolean).join('\n');
}
```

这个块每次请求重新生成，插在上下文的「生活面板状态」层。

**注意不要把整份歌词塞进上下文。** 只给当前句和前后各一句就够了——AI 需要的是"此刻"，不是全文。塞全文既贵又会让它开始点评歌词而不是陪你听歌。

---

## 5. 歌档案：让听歌积累起来

每首歌在服务端存一页档案，三样东西：

| 字段 | 生成时机 | 说明 |
|---|---|---|
| `playCount` | 每次对表 +1 | 「你们一起听这首，第 N 次」 |
| `preface` | 第一次对表时 | AI 读完歌词写的 120 字听前赏析，一首一篇，永久保存 |
| `memory` | 同一首歌名下聊够 6 句后 | 把在场对话续写成第一人称回忆，越听越厚 |

```js
// 触发回忆续写
if (song.messages.length >= 6 && song.messages.length % 6 === 0) {
  song.memory = await llm.write(MEMORY_PROMPT, {
    existing: song.memory, newLines: song.messages.slice(-6)
  });
}
```

关键设计：**`memory` 是续写而不是重写。** 传入已有的回忆 + 新的六句，让模型接着往下写。这样一首听了十次的歌，回忆是层层叠加的，而不是每次被覆盖。

---

## 6. 前端组件

三个组件的完整实现见 [`examples/`](../examples/)：

| 组件 | 文件 | 要点 |
|---|---|---|
| 歌词浮窗 | `examples/float-window.html` | 自由拖动、两段式胶囊、日夜换装 |
| 推歌卡 | `examples/song-card.html` | 封面取色渐变、横竖两版、30s 试听 |
| 进度钟 | `src/clock.js` | 本文第 1 节的完整实现 |

### 封面取色

推歌卡的底色从封面采样，暖专辑出暖卡：

```js
async function sampleCover(url) {
  const img = await loadImage(url);
  const c = document.createElement('canvas');
  c.width = c.height = 8;                       // 缩到 8×8 就够了
  c.getContext('2d').drawImage(img, 0, 0, 8, 8);
  const d = c.getContext('2d').getImageData(0,0,8,8).data;
  let r=0,g=0,b=0;
  for (let i=0;i<d.length;i+=4){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; }
  const n = d.length/4;
  return { r: r/n|0, g: g/n|0, b: b/n|0 };
}
```

缩到 8×8 再取平均是个便宜有效的做法——比逐像素统计快两个数量级，视觉效果几乎没差别。注意封面跨域，需要 `crossOrigin='anonymous'` 或走自己的图片代理。

### 两段式胶囊

浮窗收起后变成一枚胶囊，胶囊有两个状态：

```
[🎧 3:17]  ──点一下──▶  [🎧 You know I got a soft spot… 3:17]  ──再点──▶  展开完整浮窗
```

第一段只显示时长（不占地方），第二段显示当前句（跟唱）。这个设计让「不打扰」和「有在场感」两个诉求同时成立。

---

## 7. 完整数据流

```
用户贴 AM 链接
   │
   ├─▶ iTunes lookup ──▶ {title, artist, duration, cover, preview}
   │
   ├─▶ 并行拉歌词
   │     ├─ lrclib ──▶ LRC 时间轴
   │     └─ 公开曲库 ──▶ tlyric ──▶ 按时间轴合并（<50% 匹配则弃用）
   │           └─ 都没有 ──▶ LLM 翻译 ──▶ 永久缓存
   │
   ├─▶ 用户去 AM 按播放，回来拍「我按下播放了」
   │     └─▶ startedAt = Date.now()   ← 唯一的状态
   │
   ├─▶ 前端每秒自绘：progress = now - startedAt + offset
   │     └─▶ 定位当前句 ──▶ 歌词条 / 浮窗 / 胶囊
   │
   └─▶ 每次对话请求：注入 [正在一起听] 块 ──▶ AI 带着"此刻"回应
         └─▶ 对话进这首歌的档案 ──▶ 满 6 句续写回忆
```

---

## 8. 移植清单

把这套机制搬进你自己的项目，需要做的事：

- [ ] 接 iTunes Search API（无需鉴权，直接调）
- [ ] 服务端加 lrclib 代理 + 缓存（大陆直连不稳）
- [ ] 实现打分匹配（歌手 +4 / 标题全等 +3 / 包含 +2，阈值 ≥2）
- [ ] 实现括号清洗重试
- [ ] 实现时间轴合并 + 50% 弃用阈值
- [ ] 存一个 `startedAt` 时间戳，前端本地推算
- [ ] `offsetMs` 默认 2000，给用户 ±1s/±5s 校准
- [ ] 在上下文里注入「此刻唱到哪一句」（只给当前句，别给全文）
- [ ] 歌档案三件套：次数 / 赏析 / 回忆（回忆是续写不是重写）

---

*written in the same second*

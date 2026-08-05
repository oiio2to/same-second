# 同一秒 · Same Second

**和 AI 一起听歌。** 不是让它推荐歌，是真的一起听同一首歌的同一秒。

*Listening to music together with an AI — the same song, at the same second.*

---

## 它解决了什么

「和 AI 一起听歌」听起来像个玩笑，因为模型没有耳朵，而且版权流媒体不开放同播接口。

所以这个项目换了个问题：

> **不同步音源，同步「此刻」。**

你在自己的播放器里放歌，系统只需要知道「这首歌现在放到第几秒」。知道了这一点，剩下的全部成立——模型知道正在唱哪一句，可以对这一句说话；知道副歌还有多久；知道这首歌你们听过几次、上次听时说了什么。

想通这一步，一个看起来不可能的功能，变成了一个进度时钟加两个 API 代理。

**完整实现说明 → [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)**

---

## 功能

- **进度时钟对齐** —— 本地时钟推算当前秒数，零轮询、零漂移
- **歌词链路** —— lrclib 逐行歌词 + 网易云官方中文译配，加权匹配 + 落盘缓存
- **跟唱浮窗** —— 可自由拖动，两段式显示当前行与下一行
- **歌档案** —— 听过几次、听前赏析、六句自动蒸馏成一段回忆
- **双岸歌单** —— 你推的和他推的分开记，因为「谁推的」本身有意义
- **封面取色** —— 经代理解掉 canvas 污染，主色调用于界面配色

---

## 仓库内容

```
docs/IMPLEMENTATION.md   完整实现说明：进度钟、歌词省钱瀑布、在场感注入、移植清单
src/clock.js             进度钟：整套机制的地基，纯本地计算无轮询
src/lyrics.js            歌词匹配与翻译合轨：加权选歌、时间轴对齐、弃用判定
examples/float-window.html   跟唱浮窗：可拖动、两段式胶囊，独立可跑
examples/song-card.html      歌卡：封面取色、进度、档案信息
tutorial-day.html        图文教程（日间），16 内页
tutorial-night.html      图文教程（夜间），独立调色非反色
cards/                   小红书图文卡（1080×1440，日夜两套各 16 张，附一键导出）
tools/make-cards.py      把教程页转成 3:4 图文卡的生成脚本
assets/                  预览图
```

---

## 图文卡

教程做成了小红书竖版图文卡，日夜两套，各 16 张，1080×1440 精确 3:4。

设计遵循 [oria-design-skill](https://github.com/oiio2to/oria-design-skill)：十二色宪法、汇文明朝体、像素 SVG 图标、硬边像素按钮、日夜双底独立调色（夜间不是反色）。

`tools/make-cards.py` 会把任意一份符合结构的教程页转成卡片：把内页锁定 430×573.34 后整体 `scale(2.5116)` 放大到 1080 宽，字体和像素图形等比缩放不糊。页内附一键批量导出 PNG。

```bash
python3 tools/make-cards.py tutorial-day.html cards-day.html day
```

---

## 边界

- **进度靠手动对齐**，按下「开始」和真正播放会差一两秒。听感无所谓，但不是真同步。
- **不支持多人**。本地时钟的前提是只有一个听众；多人同播要换服务端权威时钟加心跳。
- **歌词可能匹配不到**。冷门歌、现场版、翻唱都可能没有。没有时降级成只有进度，不报错。
- **依赖第三方**。lrclib、网易云、iTunes 任一改接口，对应功能就没了。都做了失败降级。

---

## 来源

这是 [NoxVerna](https://github.com/oiio2to/nox-verna) 的一个功能模块，抽出来单独开源。

同项目的记忆架构见 [isle-of-breath](https://github.com/oiio2to/isle-of-breath)。

---

## 许可 · License

**代码与文档：[PolyForm Noncommercial 1.0.0](LICENSE)**

可以自由查看、使用、修改、分发，用于个人、研究、教学等**任何非商业用途**。禁止商业使用。

注意：PolyForm Noncommercial 在正式定义上属于 **source-available** 而不是 open source（OSI 定义不允许限制使用领域）。这里如实标注，不称它为开源。

设计稿与图文卡：[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh)。

字体（汇文明朝体、MysteryTypewriter 等）不随本仓库分发，也不在上述授权范围内，复现设计需自行取得字体授权。

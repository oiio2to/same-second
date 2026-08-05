/*!
 * same-second · lyrics.js
 * 歌词与翻译的「省钱瀑布」：
 *   ① lrclib 同步歌词（免费）
 *   ② 公开曲库官方中译（免费，人工翻译）
 *   ③ LLM 逐句翻译（兜底，永久缓存）
 * PolyForm Noncommercial 1.0.0
 */
'use strict';
const { parseLrc } = require('./clock');

const norm = (s) => String(s || '').toLowerCase()
  .replace(/[^a-z0-9\u4e00-\u9fff]/g, '');

/** 去掉括号后缀：Soft Spot (Acoustic) → Soft Spot */
const cleanTitle = (t) => String(t || '')
  .replace(/\s*[([（【][^)\]）】]*[)\]）】]\s*/g, ' ')
  .replace(/\s+/g, ' ').trim();

/**
 * 从搜索结果里挑出正确的那首。
 * 歌手对上 +4（最可靠，翻唱标题一致但歌手不同）
 * 标题全等 +3 / 标题包含 +2
 * 阈值 <2 视为没找到——宁可没翻译，也不要错歌。
 */
function pickSong(songs, title, artist) {
  if (!Array.isArray(songs) || !songs.length) return null;
  const nt = norm(title), na = norm(artist);
  const scored = songs.map((sg) => {
    const st = norm(sg.name);
    const sa = (sg.ar || sg.artists || []).map((x) => norm(x.name)).join('');
    let sc = 0;
    if (na && sa && (sa.includes(na) || na.includes(sa))) sc += 4;
    if (st === nt) sc += 3;
    else if (nt && (st.includes(nt) || nt.includes(st))) sc += 2;
    return { id: sg.id, sc };
  }).sort((a, b) => b.sc - a.sc);
  return scored[0].sc >= 2 ? scored[0].id : null;
}

/**
 * 把中译按时间轴合并进原文。
 * 对上不到 50% 就整份弃用——多半是抓错歌，
 * 一份"看起来有翻译但完全不对"的歌词比没有翻译糟得多。
 */
function mergeTranslation(lines, tLines, tolMs = 300) {
  if (!lines.length || !tLines.length) return null;
  let matched = 0;
  const out = lines.map((line) => {
    const t = tLines.find((x) => Math.abs(x.ms - line.ms) <= tolMs);
    if (t) matched++;
    return Object.assign({}, line, { zh: t ? t.text : '' });
  });
  return matched / lines.length >= 0.5 ? out : null;
}

/**
 * 完整链路。
 * @param {object} deps  { fetchLrclib, fetchOfficialZh, translate, cache }
 *   所有依赖都注入——本模块不绑定任何具体服务端实现。
 */
async function resolveLyrics(track, deps) {
  const { fetchLrclib, fetchOfficialZh, translate, cache } = deps;
  const key = 'lyric:' + track.id;

  if (cache) {
    const hit = await cache.get(key);
    if (hit) return hit;
  }

  // ① 同步歌词
  const lrc = await fetchLrclib(track);
  if (!lrc) return null;
  const lines = parseLrc(lrc);
  if (!lines.length) return null;

  // ② 官方中译：原名搜一次，失败清洗括号再搜一次
  let merged = null;
  if (fetchOfficialZh) {
    for (const title of [track.title, cleanTitle(track.title)]) {
      if (!title) continue;
      const tl = await fetchOfficialZh(title, track.artist, pickSong);
      if (tl) {
        merged = mergeTranslation(lines, parseLrc(tl));
        if (merged) break;
      }
      if (cleanTitle(track.title) === track.title) break;   // 无括号就不重试
    }
  }

  // ③ LLM 兜底，翻一次永久缓存
  let result = merged;
  if (!result && translate) {
    const zh = await translate(lines.map((l) => l.text));
    result = lines.map((l, i) => Object.assign({}, l, { zh: zh[i] || '' }));
  }
  result = result || lines.map((l) => Object.assign({}, l, { zh: '' }));

  if (cache) await cache.set(key, result);   // 永不过期
  return result;
}

module.exports = { norm, cleanTitle, pickSong, mergeTranslation, resolveLyrics };

/**
 * Telegram Mini App — 交互式财务图表
 * 使用 ECharts 渲染，适配 Telegram 主题
 */
export function getAppHTML(baseUrl: string): string {
  const loginUrl = `${baseUrl}/api/login`;
  const dataUrl = `${baseUrl}/api/data`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>财务趋势</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js"><\/script>
<script src="https://telegram.org/js/telegram-web-app.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#fff;--card:#f5f5f5;--text:#222;--text2:#666;--border:#e0e0e0;--accent:#2481cc}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);padding:0;overflow-x:hidden}
.tabs{display:flex;position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--border)}
.tab{flex:1;text-align:center;padding:14px 0;font-size:15px;font-weight:500;border:none;background:none;color:var(--text2);cursor:pointer;transition:all .2s;position:relative}
.tab.active{color:var(--accent);font-weight:600}
.tab.active::after{content:'';position:absolute;bottom:0;left:20%;width:60%;height:3px;background:var(--accent);border-radius:3px 3px 0 0}
.panel{display:none;padding:12px}
.panel.active{display:block}
.chart-box{width:100%;height:420px;margin-top:4px}
.chart-box.tall{height:500px}
.month-picker{display:flex;gap:8px;padding:12px 0 4px;overflow-x:auto;-webkit-overflow-scrolling:touch}
.month-picker::-webkit-scrollbar{display:none}
.month-btn{flex-shrink:0;padding:6px 16px;border-radius:16px;border:1px solid var(--border);background:var(--card);font-size:13px;color:var(--text2);cursor:pointer;transition:all .2s;white-space:nowrap}
.month-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.loading{display:flex;align-items:center;justify-content:center;height:300px;color:var(--text2);font-size:15px}
.loading::after{content:'';width:20px;height:20px;margin-left:10px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.error{text-align:center;padding:60px 20px;color:var(--text2)}
.error h3{margin-bottom:8px;color:var(--text)}
.summary-cards{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.card{background:var(--card);border-radius:12px;padding:14px;text-align:center}
.card .label{font-size:12px;color:var(--text2);margin-bottom:4px}
.card .value{font-size:20px;font-weight:700;color:var(--text)}
.card .sub{font-size:11px;color:var(--text2);margin-top:2px}
.total-card{grid-column:1/-1;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff}
.total-card .value{color:#fff;font-size:24px}
.total-card .label{color:rgba(255,255,255,.8)}
@media(prefers-color-scheme:dark){:root{--bg:#1c1c1e;--card:#2c2c2e;--text:#f5f5f5;--text2:#98989e;--border:#38383a;--accent:#64b5f6}}
</style>
</head>
<body>
<div class="tabs">
  <button class="tab active" data-tab="trend">趋势图</button>
  <button class="tab" data-tab="summary">月度汇总</button>
  <button class="tab" data-tab="all">全部汇总</button>
  <button id="refresh-btn" class="tab refresh-tab" style="flex:0 0 auto;padding:14px 14px;font-size:18px" title="刷新数据">↻</button>
</div>
<div id="update-bar" style="text-align:center;font-size:11px;color:var(--text2);padding:4px 0 0;display:none"></div>

<div id="panel-trend" class="panel active">
  <div class="chart-box" id="trend-chart"></div>
</div>

<div id="panel-summary" class="panel">
  <div class="month-picker" id="month-picker"></div>
  <div class="summary-cards" id="summary-cards"></div>
  <div class="chart-box" id="summary-chart"></div>
</div>

<div id="panel-all" class="panel">
  <div class="chart-box tall" id="all-chart"></div>
</div>

<div class="loading" id="loading">加载数据中</div>

<script>
const LOGIN_URL = '${loginUrl}';
const DATA_URL = '${dataUrl}';
const CACHE_KEY = 'fd';
const CACHE_TS = 'ft';
const CACHE_MAX = 24 * 60 * 60 * 1000; // 24h 缓存（通常一月一更新）

let allData = null;
let charts = {};
let authed = false;

const COLORS = ['#5470c6','#91cc75','#fac858','#ee6666','#73c0de','#3ba272','#fc8452','#9a60b4','#ea7ccc','#f3a7c0','#6b8e23','#ff7f50','#20b2aa','#9370db','#cd853f','#48d1cc'];
const TG = window.Telegram?.WebApp;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}

function applyTheme() {
  if (!TG) return;
  const t = TG.themeParams;
  const r = document.documentElement.style;
  if (t.bg_color) r.setProperty('--bg', t.bg_color);
  if (t.text_color) r.setProperty('--text', t.text_color);
  if (t.hint_color) r.setProperty('--text2', t.hint_color);
  if (t.subtitle_text_color) r.setProperty('--text2', t.subtitle_text_color);
  if (t.section_bg_color) r.setProperty('--card', t.section_bg_color);
  if (t.accent_text_color) r.setProperty('--accent', t.accent_text_color);
  if (t.section_separator_color) r.setProperty('--border', t.section_separator_color);
}
applyTheme();
TG?.ready();

// 读取实际 CSS 颜色值（ECharts 渲染在 Canvas 上，不识别 var()）
const COL_BG = cssVar('--bg');
const COL_CARD = cssVar('--card');
const COL_TEXT = cssVar('--text');
const COL_TEXT2 = cssVar('--text2');
const COL_BORDER = cssVar('--border');
const COL_ACCENT = cssVar('--accent');

// 标签切换（排除刷新按钮）
document.querySelectorAll('.tab:not(.refresh-tab)').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    setTimeout(() => resizeCharts(), 100);
  });
});

// 刷新按钮
document.getElementById('refresh-btn').addEventListener('click', () => {
  forceRefresh();
});

function forceRefresh() {
  showToast('刷新中…');
  saveCache(null); // 清缓存
  loadData();
}

// 下拉刷新检测
let touchStartY = 0;
document.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchend', e => {
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (dy > 100) forceRefresh(); // 下拉超过 100px 触发
}, { passive: true });

async function doLogin() {
  const initData = TG?.initData;
  if (!initData) {
    document.getElementById('loading').innerHTML = '<div class="error"><h3>请在 Telegram 中打开</h3><p>此页面仅支持在 Telegram Mini App 中访问</p></div>';
    return false;
  }
  try {
    const resp = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    const data = await resp.json();
    if (!data.ok) {
      document.getElementById('loading').innerHTML = '<div class="error"><h3>未授权访问</h3><p>你没有权限查看此内容</p></div>';
      return false;
    }
    return true;
  } catch(e) {
    document.getElementById('loading').innerHTML = '<div class="error"><h3>验证失败</h3><p>' + e.message + '</p></div>';
    return false;
  }
}

// ===== 本地缓存（秒开 + 增量更新） =====
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const ts = localStorage.getItem(CACHE_TS);
    if (raw && ts) return { data: JSON.parse(raw), age: Date.now() - Number(ts) };
  } catch {}
  return null;
}

function saveCache(data) {
  try {
    if (data === null) {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_TS);
    } else {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TS, String(Date.now()));
    }
  } catch {}
}

function showLastUpdate() {
  const bar = document.getElementById('update-bar');
  try {
    const ts = localStorage.getItem(CACHE_TS);
    if (ts) {
      const d = new Date(Number(ts));
      const s = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
      bar.textContent = '上次更新 ' + s + '  下拉或点击 ↻ 刷新';
      bar.style.display = 'block';
    }
  } catch {}
}

function dataEqual(a, b) {
  if (a.allMonths.length !== b.allMonths.length) return false;
  for (let i = 0; i < a.channels.length; i++) {
    if (a.channels[i].name !== b.channels[i]?.name) return false;
    for (let j = 0; j < a.channels[i].data.length; j++) {
      if (a.channels[i].data[j] !== b.channels[i]?.data[j]) return false;
    }
  }
  return true;
}

async function loadData() {
  authed = await doLogin();
  if (!authed) return;

  // 1) 有缓存 → 秒开
  const cached = loadCache();
  if (cached) {
    allData = cached.data;
    document.getElementById('loading').style.display = 'none';
    initAll();
    showLastUpdate();
    if (cached.age < CACHE_MAX) return; // 24h 内不刷
  }

  // 2) 后台静默拉新
  try {
    const resp = await fetch(DATA_URL + '?initData=' + encodeURIComponent(TG.initData));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const fresh = await resp.json();
    saveCache(fresh);

    if (!allData) {
      // 没缓存 → 首次展示
      allData = fresh;
      document.getElementById('loading').style.display = 'none';
      initAll();
    } else if (!dataEqual(allData, fresh)) {
      // 数据有变化 → 局部刷新
      allData = fresh;
      disposeCharts();
      initAll();
      showToast('数据已更新');
    }
    showLastUpdate();
  } catch(e) {
    if (!allData) {
      document.getElementById('loading').innerHTML = '<div class="error"><h3>加载失败</h3><p>' + e.message + '</p></div>';
    }
  }
}

function disposeCharts() {
  Object.values(charts).forEach(c => { try { c.dispose(); } catch {} });
  charts = {};
}

function showToast(msg) {
  const el = document.getElementById('toast') || (() => {
    const d = document.createElement('div');
    d.id = 'toast';
    d.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:8px 20px;border-radius:20px;font-size:13px;z-index:999;transition:opacity .3s';
    document.body.appendChild(d);
    return d;
  })();
  el.textContent = msg;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

function fmt(v) {
  if (v >= 10000) return '¥' + (v / 10000).toFixed(1) + '万';
  return '¥' + v.toLocaleString();
}

function initAll() {
  renderTrend();
  renderSummary();
  renderAllSummary();
  resizeCharts();
}

function chartTheme() {
  return {
    backgroundColor: 'transparent',
    textStyle: { color: COL_TEXT },
  };
}

function tooltipTheme() {
  return {
    backgroundColor: COL_CARD,
    borderColor: COL_BORDER,
    textStyle: { color: COL_TEXT, fontSize: 13 },
    extraCssText: 'border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.15)',
  };
}

// ===== 趋势图 =====
function renderTrend() {
  const months = allData.allMonths.map(m => parseInt(m.slice(5)) + '月');
  const chart = echarts.init(document.getElementById('trend-chart'), null, { renderer: 'canvas' });
  charts.trend = chart;

  const series = allData.channels.filter(c => c.data.some(v => v > 0)).map((c, i) => ({
    name: c.name,
    type: 'line',
    smooth: true,
    symbol: 'circle',
    symbolSize: 5,
    lineStyle: { width: 2 },
    emphasis: { focus: 'series' },
    data: c.data,
  }));

  chart.setOption({
    ...chartTheme(),
    tooltip: { trigger: 'axis', valueFormatter: v => fmt(v), ...tooltipTheme() },
    legend: {
      type: 'scroll', bottom: 0,
      textStyle: { fontSize: 11, color: COL_TEXT2 },
    },
    grid: { left: 60, right: 16, bottom: 120, top: 16 },
    xAxis: {
      type: 'category', data: months,
      axisLine: { lineStyle: { color: COL_BORDER } },
      axisLabel: { color: COL_TEXT2, fontSize: 11 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value', min: 0,
      axisLabel: {
        color: COL_TEXT2, fontSize: 10,
        formatter: v => v >= 10000 ? (v/10000).toFixed(0) + '万' : v,
      },
      splitLine: { lineStyle: { color: COL_BORDER, type: 'dashed' } },
    },
    series: series.map((s, i) => ({
      ...s,
      itemStyle: { color: COLORS[i % COLORS.length] },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: COLORS[i % COLORS.length] + '44' },
          { offset: 1, color: COLORS[i % COLORS.length] + '03' },
        ]),
      },
    })),
    animationDuration: 800,
    animationEasing: 'cubicOut',
  });
}

// ===== 月度汇总 =====
function renderSummary() {
  const months = allData.allMonths;
  const picker = document.getElementById('month-picker');
  picker.innerHTML = ''; // 清除旧按钮（增量更新时）
  let activeIdx = months.length - 1;

  months.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.className = 'month-btn' + (i === activeIdx ? ' active' : '');
    btn.textContent = parseInt(m.slice(5)) + '月';
    btn.addEventListener('click', () => {
      document.querySelectorAll('.month-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeIdx = i;
      updateSummaryChart(i);
    });
    picker.appendChild(btn);
  });

  updateSummaryChart(activeIdx);
}

function updateSummaryChart(idx) {
  const month = allData.allMonths[idx];
  const items = allData.channels
    .map((c, i) => ({ name: c.name, value: c.data[idx] || 0, idx: i }))
    .filter(x => x.value > 0)
    .sort((a, b) => b.value - a.value);

  // 汇总卡片
  const total = items.reduce((s, x) => s + x.value, 0);
  const top = items[0];
  const cardsHtml = '<div class="card total-card"><div class="label">' + parseInt(month.slice(5)) + '月总资产</div><div class="value">' + fmt(total) + '</div><div class="sub">共 ' + items.length + ' 个渠道</div></div>'
    + '<div class="card"><div class="label">最多</div><div class="value" style="font-size:16px">' + (top ? top.name.split('/')[1]||top.name : '-') + '</div><div class="sub">' + (top ? fmt(top.value) : '') + '</div></div>'
    + '<div class="card"><div class="label">渠道数</div><div class="value">' + items.length + '</div><div class="sub">活跃渠道</div></div>';
  document.getElementById('summary-cards').innerHTML = cardsHtml;

  // 柱状图
  const chart = echarts.init(document.getElementById('summary-chart'));
  chart.setOption({
    ...chartTheme(),
    tooltip: { trigger: 'axis', valueFormatter: v => fmt(v), ...tooltipTheme() },
    grid: { left: 70, right: 20, top: 10, bottom: 30 },
    xAxis: {
      type: 'category', data: items.map(x => x.name),
      axisLabel: { color: COL_TEXT2, fontSize: 10, interval: 0, rotate: items.length > 6 ? 35 : 0 },
      axisLine: { lineStyle: { color: COL_BORDER } },
    },
    yAxis: {
      type: 'value', min: 0,
      axisLabel: {
        color: COL_TEXT2, fontSize: 10,
        formatter: v => v >= 10000 ? (v/10000).toFixed(0) + '万' : v,
      },
      splitLine: { lineStyle: { color: COL_BORDER, type: 'dashed' } },
    },
    series: [{
      type: 'bar',
      data: items.map((x, i) => ({
        value: x.value,
        itemStyle: { color: COLORS[x.idx % COLORS.length], borderRadius: [4, 4, 0, 0] },
      })),
      barMaxWidth: 36,
      animationDuration: 500,
      animationEasing: 'cubicOut',
    }],
  });
}

// ===== 全部汇总（堆叠柱状图） =====
function renderAllSummary() {
  const months = allData.allMonths.map(m => parseInt(m.slice(5)) + '月');
  const chart = echarts.init(document.getElementById('all-chart'));
  charts.all = chart;

  chart.setOption({
    ...chartTheme(),
    tooltip: { trigger: 'axis', valueFormatter: v => fmt(v), ...tooltipTheme() },
    legend: {
      type: 'scroll', bottom: 0,
      textStyle: { fontSize: 11, color: COL_TEXT2 },
    },
    grid: { left: 60, right: 16, bottom: 120, top: 16 },
    xAxis: {
      type: 'category', data: months,
      axisLine: { lineStyle: { color: COL_BORDER } },
      axisLabel: { color: COL_TEXT2, fontSize: 11 },
    },
    yAxis: {
      type: 'value', min: 0,
      axisLabel: {
        color: COL_TEXT2, fontSize: 10,
        formatter: v => v >= 10000 ? (v/10000).toFixed(0) + '万' : v,
      },
      splitLine: { lineStyle: { color: COL_BORDER, type: 'dashed' } },
    },
    series: allData.channels.filter(c => c.data.some(v => v > 0)).map((c, i) => ({
      name: c.name, type: 'bar', stack: 'total',
      data: c.data,
      itemStyle: { color: COLORS[i % COLORS.length], borderRadius: 0 },
      emphasis: { focus: 'series' },
    })),
    animationDuration: 600,
    animationEasing: 'cubicOut',
  });
}

function resizeCharts() {
  Object.values(charts).forEach(c => c?.resize());
}

window.addEventListener('resize', resizeCharts);
window.addEventListener('orientationchange', () => setTimeout(resizeCharts, 300));

loadData();
<\/script>
</body>
</html>`;
}

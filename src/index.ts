import { Env, TgUpdate } from './types';
import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  sendPhoto,
  setWebhook,
  setMyCommands,
  resetMenuButton,
  deleteMessage,
} from './telegram';
import {
  getChannels,
  addChannel,
  addRecord,
  getSession,
  setSession,
  clearSession,
  getAllSummaries,
  getAllMonths,
} from './storage';
import { generateChartImage, generateTextChart } from './charts';
import { getAppHTML } from './app-page';

// ========== 常量 ==========

const CB_PREFIX = 'rc:';
const CB_NEW = 'rc:__new__';
const CB_CANCEL = 'cancel';

const HELP_TEXT = [
  '🤖 财务记录 Bot 使用说明',
  '',
  '💳 /record — 记录一笔余额',
  '   选择渠道 → 输入金额即可',
  '   支持格式: 100（本月）或 100 4月',
  '',
  '📊 /chart — 月度资产汇总报告',
  '   消息底部可打开交互图表',
  '',
  '📋 /channels — 查看所有渠道',
  '🆘 /help — 显示本帮助',
  '',
  '⚡ 首次使用请先 /record 添加一笔记录',
].join('\n');

// ========== 主入口 ==========

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Telegram Webhook
    if (url.pathname === '/webhook' && request.method === 'POST') {
      const update: TgUpdate = await request.json();
      await handleUpdate(update, env);
      return new Response('OK', { status: 200 });
    }

    // 一键配置 Webhook + 命令菜单
    if (url.pathname === '/setup' && request.method === 'POST') {
      const workerUrl = url.origin;
      const [whResp, cmdResp] = await Promise.all([
        setWebhook(env.TELEGRAM_BOT_TOKEN, `${workerUrl}/webhook`),
        setMyCommands(env.TELEGRAM_BOT_TOKEN),
      ]);
      return new Response(JSON.stringify({
        webhook: await whResp.json(),
        commands: await cmdResp.json(),
      }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 仅注册命令菜单 + 重置左下角按钮为命令列表
    if (url.pathname === '/setup-commands' && request.method === 'POST') {
      const [cmdResp, menuResp] = await Promise.all([
        setMyCommands(env.TELEGRAM_BOT_TOKEN),
        resetMenuButton(env.TELEGRAM_BOT_TOKEN),
      ]);
      return new Response(JSON.stringify({
        commands: await cmdResp.json(),
        menu_button: await menuResp.json(),
      }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 快速查看 Webhook 状态 + 关键配置检查
    if (url.pathname === '/webhook-info') {
      const [whResp, cmdResp] = await Promise.all([
        fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`),
        fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMyCommands`),
      ]);
      const whInfo = await whResp.json();
      const cmdInfo = await cmdResp.json();
      return new Response(
        JSON.stringify({
          webhook: whInfo,
          commands: cmdInfo,
          config: {
            allowed_chat_ids_configured: !!env.ALLOWED_CHAT_IDS,
            allowed_chat_ids: env.ALLOWED_CHAT_IDS || '(未设置 — 所有人将被拒绝)',
          },
        }, null, 2),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Telegram Mini App 交互图表
    if (url.pathname === '/app') {
      const html = getAppHTML(url.origin);
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Mini App 登录验证
    if (url.pathname === '/api/login' && request.method === 'POST') {
      return handleLogin(request, env);
    }

    // 图表数据 API（Mini App 使用，需验证 initData）
    if (url.pathname === '/api/data') {
      const authResult = await verifyRequest(request, env);
      if (!authResult) return jsonResponse({ error: '未授权' }, 401);
      return handleApiData(env);
    }

    // CSV 数据导入（POST multipart file）
    if (url.pathname === '/import' && request.method === 'POST') {
      return handleImport(request, env);
    }

    return new Response('Finance Bot 运行中。\nGET /webhook-info — 查看配置状态\nPOST /setup — 配置 Webhook + 命令菜单\nPOST /setup-commands — 仅注册命令菜单\nPOST /import — 导入 CSV 数据', { status: 200 });
  },
};

// ========== 权限验证 ==========

/** 检查 chatId 是否在白名单中 */
function isChatAllowed(chatId: number, allowedStr: string): boolean {
  if (!allowedStr) return false;
  return allowedStr.split(',').map(s => parseInt(s.trim())).includes(chatId);
}

// ========== 更新路由 ==========

async function handleUpdate(update: TgUpdate, env: Env): Promise<void> {
  // 提取 chatId 用于权限判断
  let chatId: number | null = null;
  if (update.message?.chat?.id) chatId = update.message.chat.id;
  if (update.callback_query?.message?.chat?.id) chatId = update.callback_query.message.chat.id;

  // 未授权用户直接忽略
  if (chatId !== null && !isChatAllowed(chatId, env.ALLOWED_CHAT_IDS)) {
    return;
  }

  // 处理 CallbackQuery
  if (update.callback_query) {
    return handleCallbackQuery(update.callback_query, env);
  }

  const msg = update.message;
  if (!msg?.text) return;

  const text = msg.text.trim();

  // 命令路由
  if (text.startsWith('/')) {
    const cmd = text.split(/\s+/)[0].toLowerCase();

    // /record 时如果已有活跃会话则先清除
    if (cmd === '/record') {
      const session = await getSession(env.NUMBERS, msg.chat.id);
      if (session && session.step !== 'idle') {
        await clearSession(env.NUMBERS, msg.chat.id);
      }
      return handleRecord(msg.chat.id, env);
    }

    switch (cmd) {
      case '/start':
      case '/help':
        return handleHelp(msg.chat.id, env);
      case '/chart':
        return handleChart(msg.chat.id, env);
      case '/channels':
        return handleChannels(msg.chat.id, env);
    }
    return;
  }

  // 非命令文本 → 检查会话状态
  return handleTextMessage(msg.chat.id, msg.message_id, text, env);
}

// ========== 命令处理 ==========

async function handleHelp(chatId: number, env: Env): Promise<void> {
  await sendMessage(env, chatId, HELP_TEXT);
}

/** /record — 显示渠道选择菜单 */
async function handleRecord(chatId: number, env: Env): Promise<void> {
  const channels = await getChannels(env.NUMBERS);

  // 每行一个按钮，最多两列
  const keyboard = channels.map(ch => ([
    { text: ch.name, callback_data: `${CB_PREFIX}${ch.name}` },
  ]));

  // 添加"手动输入"和"取消"按钮
  keyboard.push([
    { text: '✏️ 输入新渠道', callback_data: CB_NEW },
  ]);
  keyboard.push([
    { text: '❌ 取消', callback_data: CB_CANCEL },
  ]);

  await sendMessage(env, chatId, '请选择需要记录的渠道：', {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
}

/** 发送状态消息并返回 message_id */
async function sendStatus(env: Env, chatId: number, text: string): Promise<number | null> {
  try {
    const resp = await sendMessage(env, chatId, text);
    const data = await resp.json<any>();
    return data?.result?.message_id ?? null;
  } catch { return null; }
}

/** 删除状态消息的快捷方式 */
async function dismissStatus(env: Env, chatId: number, msgId: number | null): Promise<void> {
  if (msgId) await deleteMessage(env, chatId, msgId);
}

/** /chart — 文本版月度资产汇总报告 */
async function handleChart(chatId: number, env: Env): Promise<void> {
  const statusMsgId = await sendStatus(env, chatId, '⏳ 正在生成报告...');
  const summaries = await getAllSummaries(env.NUMBERS);

  if (summaries.length === 0) {
    await dismissStatus(env, chatId, statusMsgId);
    await sendMessage(env, chatId, '📭 暂无数据，请先用 /record 添加记录。');
    return;
  }

  // 找到最新月份
  const allMonths = new Set<string>();
  for (const s of summaries) {
    for (const mt of s.monthlyTotals) allMonths.add(mt.month);
  }
  const sortedMonths = Array.from(allMonths).sort();
  const latestMonth = sortedMonths[sortedMonths.length - 1];
  const prevMonth = sortedMonths.length > 1 ? sortedMonths[sortedMonths.length - 2] : null;

  // 收集当月各渠道数据
  const items = summaries
    .map(s => {
      const found = s.monthlyTotals.find(mt => mt.month === latestMonth);
      return found ? { name: s.channel, amount: found.total } : null;
    })
    .filter((x): x is { name: string; amount: number } => x !== null)
    .sort((a, b) => b.amount - a.amount);

  if (items.length === 0) {
    await dismissStatus(env, chatId, statusMsgId);
    await sendMessage(env, chatId, '📭 最新月份暂无数据。');
    return;
  }

  const total = items.reduce((s, x) => s + x.amount, 0);

  // 环比变化
  let changeStr = '';
  if (prevMonth) {
    const prevTotal = summaries
      .map(s => {
        const found = s.monthlyTotals.find(mt => mt.month === prevMonth);
        return found ? found.total : 0;
      })
      .reduce((a, b) => a + b, 0);
    if (prevTotal > 0) {
      const pct = ((total - prevTotal) / prevTotal * 100);
      const arrow = pct >= 0 ? '📈' : '📉';
      changeStr = `${arrow} 较 ${formatMonthLabel(prevMonth)} ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    }
  }

  // 构建报告（HTML 格式，比 MarkdownV2 更稳定）
  const monthLabel = formatMonthLabel(latestMonth);
  const lines: string[] = [];
  lines.push(`📊 <b>${monthLabel} 资产总汇</b>`);
  lines.push('');
  lines.push(`💳 合计：<b>¥${fmt(total)}</b>`);
  lines.push(`📂 ${items.length} 个渠道`);
  if (changeStr) lines.push(changeStr);
  lines.push('');

  // 排名列表
  items.forEach((item, i) => {
    const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    lines.push(`${rank} ${item.name}　¥${fmt(item.amount)}`);
  });

  // 迷你趋势条
  const maxAmount = items[0].amount;
  lines.push('');
  lines.push('<b>各渠道占比：</b>');
  items.slice(0, 8).forEach(item => {
    const pct = (item.amount / total * 100).toFixed(1);
    const barLen = Math.round((item.amount / maxAmount) * 8);
    const bar = '█'.repeat(Math.max(barLen, 1));
    lines.push(`${bar} ${pct}% ${item.name}`);
  });

  await dismissStatus(env, chatId, statusMsgId);
  await sendMessage(env, chatId, lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: '📊 打开交互图表', web_app: { url: 'https://finance-telegram-bot.tibet.workers.dev/app' } },
      ]],
    },
  });
}

/** /channels — 列出所有渠道 */
async function handleChannels(chatId: number, env: Env): Promise<void> {
  const channels = await getChannels(env.NUMBERS);
  if (channels.length === 0) {
    await sendMessage(env, chatId, '📭 暂无渠道，请用 /record 添加记录。');
    return;
  }
  const lines = channels.map(ch => {
    const recordCount = ch.months.length;
    return `• ${ch.name}（${recordCount} 个月有记录）`;
  });
  await sendMessage(env, chatId, `📋 已有渠道（${channels.length} 个）：\n${lines.join('\n')}`);
}

// ========== CallbackQuery 处理 ==========

async function handleCallbackQuery(cb: NonNullable<TgUpdate['callback_query']>, env: Env): Promise<void> {
  if (!cb) return;
  const data = cb.data!;
  const chatId = cb.message.chat.id;
  const msgId = cb.message.message_id;

  // 先回复 callback（TG 要求尽快响应）
  await answerCallbackQuery(env, cb.id);

  if (data === CB_CANCEL) {
    await clearSession(env.NUMBERS, chatId);
    await editMessageText(env, chatId, msgId, '❌ 已取消操作。');
    return;
  }

  if (data === CB_NEW) {
    // 用户要输入新渠道
    await setSession(env.NUMBERS, chatId, { step: 'awaiting_channel_name' });
    await editMessageText(env, chatId, msgId, '✏️ 请输入新的渠道名称：');
    return;
  }

  if (data.startsWith(CB_PREFIX)) {
    const channel = data.slice(CB_PREFIX.length);
    await setSession(env.NUMBERS, chatId, { step: 'awaiting_amount', channel });
    await editMessageText(
      env,
      chatId,
      msgId,
      `已选择渠道：${channel}\n\n请输入金额（元），例如：\n• \`100\` → 记录到本月（${formatMonth()})\n• \`100 4月\` → 记录到指定月份`,
      { parse_mode: 'Markdown' },
    );
    return;
  }

  if (data === 'record_switch') {
    // 换渠道 → 回到渠道选择
    await editMessageText(env, chatId, msgId, '请选择需要记录的渠道：');
    return handleRecord(chatId, env);
  }
}

// ========== 文本消息处理（会话相关） ==========

async function handleTextMessage(chatId: number, msgId: number, text: string, env: Env): Promise<void> {
  const session = await getSession(env.NUMBERS, chatId);
  if (!session || session.step === 'idle') {
    // 不在会话中，忽略非命令消息
    return;
  }

  if (session.step === 'awaiting_channel_name') {
    // 用户输入了新渠道名称
    const name = text.trim();
    if (!name) {
      await sendMessage(env, chatId, '⚠️ 渠道名称不能为空，请重新输入：');
      return;
    }
    const isNew = await addChannel(env.NUMBERS, name);
    if (!isNew) {
      await sendMessage(env, chatId, `ℹ️ 渠道 "${name}" 已存在，直接输入金额：`);
    } else {
      await sendMessage(env, chatId, `✅ 已创建新渠道 "${name}"，请输入金额（元）：`);
    }
    await setSession(env.NUMBERS, chatId, { step: 'awaiting_amount', channel: name });
    return;
  }

  if (session.step === 'awaiting_amount') {
    const channel = session.channel!;
    const parsed = parseAmountInput(text);

    if (!parsed) {
      await sendMessage(
        env,
        chatId,
        '⚠️ 格式错误。请直接输入数字（如 `100`），或 `金额 月份`（如 `100 4月`）',
      );
      return;
    }

    // 先发送处理中提示，后续删除
    const statusMsgId = await sendStatus(env, chatId, '⏳ 正在保存...');

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);

    await addRecord(env.NUMBERS, channel, parsed.amount, parsed.month, dateStr);
    await clearSession(env.NUMBERS, chatId);

    const monthLabel = `${parseInt(parsed.month.slice(5))}月`;
    await dismissStatus(env, chatId, statusMsgId);
    await sendMessage(
      env,
      chatId,
      `✅ 已记录！\n渠道：${channel}\n金额：¥${parsed.amount.toFixed(2)}\n月份：${monthLabel}（${parsed.month}）`,
    );

    // 提供快捷操作
    await sendMessage(env, chatId, '要继续记录吗？', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '➕ 继续记录', callback_data: `${CB_PREFIX}${channel}` },
            { text: '🆕 换渠道', callback_data: 'record_switch' },
          ],
        ],
      },
    });
    return;
  }
}

// ========== 工具函数 ==========

/** 将 "100" 或 "100 4月" 或 "100 2026-04" 解析为金额和月份 */
function parseAmountInput(input: string): { amount: number; month: string } | null {
  const trimmed = input.trim();

  // 先尝试匹配纯数字（只有金额，使用当前月份）
  // 必须放在「金额 月份」格式之前，否则对于 "90000" 这样的纯数字，
  // 前一个正则可能通过回溯匹配成 amount=9000 month=0，然后月份校验失败返回 null
  const patternPure = trimmed.match(/^(\d+(?:\.\d{1,2})?)$/);
  if (patternPure) {
    const amount = parseFloat(patternPure[1]);
    if (amount <= 0) return null;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return { amount, month };
  }

  // 尝试匹配: "金额 月份" 或 "金额 年月份"
  const patternWithMonth = trimmed.match(
    /^(\d+(?:\.\d{1,2})?)\s*(?:(\d{4})\s*年?)?\s*(\d{1,2})\s*月?$/,
  );
  if (patternWithMonth) {
    const amount = parseFloat(patternWithMonth[1]);
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const specifiedMonth = parseInt(patternWithMonth[3]);

    let year: string;
    if (patternWithMonth[2]) {
      // 用户指定了年份，直接使用
      year = patternWithMonth[2];
    } else if (specifiedMonth > curMonth) {
      // 没写年份，但月份大于当前月 → 上一年的月份
      year = String(curYear - 1);
    } else {
      // 没写年份，月份 <= 当前月 → 今年
      year = String(curYear);
    }

    const month = patternWithMonth[3].padStart(2, '0');
    if (amount <= 0 || specifiedMonth < 1 || specifiedMonth > 12) return null;
    return { amount, month: `${year}-${month}` };
  }

  return null;
}

/** 格式化 "2026-06" → "2026年6月" */
function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${parseInt(m)}月`;
}

/** 获取当前月份的字符串表示 "2026年6月" */
function formatMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月`;
}

/** 格式化金额: 1000500 → "1,000,500" */
function fmt(n: number): string {
  return Math.round(n).toLocaleString('zh-CN');
}

/** 分割长消息 */
function splitLongMessage(text: string, maxLen = 4000): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    parts.push(text.slice(i, i + maxLen));
  }
  return parts;
}

// ========== Mini App 权限验证 ==========

/**
 * 验证 Telegram Mini App 的 initData
 * 算法: HMAC-SHA256( HMAC-SHA256("WebAppData", botToken), data_check_string )
 */
async function verifyTelegramInitData(
  initData: string,
  botToken: string,
): Promise<{ user_id: number } | null> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const sorted = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    // HMAC-SHA256("WebAppData", botToken) → secret
    const secKey = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const secret = await crypto.subtle.sign('HMAC', secKey, new TextEncoder().encode(botToken));

    // HMAC-SHA256(secret, sorted) → expectedHash
    const sigKey = await crypto.subtle.importKey(
      'raw', secret,
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', sigKey, new TextEncoder().encode(sorted));
    const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (expected !== hash) return null;

    const userStr = params.get('user');
    if (!userStr) return null;
    return { user_id: JSON.parse(userStr).id };
  } catch {
    return null;
  }
}

/** POST /api/login — Mini App 登录验证 */
async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { initData?: string };
  if (!body.initData) return jsonResponse({ ok: false, error: '缺少 initData' });
  const user = await verifyTelegramInitData(body.initData, env.TELEGRAM_BOT_TOKEN);
  if (!user) return jsonResponse({ ok: false, error: '验证失败' });
  if (!isChatAllowed(user.user_id, env.ALLOWED_CHAT_IDS)) {
    return jsonResponse({ ok: false, error: '未授权', user_id: user.user_id });
  }
  return jsonResponse({ ok: true, user_id: user.user_id });
}

/** 从请求中提取并验证 initData */
async function verifyRequest(request: Request, env: Env): Promise<boolean> {
  const url = new URL(request.url);
  const initData = request.method === 'POST'
    ? (await request.json() as { initData?: string }).initData
    : url.searchParams.get('initData');
  if (!initData) return false;
  const user = await verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
  if (!user) return false;
  return isChatAllowed(user.user_id, env.ALLOWED_CHAT_IDS);
}

// ========== Mini App 数据 API ==========

/** GET /api/data — 返回 Mini App 所需的 JSON 数据 */
async function handleApiData(env: Env): Promise<Response> {
  const [summaries, allMonths] = await Promise.all([
    getAllSummaries(env.NUMBERS),
    getAllMonths(env.NUMBERS),
  ]);

  const channels = summaries.map(s => ({
    name: s.channel,
    data: allMonths.map(m => {
      const found = s.monthlyTotals.find(mt => mt.month === m);
      return found ? found.total : 0;
    }),
  }));

  const payload = { channels, allMonths };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// ========== CSV 导入 ==========

interface ImportRow {
  channel: string;
  month: string;
  date: string;
  amount: number;
}

/** POST /import — 上传 CSV 文件批量导入历史数据 */
async function handleImport(request: Request, env: Env): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return jsonResponse({ error: '请上传 CSV 文件（字段名: file）' }, 400);
    }

    const text = await (file as File).text();
    const lines = text.split('\n').filter((l: string) => l.trim());

    if (lines.length < 2) {
      return jsonResponse({ error: 'CSV 至少需要标题行 + 一行数据' }, 400);
    }

    // 解析标题行（日期）
    const headers = parseCSVRow(lines[0]);
    const dates = headers.slice(1); // 第一列是空（渠道名位置）

    // 逐行解析数据
    const toImport: ImportRow[] = [];
    const channelsCreated: string[] = [];
    let parseErrors = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVRow(lines[i]);
      const channel = cols[0]?.trim();
      if (!channel) continue;

      // 注册渠道
      const isNew = await addChannel(env.NUMBERS, channel);
      if (isNew) channelsCreated.push(channel);

      for (let j = 1; j < cols.length; j++) {
        const rawVal = cols[j]?.trim();
        if (!rawVal) continue;

        const amount = parseMoney(rawVal);
        if (amount === null || amount <= 0) { parseErrors++; continue; }

        const dateStr = dates[j - 1]?.trim();
        if (!dateStr) continue;

        const parsed = parseDate(dateStr);
        if (!parsed) { parseErrors++; continue; }

        toImport.push({
          channel,
          amount,
          month: parsed.month,
          date: parsed.date,
        });
      }
    }

    // 批量写入 KV
    let imported = 0;
    for (const row of toImport) {
      try {
        await addRecord(env.NUMBERS, row.channel, row.amount, row.month, row.date);
        imported++;
      } catch {
        parseErrors++;
      }
    }

    return jsonResponse({
      success: true,
      imported,
      channels_created: channelsCreated.length,
      channels_list: channelsCreated,
      errors: parseErrors,
    });
  } catch (err) {
    return jsonResponse({ error: '导入失败: ' + (err as Error).message }, 500);
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 解析 CSV 一行（正确处理引号包裹的字段） */
function parseCSVRow(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { fields.push(field.trim()); field = ''; continue; }
    field += ch;
  }
  fields.push(field.trim());
  return fields;
}

/** 解析金额字符串: 去掉 ¥￥ 和逗号 */
function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[¥￥,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/** 将 "2025-8-4" 解析为 { date, month } */
function parseDate(dateStr: string): { date: string; month: string } | null {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  const year = y.padStart(4, '0');
  const month = m.padStart(2, '0');
  const day = d.padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    month: `${year}-${month}`,
  };
}

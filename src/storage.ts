import { FinanceRecord, BotSession, ChannelInfo } from './types';

/** ========== 渠道管理 ========== */

const CHANNELS_KEY = 'channels';

export async function getChannels(kv: KVNamespace): Promise<ChannelInfo[]> {
  const raw = await kv.get(CHANNELS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveChannels(kv: KVNamespace, channels: ChannelInfo[]): Promise<void> {
  await kv.put(CHANNELS_KEY, JSON.stringify(channels));
}

/** 添加渠道（如已存在则忽略），返回是否新增 */
export async function addChannel(kv: KVNamespace, name: string): Promise<boolean> {
  const channels = await getChannels(kv);
  if (channels.some(c => c.name === name)) return false;
  channels.push({ name, months: [] });
  await saveChannels(kv, channels);
  return true;
}

/** 为指定渠道添加月份索引 */
async function addMonthToChannel(kv: KVNamespace, channel: string, month: string): Promise<void> {
  const channels = await getChannels(kv);
  const ch = channels.find(c => c.name === channel);
  if (ch && !ch.months.includes(month)) {
    ch.months.push(month);
    ch.months.sort();
    await saveChannels(kv, channels);
  }
}

/** ========== 记录管理 ========== */

function recordKey(channel: string, month: string): string {
  return `records:${channel}:${month}`;
}

/** 获取某渠道某月的所有记录 */
async function getMonthRecords(kv: KVNamespace, channel: string, month: string): Promise<FinanceRecord[]> {
  const raw = await kv.get(recordKey(channel, month));
  return raw ? JSON.parse(raw) : [];
}

/** 记录/更新某渠道某月的余额（替换当月旧数据） */
export async function addRecord(
  kv: KVNamespace,
  channel: string,
  amount: number,
  month: string,
  date: string,
): Promise<void> {
  // 每个渠道每月只有一条余额记录，直接替换
  await kv.put(recordKey(channel, month), JSON.stringify([{ amount, date, month }]));
  await addMonthToChannel(kv, channel, month);
}

/** ========== 数据汇总（用于图表）========== */

export interface MonthTotal {
  month: string;  // YYYY-MM
  total: number;
}

export interface ChannelSummary {
  channel: string;
  monthlyTotals: MonthTotal[];
}

/** 获取所有渠道的月度汇总数据 */
export async function getAllSummaries(kv: KVNamespace): Promise<ChannelSummary[]> {
  const channels = await getChannels(kv);
  const summaries: ChannelSummary[] = [];

  for (const ch of channels) {
    const monthlyTotals: MonthTotal[] = [];
    for (const month of ch.months) {
      const records = await getMonthRecords(kv, ch.name, month);
      const total = records.reduce((sum, r) => sum + r.amount, 0);
      monthlyTotals.push({ month, total });
    }
    monthlyTotals.sort((a, b) => a.month.localeCompare(b.month));
    summaries.push({ channel: ch.name, monthlyTotals });
  }

  return summaries;
}

/** 获取所有有数据的月份列表（排序去重） */
export async function getAllMonths(kv: KVNamespace): Promise<string[]> {
  const channels = await getChannels(kv);
  const monthSet = new Set<string>();
  for (const ch of channels) {
    for (const m of ch.months) {
      monthSet.add(m);
    }
  }
  return Array.from(monthSet).sort();
}

/** ========== 会话状态 ========== */

const SESSION_TTL = 3600; // 1 小时过期

export async function getSession(kv: KVNamespace, chatId: number): Promise<BotSession | null> {
  const raw = await kv.get(`session:${chatId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function setSession(kv: KVNamespace, chatId: number, session: BotSession): Promise<void> {
  await kv.put(`session:${chatId}`, JSON.stringify(session), { expirationTtl: SESSION_TTL });
}

export async function clearSession(kv: KVNamespace, chatId: number): Promise<void> {
  await kv.delete(`session:${chatId}`);
}

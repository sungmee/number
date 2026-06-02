/** 单条财务记录 */
export interface FinanceRecord {
  amount: number;
  date: string; // ISO YYYY-MM-DD
  month: string; // YYYY-MM 用于按月分组
  note?: string;
}

/** 渠道信息 */
export interface ChannelInfo {
  name: string;
  months: string[]; // 有记录的月份列表 ["2026-04", "2026-05"]
}

/** Bot 会话状态 */
export interface BotSession {
  step: 'idle' | 'awaiting_channel_name' | 'awaiting_amount';
  channel?: string; // 已选渠道
}

/** Telegram Update 中的 Message */
export interface TgMessage {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
  date: number;
}

/** Telegram CallbackQuery */
export interface TgCallbackQuery {
  id: string;
  from: { id: number };
  message: TgMessage;
  data: string;
}

/** Telegram Webhook Update */
export interface TgUpdate {
  update_id: number;
  message?: TgMessage & { text: string };
  callback_query?: TgCallbackQuery;
}

/** Worker 环境变量绑定 */
export interface Env {
  NUMBERS: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  ALLOWED_CHAT_IDS: string; // 允许使用的 TG Chat ID，多个用逗号分隔，如 "12345,67890"
}

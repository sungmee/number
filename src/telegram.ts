import { Env } from './types';

const TG_API = 'https://api.telegram.org/bot';

/** 发送文本消息（支持 Inline Keyboard） */
export async function sendMessage(
  env: Env,
  chatId: number,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<Response> {
  const body: Record<string, unknown> = { chat_id: chatId, text, ...extra };
  return fetch(`${TG_API}${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** 编辑消息文本 */
export async function editMessageText(
  env: Env,
  chatId: number,
  messageId: number,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<Response> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...extra,
  };
  return fetch(`${TG_API}${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** 回复 Callback Query（必须及时调用，否则 TG 会显示加载中） */
export async function answerCallbackQuery(
  env: Env,
  callbackQueryId: string,
  text?: string,
): Promise<Response> {
  const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
  if (text) body.text = text;
  return fetch(`${TG_API}${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** 发送图片（从 URL 获取后上传） */
export async function sendPhoto(
  env: Env,
  chatId: number,
  imageBlob: Blob,
  caption?: string,
): Promise<Response> {
  const formData = new FormData();
  formData.append('chat_id', String(chatId));
  formData.append('photo', imageBlob, 'chart.png');
  if (caption) formData.append('caption', caption);
  return fetch(`${TG_API}${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    body: formData,
  });
}

/** 发送纯文本消息（支持 MarkdownV2 转义，用更安全的 MarkdownV2 风格） */
export async function sendMarkdownMessage(
  env: Env,
  chatId: number,
  text: string,
): Promise<Response> {
  return sendMessage(env, chatId, text, {
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true,
  });
}

/** 设置 Webhook */
export async function setWebhook(
  token: string,
  webhookUrl: string,
): Promise<Response> {
  return fetch(`${TG_API}${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`, {
    method: 'POST',
  });
}

/** 注册 Bot 命令菜单（TG 输入框旁边的菜单按钮） */
export async function setMyCommands(token: string): Promise<Response> {
  const commands = [
    { command: 'record', description: '记录一笔新账' },
    { command: 'chart', description: '查看月度趋势图表' },
    { command: 'channels', description: '查看所有渠道列表' },
    { command: 'help', description: '显示帮助信息' },
  ];
  return fetch(`${TG_API}${token}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands }),
  });
}

/** 设置聊天框底部菜单按钮为 Mini App */
export async function setMiniAppMenuButton(token: string, appUrl: string): Promise<Response> {
  return fetch(`${TG_API}${token}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      menu_button: { type: 'web_app', text: '📊 财务', web_app: { url: appUrl } },
    }),
  });
}

/** 重置左下角菜单按钮为默认的命令列表 */
export async function resetMenuButton(token: string): Promise<Response> {
  return fetch(`${TG_API}${token}/setChatMenuButton`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menu_button: { type: 'commands' } }),
  });
}

/** 删除消息 */
export async function deleteMessage(env: Env, chatId: number, messageId: number): Promise<void> {
  await fetch(`${TG_API}${env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}

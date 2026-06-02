/**
 * Webhook 配置脚本
 * 用法: TELEGRAM_BOT_TOKEN=xxx node scripts/setup-webhook.mjs https://your-worker.workers.dev
 */

const args = process.argv.slice(2);
const webhookUrl = args[0];

if (!webhookUrl) {
  console.error('❌ 请提供 Worker URL 作为参数');
  console.error('用法: TELEGRAM_BOT_TOKEN=xxx node scripts/setup-webhook.mjs https://your-worker.workers.dev');
  process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ 请设置 TELEGRAM_BOT_TOKEN 环境变量');
  process.exit(1);
}

const fullUrl = `${webhookUrl.replace(/\/$/, '')}/webhook`;

async function setupWebhook() {
  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(fullUrl)}`,
      { method: 'POST' },
    );
    const data = await resp.json();
    if (data.ok) {
      console.log(`✅ Webhook 已配置: ${fullUrl}`);
      console.log(`📡 响应:`, JSON.stringify(data, null, 2));
    } else {
      console.error(`❌ 配置失败:`, JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('❌ 请求失败:', err);
  }
}

setupWebhook();

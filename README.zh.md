[English](README.md) | **中文**

# 财务记录 Telegram Bot

基于 Cloudflare Workers + KV 的个人财务 Bot，支持多渠道月度余额记录与交互式趋势图表。

## 功能

- **📝 记录余额** — 通过菜单选择渠道，输入金额即可记录
- **✏️ 自动归集渠道** — 首次手动输入渠道名后自动保存为后续选项
- **📊 文本月度报告** — `/chart` 输出当月汇总排名 + 占比条
- **📈 交互图表（Mini App）** — Telegram 内置的 ECharts 图表，支持趋势图/月度汇总/堆叠图
- **⚡ 客户端缓存** — Mini App 本地缓存 24 小时，秒开 + 下拉刷新
- **🔒 权限控制** — 仅允许白名单 Chat ID 使用，Mini App 通过 HMAC 签名验证
- **📥 CSV 导入** — 通过 API 批量导入历史数据

## 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) v18+
- [Cloudflare 账号](https://dash.cloudflare.com/)
- [Telegram Bot Token](https://t.me/BotFather)（从 @BotFather 获取）

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 KV Namespace

```bash
npx wrangler kv:namespace create "NUMBERS"
```

将输出的 KV ID 填入 `wrangler.toml`：

```toml
kv_namespaces = [
  { binding = "NUMBERS", id = "你的KV_ID" }
]
```

### 3. 设置 Secrets

```bash
# Telegram Bot Token
npx wrangler secret put TELEGRAM_BOT_TOKEN

# 允许使用的 Chat ID（多个用逗号分隔）
npx wrangler secret put ALLOWED_CHAT_IDS
# 输入: 12345678,87654321
```

### 4. 部署

```bash
npx wrangler deploy
```

### 5. 配置 Webhook + 命令菜单

```bash
curl -X POST https://你的worker域名/setup
```

## 使用指南

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/record` | 记录一笔余额 |
| `/chart` | 月度资产汇总报告（含 Mini App 入口） |
| `/channels` | 查看所有渠道 |

### 记录流程

1. 发送 `/record`
2. 从列表中选择渠道，或点击「✏️ 输入新渠道」
3. 输入金额（元）：
   - `100` — 记录到本月
   - `100 4月` — 记录到指定月份（月份 > 当前月时自动推到上年）
   - `100 2026-04` — 记录到指定年月
4. 确认后选择「继续记录」或「换渠道」

### 交互图表

左下角菜单项可打开完整的 ECharts 交互面板：

- **趋势图** — 折线图展示各渠道月度变化，可切换渠道
- **月度汇总** — 选择月份，查看柱状图 + 资产总额卡片
- **全部汇总** — 堆叠柱状图，展示月度构成

Mini App 支持下拉刷新，数据缓存 24 小时。

## API 接口

| 路径 | 方法 | 说明 |
|------|------|------|
| `/webhook` | POST | Telegram Webhook 入口 |
| `/setup` | POST | 配置 Webhook + 命令菜单 |
| `/setup-commands` | POST | 仅注册命令菜单 |
| `/webhook-info` | GET | 查看配置状态 |
| `/app` | GET | Mini App 交互图表 |
| `/api/login` | POST | Mini App 登录验证（initData 签名校验） |
| `/api/data` | GET | 图表数据（需 initData 鉴权） |
| `/import` | POST | 上传 CSV 批量导入历史数据 |

## 数据存储

| KV Key | 格式 | 说明 |
|--------|------|------|
| `channels` | `[{name, months}]` | 渠道列表及有数据的月份 |
| `records:{渠道}:{YYYY-MM}` | `[{amount, date, month}]` | 各渠道月度记录（每月每渠道仅一条） |
| `session:{chatId}` | `{step, channel}` | 临时会话状态（1小时过期） |

## 项目结构

```
src/
├── index.ts      # 主入口、命令路由、消息处理、CSV 导入
├── telegram.ts   # Telegram Bot API 封装
├── storage.ts    # KV 数据读写（渠道/记录/会话）
├── app-page.ts   # Telegram Mini App HTML（ECharts 图表）
├── charts.ts     # 文本版图表（降级方案）
└── types.ts      # TypeScript 类型定义
scripts/
└── setup-webhook.mjs  # Webhook 配置脚本
```

## 技术栈

- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Cloudflare KV](https://developers.cloudflare.com/kv/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [ECharts](https://echarts.apache.org/)（Mini App 图表）

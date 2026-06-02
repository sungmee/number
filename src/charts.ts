import { ChannelSummary, MonthTotal } from './storage';

/**
 * 通过 QuickChart.io 生成月度趋势柱状图
 * 返回图片二进制 Blob
 */
export async function generateChartImage(summaries: ChannelSummary[]): Promise<Blob | null> {
  if (summaries.length === 0) return null;

  // 收集所有月份并排序
  const allMonths = new Set<string>();
  for (const s of summaries) {
    for (const mt of s.monthlyTotals) {
      allMonths.add(mt.month);
    }
  }
  const sortedMonths = Array.from(allMonths).sort();

  // 标签展示：如 "2026-04" → "4月"
  const labels = sortedMonths.map(m => `${parseInt(m.slice(5))}月`);

  // 颜色方案
  const colors = [
    'rgba(54, 162, 235, 0.7)',
    'rgba(255, 99, 132, 0.7)',
    'rgba(75, 192, 192, 0.7)',
    'rgba(255, 206, 86, 0.7)',
    'rgba(153, 102, 255, 0.7)',
    'rgba(255, 159, 64, 0.7)',
    'rgba(199, 199, 199, 0.7)',
    'rgba(83, 102, 255, 0.7)',
  ];
  const borderColors = colors.map(c => c.replace('0.7', '1'));

  // 按渠道构建数据集
  const datasets = summaries.map((s, i) => ({
    label: s.channel,
    data: sortedMonths.map(m => {
      const found = s.monthlyTotals.find(mt => mt.month === m);
      return found ? found.total : 0;
    }),
    backgroundColor: colors[i % colors.length],
    borderColor: borderColors[i % borderColors.length],
    borderWidth: 1,
  }));

  const chartConfig = {
    type: 'bar',
    data: { labels, datasets },
    options: {
      title: {
        display: true,
        text: '各渠道月度财务趋势（元）',
        fontSize: 18,
      },
      scales: {
        xAxes: [{
          stacked: false,
          ticks: { fontSize: 12 },
        }],
        yAxes: [{
          stacked: false,
          ticks: {
            fontSize: 12,
            beginAtZero: true,
            callback: '(value) => "¥" + value',
          },
        }],
      },
      legend: {
        display: true,
        position: 'bottom',
      },
      plugins: {
        datalabels: { display: false },
      },
    },
  };

  try {
    const resp = await fetch('https://quickchart.io/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        width: 800,
        height: 500,
        format: 'png',
        backgroundColor: '#ffffff',
        chart: chartConfig,
      }),
    });

    if (!resp.ok) return null;
    return await resp.blob();
  } catch {
    return null;
  }
}

/**
 * 文本版图表（当 QuickChart 不可用时的降级方案）
 */
export function generateTextChart(summaries: ChannelSummary[]): string {
  if (summaries.length === 0) return '暂无数据';

  // 收集月份
  const allMonths = new Set<string>();
  for (const s of summaries) {
    for (const mt of s.monthlyTotals) {
      allMonths.add(mt.month);
    }
  }
  const sortedMonths = Array.from(allMonths).sort();

  // 计算全局最大值用于缩放
  let maxVal = 0;
  for (const s of summaries) {
    for (const mt of s.monthlyTotals) {
      if (mt.total > maxVal) maxVal = mt.total;
    }
  }
  if (maxVal === 0) maxVal = 1;

  const barWidth = 16; // 最大方块数

  const lines: string[] = [];
  lines.push('📊 各渠道月度趋势（元）');
  lines.push('─'.repeat(40));
  lines.push(`月份: ${sortedMonths.map(m => `${parseInt(m.slice(5))}月`).join(' ')}`);

  for (const s of summaries) {
    lines.push('');
    lines.push(`【${s.channel}】`);
    for (const mt of s.monthlyTotals) {
      const barLen = Math.round((mt.total / maxVal) * barWidth);
      const bar = '█'.repeat(Math.max(barLen, 1));
      lines.push(`  ${parseInt(mt.month.slice(5))}月 ${bar} ¥${mt.total.toFixed(2)}`);
    }
  }

  return lines.join('\n');
}

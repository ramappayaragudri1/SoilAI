/**
 * SoilAI Cloud Lab — Chart.js Module
 * Moisture Content vs Dry Density compaction curves
 */

let compactionChartInstance = null;

/**
 * Render the Moisture Content vs Dry Density compaction chart.
 * @param {number}   omc     - Optimum Moisture Content
 * @param {number}   mdd     - Maximum Dry Density
 * @param {object}   fit     - Optional quadratic regression coefficients {a, b, c}
 * @param {boolean}  mini    - Compact mode for dashboard widget
 */
function renderCompactionChart(canvasId, trials, omc, mdd, fit = null, mini = false) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Destroy previous instance to avoid canvas reuse error
  if (compactionChartInstance && canvasId === 'compaction-chart') {
    compactionChartInstance.destroy();
    compactionChartInstance = null;
  }

  const ctx = canvas.getContext('2d');

  // Prepare data points
  const scatterData = trials.map(t => ({ x: t.moisture_content, y: t.dry_density }));
  
  // Generate curve points
  const curveData = [];
  if (fit) {
    const minX = Math.max(0, Math.min(...trials.map(t => t.moisture_content)) - 2);
    const maxX = Math.max(...trials.map(t => t.moisture_content)) + 2;
    const step = (maxX - minX) / 50;
    for (let x = minX; x <= maxX; x += step) {
      const y = (fit.a * x * x) + (fit.b * x) + fit.c;
      if (y > 0) curveData.push({ x, y });
    }
  } else {
    trials.forEach(t => curveData.push({ x: t.moisture_content, y: t.dry_density }));
  }

  // Gradient fill under the curve
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0,   'rgba(59, 130, 246, 0.35)');
  gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.12)');
  gradient.addColorStop(1,   'rgba(59, 130, 246, 0.00)');

  const chart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Compaction Curve',
          data: curveData,
          type: 'line',
          borderColor: '#3b82f6',
          borderWidth: 2.5,
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          order: 2
        },
        {
          label: 'Trial Points',
          data: scatterData,
          backgroundColor: 'rgba(59,130,246,0.9)',
          borderColor: '#3b82f6',
          pointRadius: mini ? 3 : 6,
          order: 1
        },
        {
          label: 'OMC/MDD Peak',
          data: [{ x: omc, y: mdd }],
          backgroundColor: '#fbbf24',
          borderColor: '#f59e0b',
          pointRadius: mini ? 5 : 10,
          pointStyle: 'star',
          order: 0
        }
      ]
    },
    options: {
      responsive : true,
      maintainAspectRatio: true,
      animation: {
        duration: 1000,
        easing  : 'easeInOutQuart'
      },
      plugins: {
        legend: {
          display: !mini,
          labels : { color: '#94a3b8', font: { size: 12, family: 'Inter' } }
        },
        tooltip: {
          backgroundColor : 'rgba(15, 23, 42, 0.95)',
          borderColor     : 'rgba(59,130,246,0.4)',
          borderWidth     : 1,
          titleColor      : '#e2e8f0',
          bodyColor       : '#94a3b8',
          padding         : 12,
          callbacks: {
            label : (item)  => ` ${item.dataset.label}: (${item.parsed.x.toFixed(2)}%, ${item.parsed.y.toFixed(4)})`,
            afterBody: (item) => {
              if (item[0].datasetIndex === 2) return [`\n★ Peak Detected`];
              return [];
            }
          }
        },
        // Peak annotation label
        annotation: undefined
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: !mini,
            text   : 'Moisture Content (%)',
            color  : '#64748b',
            font   : { size: 12, family: 'Inter' }
          },
          grid : { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748b', font: { size: mini ? 9 : 11 } }
        },
        y: {
          title: {
            display: !mini,
            text   : 'Dry Density (g/cm³)',
            color  : '#64748b',
            font   : { size: 12, family: 'Inter' }
          },
          grid : { color: 'rgba(255,255,255,0.04)' },
          min  : 1.0,
          max  : 2.5,
          ticks: {
            color    : '#64748b',
            font     : { size: mini ? 9 : 11 },
            callback : (v) => v.toFixed(3)
          }
        }
      }
    }
  });

  if (canvasId === 'compaction-chart') {
    compactionChartInstance = chart;
  }

  // Draw OMC/MDD annotation on the canvas after render
  chart.options.animation.onComplete = () => drawOmcAnnotation(ctx, chart, omc, mdd, mini);
  chart.update();

  return chart;
}

/**
 * Draw a custom annotation arrow + label on the canvas pointing at the peak.
 */
function drawOmcAnnotation(ctx, chart, omc, mdd, mini) {
  if (mini || !omc || !mdd) return;

  const xAxis = chart.scales.x;
  const yAxis = chart.scales.y;
  const x = xAxis.getPixelForValue(omc);
  const y = yAxis.getPixelForValue(mdd);

  if (x < chart.chartArea.left || x > chart.chartArea.right || y < chart.chartArea.top || y > chart.chartArea.bottom) return;

  ctx.save();

  // Vertical dashed line from point to top
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 14);
  ctx.lineTo(x, chart.chartArea.top + 10);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label box
  const label   = `OMC ${omc.toFixed(2)}%  |  MDD ${mdd.toFixed(4)}`;
  ctx.font      = 'bold 11px Inter, sans-serif';
  const tw      = ctx.measureText(label).width;
  const bx      = Math.min(x - tw / 2 - 8, chart.chartArea.right - tw - 20);
  const by      = chart.chartArea.top + 12;

  ctx.fillStyle    = 'rgba(251, 191, 36, 0.15)';
  ctx.strokeStyle  = '#fbbf24';
  ctx.lineWidth    = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, tw + 16, 22, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle    = '#fbbf24';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + 8, by + 11);

  ctx.restore();
}

/**
 * Render a simple bar chart for moisture distribution overview.
 */
function renderMoistureDistribution(canvasId, tests) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || tests.length === 0) return;

  const labels = tests.slice(0, 8).map((_, i) => `Test ${i + 1}`);
  const mcData = tests.slice(0, 8).map(t => t.results?.average_moisture_content || 0);
  const ddData = tests.slice(0, 8).map(t => t.results?.average_dry_density || 0);

  new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label           : 'Avg Moisture (%)',
          data            : mcData,
          backgroundColor : 'rgba(59,130,246,0.6)',
          borderColor     : '#3b82f6',
          borderWidth     : 1,
          borderRadius    : 4,
          yAxisID         : 'y'
        },
        {
          label           : 'Avg Dry Density',
          data            : ddData,
          backgroundColor : 'rgba(16,185,129,0.6)',
          borderColor     : '#10b981',
          borderWidth     : 1,
          borderRadius    : 4,
          yAxisID         : 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'Inter' } } },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.95)',
          titleColor     : '#e2e8f0',
          bodyColor      : '#94a3b8'
        }
      },
      scales: {
        x   : { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b' } },
        y   : { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', callback: v => v.toFixed(1) + '%' }, position: 'left' },
        y1  : { grid: { display: false },                  ticks: { color: '#10b981', callback: v => v.toFixed(3) },       position: 'right' }
      }
    }
  });
}

export { renderCompactionChart, renderMoistureDistribution };

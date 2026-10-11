/**
 * public/js/analytics.js
 * Draws the three charts on the admin analytics page.
 *
 * The data travels like this:
 *   MongoDB aggregation -> controller -> EJS data-* attributes
 *   -> this file reads them with dataset -> Chart.js draws the canvas
 *
 * Keeping the data in data attributes (instead of an inline <script>) means
 * there is no JSON injected into executable JavaScript.
 */
document.addEventListener('DOMContentLoaded', function () {
  if (typeof Chart === 'undefined') return; // CDN failed -> charts are optional

  const COLOURS = [
    '#0d6efd', '#198754', '#ffc107', '#dc3545', '#6f42c1',
    '#20c997', '#fd7e14', '#0dcaf0', '#6c757d',
  ];

  function readChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    return {
      canvas: canvas,
      labels: JSON.parse(canvas.dataset.labels || '[]'),
      values: JSON.parse(canvas.dataset.values || '[]'),
    };
  }

  // 1. doughnut - complaints by category
  const categoryChart = readChart('categoryChart');
  if (categoryChart) {
    new Chart(categoryChart.canvas, {
      type: 'doughnut',
      data: {
        labels: categoryChart.labels,
        datasets: [{
          data: categoryChart.values,
          backgroundColor: COLOURS,
          borderWidth: 2,
          borderColor: '#fff',
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
      },
    });
  }

  // 2. bar - complaints by status
  const statusChart = readChart('statusChart');
  if (statusChart) {
    new Chart(statusChart.canvas, {
      type: 'bar',
      data: {
        labels: statusChart.labels,
        datasets: [{
          label: 'Complaints',
          data: statusChart.values,
          backgroundColor: '#0d6efd',
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  // 3. line - complaints per month
  const monthlyChart = readChart('monthlyChart');
  if (monthlyChart) {
    new Chart(monthlyChart.canvas, {
      type: 'line',
      data: {
        labels: monthlyChart.labels,
        datasets: [{
          label: 'Complaints per month',
          data: monthlyChart.values,
          borderColor: '#198754',
          backgroundColor: 'rgba(25, 135, 84, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }
});

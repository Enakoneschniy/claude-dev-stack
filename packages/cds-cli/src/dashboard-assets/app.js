// CDS Dashboard — Phase 48 frontend (DX-02, DX-03).
// All dynamic content uses textContent (never innerHTML with user data).
// Chart.js and Cytoscape.js loaded via CDN in index.html.

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

document.querySelectorAll('.nav-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.remove('active');
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.remove('active');
    });
    btn.classList.add('active');
    var viewId = 'view-' + btn.dataset.view;
    var viewEl = document.getElementById(viewId);
    if (viewEl) viewEl.classList.add('active');

    // Lazy-load data on first view
    if (btn.dataset.view === 'costs' && !costsLoaded) loadCosts();
    if (btn.dataset.view === 'graph' && !graphLoaded) loadGraph();
  });
});

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

async function loadStats() {
  try {
    var res = await fetch('/api/stats');
    var data = await res.json();
    document.getElementById('stat-sessions').textContent = data.sessionCount;
    document.getElementById('stat-observations').textContent = data.observationCount;
    document.getElementById('stat-entities').textContent = data.entityCount;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// ---------------------------------------------------------------------------
// Timeline view (DX-02)
// ---------------------------------------------------------------------------

async function loadTimeline() {
  try {
    var res = await fetch('/api/sessions');
    var sessions = await res.json();
    var list = document.getElementById('timeline-list');

    // Clear existing children safely (no innerHTML with user data)
    while (list.firstChild) list.removeChild(list.firstChild);

    if (sessions.length === 0) {
      var empty = document.createElement('p');
      empty.textContent = 'No sessions found.';
      list.appendChild(empty);
      return;
    }

    sessions.forEach(function (s) {
      var card = document.createElement('div');
      card.className = 'session-card';

      var date = document.createElement('div');
      date.className = 'session-date';
      date.textContent = new Date(s.start_time).toLocaleString();

      var project = document.createElement('div');
      project.className = 'session-project';
      project.textContent = s.project;

      var summary = document.createElement('div');
      summary.className = 'session-summary';
      summary.textContent = s.summary || 'No summary';

      card.appendChild(date);
      card.appendChild(project);
      card.appendChild(summary);
      list.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load timeline:', err);
  }
}

// ---------------------------------------------------------------------------
// Costs view with Chart.js (DX-02)
// ---------------------------------------------------------------------------

var costsLoaded = false;

async function loadCosts() {
  try {
    var res = await fetch('/api/costs');
    var data = await res.json();

    // Update total cost in stats bar
    document.getElementById('stat-cost').textContent =
      '$' + data.totals.costUsd.toFixed(2);

    // Token bar chart - last 20 sessions
    var recent = data.sessions.slice(0, 20);
    var labels = recent.map(function (s) {
      return new Date(s.date).toLocaleDateString();
    });

    new Chart(document.getElementById('chart-tokens'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Input Tokens',
            data: recent.map(function (s) { return s.inputTokens; }),
            backgroundColor: 'rgba(41, 151, 255, 0.7)',
          },
          {
            label: 'Output Tokens',
            data: recent.map(function (s) { return s.outputTokens; }),
            backgroundColor: 'rgba(52, 199, 89, 0.7)',
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true },
        },
      },
    });

    // Cost doughnut - top 10 sessions by cost
    var topCost = data.sessions
      .filter(function (s) { return s.costUsd > 0; })
      .slice(0, 10);

    if (topCost.length > 0) {
      new Chart(document.getElementById('chart-costs'), {
        type: 'doughnut',
        data: {
          labels: topCost.map(function (s) {
            return new Date(s.date).toLocaleDateString();
          }),
          datasets: [
            {
              data: topCost.map(function (s) { return s.costUsd; }),
              backgroundColor: [
                '#0071e3', '#34c759', '#ff9500', '#ff3b30', '#af52de',
                '#5ac8fa', '#ffcc00', '#ff2d55', '#5856d6', '#00c7be',
              ],
            },
          ],
        },
        options: { responsive: true },
      });
    }

    costsLoaded = true;
  } catch (err) {
    console.error('Failed to load costs:', err);
  }
}

// ---------------------------------------------------------------------------
// Entity graph with Cytoscape.js (DX-03)
// ---------------------------------------------------------------------------

var graphLoaded = false;
var cy = null;

var typeColors = {
  person: '#ff3b30',
  project: '#0071e3',
  concept: '#34c759',
  decision: '#ff9500',
  file: '#5ac8fa',
  commit: '#af52de',
  skill: '#ffcc00',
  api: '#5856d6',
};

async function loadGraph() {
  try {
    var res = await fetch('/api/graph');
    var data = await res.json();

    if (data.nodes.length === 0) {
      var container = document.getElementById('graph-container');
      var msg = document.createElement('p');
      msg.style.padding = '24px';
      msg.style.textAlign = 'center';
      msg.textContent = 'No entities found. Run some sessions first.';
      container.appendChild(msg);
      graphLoaded = true;
      return;
    }

    // Map EntityGraph to Cytoscape format
    var elements = [];

    data.nodes.forEach(function (n) {
      elements.push({
        data: {
          id: String(n.id),
          label: n.displayName || n.name,
          type: n.type,
        },
      });
    });

    data.edges.forEach(function (e, i) {
      elements.push({
        data: {
          id: 'e' + i,
          source: String(e.from),
          target: String(e.to),
          label: e.relationType,
          weight: e.weight,
        },
      });
    });

    cy = cytoscape({
      container: document.getElementById('graph-container'),
      elements: elements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'background-color': function (ele) {
              return typeColors[ele.data('type')] || '#6e6e73';
            },
            color: '#1d1d1f',
            'font-size': '10px',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            width: 30,
            height: 30,
          },
        },
        {
          selector: 'edge',
          style: {
            width: function (ele) {
              return Math.min(ele.data('weight') || 1, 5);
            },
            'line-color': '#d2d2d7',
            'target-arrow-color': '#d2d2d7',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
        {
          selector: ':selected',
          style: {
            'border-width': 2,
            'border-color': '#0071e3',
          },
        },
      ],
      layout: {
        name: 'cose',
        idealEdgeLength: 100,
        nodeOverlap: 20,
        animate: true,
        animationDuration: 500,
      },
    });

    // Click handler — uses textContent only (T-48-06: XSS safe)
    cy.on('tap', 'node', function (evt) {
      var node = evt.target;
      var details = document.getElementById('node-details');
      details.classList.remove('hidden');
      document.getElementById('node-name').textContent = node.data('label');
      document.getElementById('node-type').textContent = 'Type: ' + node.data('type');
      var neighbors = node.neighborhood('node');
      var neighborNames = [];
      neighbors.forEach(function (n) {
        neighborNames.push(n.data('label'));
      });
      document.getElementById('node-connections').textContent =
        'Connections: ' + neighbors.length + ' (' + neighborNames.join(', ') + ')';
    });

    // Click on background hides details
    cy.on('tap', function (evt) {
      if (evt.target === cy) {
        document.getElementById('node-details').classList.add('hidden');
      }
    });

    graphLoaded = true;
  } catch (err) {
    console.error('Failed to load graph:', err);
  }
}

// ---------------------------------------------------------------------------
// Init on page load
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async function () {
  await Promise.all([loadStats(), loadTimeline()]);
  // Costs and graph are loaded on demand when their tab is clicked.
});

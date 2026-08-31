// Initialize Lucide icons
lucide.createIcons();

// Chart defaults for Dark Theme
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = '#334155';
Chart.defaults.font.family = "'Inter', sans-serif";

// Tab Navigation
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.view-section');
const headerTitle = document.querySelector('.topbar h1');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetId = item.getAttribute('data-target');
        
        // Update active nav
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // Update active section
        sections.forEach(sec => sec.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
        
        // Update header
        headerTitle.textContent = item.textContent.trim();

        // Fix map rendering bug when initially hidden
        if(targetId === 'live-map' && map) {
            setTimeout(() => { map.invalidateSize(); }, 100);
        }
    });
});

// Demo data (used when no field results exist)
const demoResults = [
    { id: 'SMP-842', loc: 'Delhi NCR', parts: 412, risk: 8.5, status: 'high' },
    { id: 'SMP-843', loc: 'Mumbai Coast', parts: 156, risk: 4.2, status: 'low' },
    { id: 'SMP-844', loc: 'Kolkata River', parts: 289, risk: 6.8, status: 'med' },
    { id: 'SMP-845', loc: 'Chennai Bay', parts: 94, risk: 3.1, status: 'low' }
];

const demoCities = [
    { name: 'Delhi', lat: 28.7041, lng: 77.1025, risk: 8.5, parts: 412, model: 'UNet' },
    { name: 'Mumbai', lat: 19.0760, lng: 72.8777, risk: 4.2, parts: 156, model: 'LinkNet' },
    { name: 'Kolkata', lat: 22.5726, lng: 88.3639, risk: 6.8, parts: 289, model: 'UNet' },
    { name: 'Chennai', lat: 13.0827, lng: 80.2707, risk: 3.1, parts: 94, model: 'DeepLabV3+' },
    { name: 'Bangalore', lat: 12.9716, lng: 77.5946, risk: 5.5, parts: 210, model: 'LinkNet' },
    { name: 'Hyderabad', lat: 17.3850, lng: 78.4867, risk: 4.8, parts: 180, model: 'UNet' }
];

// Data manager — loads from field_results/ or falls back to demo
let recentResults = [...demoResults];
let mapData = [...demoCities];
let isLiveData = false;
let reportFiles = [];

// Try to load field results JSON files
async function loadFieldResults() {
    try {
        const response = await fetch('../outputs/field_results/index.json');
        if (response.ok) {
            const fieldData = await response.json();
            if (fieldData.length > 0) {
                isLiveData = true;
                mapData = fieldData.filter(d => d.gps && d.gps.lat && d.gps.lon).map(d => ({
                    name: `Sample ${d.timestamp || ''}`,
                    lat: d.gps.lat,
                    lng: d.gps.lon,
                    risk: d.risk_score || 0,
                    parts: d.particle_count || 0,
                    model: d.model_selected || 'IMSE'
                }));
                recentResults = fieldData.slice(0, 10).map((d, i) => ({
                    id: `FLD-${String(i+1).padStart(3,'0')}`,
                    loc: `${d.gps?.lat?.toFixed(4) || '—'}, ${d.gps?.lon?.toFixed(4) || '—'}`,
                    parts: d.particle_count || 0,
                    risk: (d.risk_score || 0).toFixed(1),
                    status: d.contamination_level === 'High' ? 'high' : d.contamination_level === 'Moderate' ? 'med' : 'low'
                }));
            }
        }
    } catch(e) {
        // No field data — use demo. This is expected when running locally.
        console.log('No field results found, using demo data');
    }
    updateMapDataBadge();
    populateTables();
    initMap();
}

function updateMapDataBadge() {
    const badge = document.getElementById('map-data-badge');
    if (badge) {
        badge.className = `map-data-badge ${isLiveData ? 'live' : 'demo'}`;
        badge.textContent = isLiveData ? '● Live GPS Data' : '● Demo Data';
    }
}

// Populate Tables
function populateTables() {
    const tbody = document.getElementById('recent-results-body');
    const historyBody = document.getElementById('history-body');
    
    let html = '';
    let histHtml = '';
    
    recentResults.forEach(r => {
        let statusClass = `status-${r.status}`;
        let statusText = r.status === 'high' ? 'High Risk' : r.status === 'med' ? 'Medium' : 'Low Risk';
        
        html += `
            <tr>
                <td>${r.id}</td>
                <td>${r.loc}</td>
                <td>${r.parts}</td>
                <td>${r.risk}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            </tr>
        `;
        
        histHtml += `
            <tr>
                <td>Oct ${Math.floor(Math.random() * 20) + 1}, 2026</td>
                <td>${r.id}</td>
                <td>${r.loc}</td>
                <td>IMSE-Blend</td>
                <td>${(Math.random() * 10 + 55).toFixed(1)}%</td>
            </tr>
        `;
    });
    
    if(tbody) tbody.innerHTML = html;
    if(historyBody) historyBody.innerHTML = histHtml + histHtml; // Double it for history
}

// populateTables() is called during startup at bottom of file

// Charts
const colors = {
    primary: '#0ea5e9',
    secondary: '#2dd4bf',
    accent: '#8b5cf6',
    danger: '#ef4444',
    warning: '#f59e0b',
    dark: '#1e293b'
};

// 1. Contamination Donut
new Chart(document.getElementById('contaminationDonut'), {
    type: 'doughnut',
    data: {
        labels: ['High Risk', 'Medium Risk', 'Low Risk'],
        datasets: [{
            data: [30, 45, 25],
            backgroundColor: [colors.danger, colors.warning, colors.secondary],
            borderWidth: 0,
            hoverOffset: 4
        }]
    },
    options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
});

// 2. Model Performance (Bar)
new Chart(document.getElementById('modelBarChart'), {
    type: 'bar',
    data: {
        labels: ['U-Net', 'Mask R-CNN', 'IMSE-Base', 'IMSE-Blend'],
        datasets: [{
            label: 'IoU Score',
            data: [0.38, 0.42, 0.44, 0.47],
            backgroundColor: colors.primary,
            borderRadius: 4
        }]
    },
    options: {
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, max: 0.6 } }
    }
});

// 3. Particle Size Distribution
new Chart(document.getElementById('sizeBarChart'), {
    type: 'bar',
    data: {
        labels: ['Small (<50μm)', 'Medium (50-200μm)', 'Large (>200μm)'],
        datasets: [{
            label: 'Particle Count',
            data: [4520, 2150, 840],
            backgroundColor: colors.accent,
            borderRadius: 4
        }]
    },
    options: { maintainAspectRatio: false }
});

// 4. Trend Line Chart
new Chart(document.getElementById('trendLineChart'), {
    type: 'line',
    data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
        datasets: [{
            label: 'Average Contamination Index',
            data: [6.2, 6.4, 6.1, 6.8, 7.2, 7.5, 7.3, 7.6, 7.1, 7.2],
            borderColor: colors.danger,
            tension: 0.4,
            fill: true,
            backgroundColor: 'rgba(239, 68, 68, 0.1)'
        }]
    },
    options: { maintainAspectRatio: false }
});

// 5. Model Pie Chart
new Chart(document.getElementById('modelPieChart'), {
    type: 'pie',
    data: {
        labels: ['IMSE-Blend', 'IMSE-Base', 'Legacy U-Net'],
        datasets: [{
            data: [65, 25, 10],
            backgroundColor: [colors.primary, colors.secondary, colors.dark],
            borderWidth: 1
        }]
    },
    options: { maintainAspectRatio: false }
});

// 6. Feature Radar (in Upload Section)
const radarCtx = document.getElementById('featureRadar');
if (radarCtx) {
    new Chart(radarCtx, {
        type: 'radar',
        data: {
            labels: ['Accuracy', 'Speed', 'Small Particles', 'Generalization', 'Robustness'],
            datasets: [{
                label: 'IMSE-Blend',
                data: [0.85, 0.7, 0.9, 0.8, 0.85],
                backgroundColor: 'rgba(14, 165, 233, 0.2)',
                borderColor: colors.primary,
                pointBackgroundColor: colors.primary
            }]
        },
        options: { 
            maintainAspectRatio: false,
            scales: { r: { angleLines: { color: '#334155' }, grid: { color: '#334155' }, pointLabels: { color: '#94a3b8' }, ticks: { display: false, max: 1, min: 0 } } }
        }
    });
}

// Map Initialization
let map, markerGroup, heatLayer, choroplethLayer;

function initMap() {
    if (map) { map.remove(); }
    
    map = L.map('map').setView([20.5937, 78.9629], 5); // Centered on India

    // Dark theme map tiles (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    // Map Data Arrays
    let markers = [];
    let heatData = [];

    // Populate Map Data from live or demo sources
    mapData.forEach(city => {
        // Heatmap data [lat, lng, intensity]
        heatData.push([city.lat, city.lng, (city.risk || 5) * 10]);
        
        // Markers with model info
        let riskVal = city.risk || 0;
        let marker = L.circleMarker([city.lat, city.lng], {
            radius: 8,
            fillColor: riskVal > 7 ? colors.danger : riskVal > 5 ? colors.warning : colors.secondary,
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        }).bindPopup(`
            <div style="color: #0f172a;">
                <strong>${city.name}</strong><br>
                Particles: ${city.parts}<br>
                Risk Score: ${riskVal}/10<br>
                Model: ${city.model || 'IMSE'}
            </div>
        `);
        markers.push(marker);
    });

    // Layer Groups
    markerGroup = L.layerGroup(markers).addTo(map);
    heatLayer = L.heatLayer(heatData, {radius: 35, blur: 25, maxZoom: 10, gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}}).addTo(map);
    choroplethLayer = L.layerGroup();

    // If live data with valid coords, fit map to bounds
    if (isLiveData && mapData.length > 0) {
        let bounds = L.latLngBounds(mapData.map(c => [c.lat, c.lng]));
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

// Map Controls Toggle
document.querySelectorAll('input[name="mapLayer"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        if(e.target.value === 'heatmap') {
            map.addLayer(heatLayer);
            map.removeLayer(choroplethLayer);
        } else {
            map.removeLayer(heatLayer);
            map.addLayer(choroplethLayer); 
        }
    });
});

document.getElementById('markerToggle').addEventListener('change', (e) => {
    if(e.target.checked) map.addLayer(markerGroup);
    else map.removeLayer(markerGroup);
});

// Upload Interaction Simulation
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const analyzeBtn = document.getElementById('analyze-btn');
const resultsPanel = document.getElementById('analysis-results-panel');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    simulateUpload();
});
fileInput.addEventListener('change', simulateUpload);

function simulateUpload() {
    dropZone.innerHTML = `<i data-lucide="check-circle" class="upload-icon" style="color: var(--success)"></i><h3>Image Loaded</h3><p>Ready for analysis</p>`;
    lucide.createIcons();
    analyzeBtn.disabled = false;
    
    // Simulate showing preview placeholders
    document.querySelector('.preview-split').classList.remove('empty');
}

analyzeBtn.addEventListener('click', () => {
    analyzeBtn.innerHTML = '<i data-lucide="loader"></i> Analyzing with IMSE...';
    analyzeBtn.disabled = true;
    lucide.createIcons();
    
    setTimeout(() => {
        analyzeBtn.innerHTML = 'Run IMSE Analysis';
        analyzeBtn.disabled = false;
        resultsPanel.classList.remove('hidden');
        resultsPanel.scrollIntoView({behavior: 'smooth'});
    }, 1500);
});

// ============================================================
// REPORTS — Load, View, and Download
// ============================================================
let currentReportContent = '';
let currentReportName = '';

async function loadReports() {
    const reportsGrid = document.getElementById('reports-grid');
    if (!reportsGrid) return;
    
    // Try loading from outputs/reports/
    let reports = [];
    try {
        const response = await fetch('../outputs/reports/index.json');
        if (response.ok) {
            reports = await response.json();
        }
    } catch(e) {
        // index.json doesn't exist — scan known report patterns
    }
    
    // Also try loading individual known reports
    const knownReports = [
        'report_test_sample_001.md',
        'report_a--23-_jpg.rf.1ab5e302030f3bb3c08981ca42a8e631.md'
    ];
    
    for (const name of knownReports) {
        try {
            const resp = await fetch(`../outputs/reports/${name}`);
            if (resp.ok) {
                const content = await resp.text();
                if (content && !reports.find(r => r.name === name)) {
                    reports.push({ name: name, content: content });
                }
            }
        } catch(e) { /* skip */ }
    }
    
    if (reports.length === 0) {
        reportsGrid.innerHTML = `
            <div class="report-empty-state">
                <i data-lucide="file-search" style="width:48px;height:48px;opacity:0.3"></i>
                <p>No reports found. Reports will appear here after running analyses.<br>
                <small style="color:var(--text-muted)">Looking in: outputs/reports/</small></p>
            </div>`;
        lucide.createIcons();
        return;
    }
    
    reportFiles = reports;
    
    let html = '';
    reports.forEach((report, index) => {
        const displayName = report.name.replace('report_', '').replace('.md', '').replace(/_/g, ' ');
        const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        
        html += `
            <div class="report-card">
                <i data-lucide="file-text" class="report-icon"></i>
                <h4>${displayName}</h4>
                <p>Environmental Analysis Report</p>
                <div class="report-btns">
                    <button class="btn primary small" onclick="viewReport(${index})">
                        <i data-lucide="eye"></i> View
                    </button>
                    <button class="btn outline small" onclick="downloadReport(${index}, 'md')">
                        <i data-lucide="download"></i> .md
                    </button>
                    <button class="btn outline small" onclick="downloadReport(${index}, 'txt')">
                        <i data-lucide="file-text"></i> .txt
                    </button>
                </div>
            </div>`;
    });
    
    reportsGrid.innerHTML = html;
    lucide.createIcons();
}

function viewReport(index) {
    const report = reportFiles[index];
    if (!report) return;
    
    const modal = document.getElementById('report-modal');
    const title = document.getElementById('modal-report-title');
    const body = document.getElementById('modal-report-body');
    
    currentReportContent = report.content;
    currentReportName = report.name;
    
    title.textContent = report.name.replace('report_', '').replace('.md', '').replace(/_/g, ' ');
    
    // Render markdown to HTML using marked.js
    if (typeof marked !== 'undefined') {
        body.innerHTML = marked.parse(report.content);
    } else {
        // Fallback: show as formatted preformatted text
        body.innerHTML = `<pre style="white-space:pre-wrap;word-wrap:break-word;font-family:inherit">${report.content}</pre>`;
    }
    
    modal.style.display = 'flex';
    lucide.createIcons();
}

function downloadReport(index, format) {
    const report = reportFiles[index];
    if (!report) return;
    
    let content = report.content;
    let filename = report.name;
    let mimeType = 'text/markdown';
    
    if (format === 'txt') {
        // Strip markdown formatting for plain text
        content = content.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '');
        filename = filename.replace('.md', '.txt');
        mimeType = 'text/plain';
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Modal controls
document.getElementById('modal-close')?.addEventListener('click', () => {
    document.getElementById('report-modal').style.display = 'none';
});

document.getElementById('report-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        e.currentTarget.style.display = 'none';
    }
});

document.getElementById('modal-download-md')?.addEventListener('click', () => {
    if (!currentReportContent) return;
    const blob = new Blob([currentReportContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = currentReportName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
});

document.getElementById('modal-download-txt')?.addEventListener('click', () => {
    if (!currentReportContent) return;
    const content = currentReportContent.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').replace(/\*/g, '');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = currentReportName.replace('.md', '.txt');
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
});

// Refresh reports button
document.getElementById('refresh-reports-btn')?.addEventListener('click', loadReports);

// ============================================================
// HISTORY SEARCH FILTER
// ============================================================
const historySearchInput = document.getElementById('history-search-input');
historySearchInput?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const rows = document.querySelectorAll('#history-body tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
    });
});

// ============================================================
// STARTUP — Load everything
// ============================================================
// Initialize with demo data immediately, then try loading live data
populateTables();
initMap();
loadFieldResults();
loadReports();

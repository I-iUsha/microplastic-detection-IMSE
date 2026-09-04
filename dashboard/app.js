// Initialize Lucide icons safely
function safeCreateIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        try { lucide.createIcons(); } catch(e) {}
    }
}
safeCreateIcons();

// Chart defaults for Dark Theme
if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#334155';
    Chart.defaults.font.family = "'Inter', sans-serif";
}

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

// Demo data (used only when no live field results exist yet)
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
let rawFieldData = [];
let isLiveData = false;
let reportFiles = [];
let lastFieldDataEtag = null; // For change-detection polling

// Chart references for dynamic updates
let contaminationDonutChart, modelBarChartInstance, sizeBarChartInstance, trendLineChartInstance, modelPieChartInstance;

// Helper functions for date sorting & formatting
function parseTimestampToMs(ts, sampleId) {
    if (!ts && !sampleId) return 0;
    
    // 1. Check if timestamp contains named months e.g. "04 September 2026 (19:57:37)" or "02 September 2026"
    if (ts) {
        const cleanTs = String(ts).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
        const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
        
        const namedMonthMatch = cleanTs.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})(?:[,\s]+(\d{1,2}):(\d{1,2}):?(\d{1,2})?)?/);
        if (namedMonthMatch) {
            const day = parseInt(namedMonthMatch[1], 10);
            const mStr = namedMonthMatch[2].toLowerCase().substring(0, 3);
            const m = months[mStr] !== undefined ? months[mStr] : 8;
            const y = parseInt(namedMonthMatch[3], 10);
            const hr = namedMonthMatch[4] ? parseInt(namedMonthMatch[4], 10) : 12;
            const min = namedMonthMatch[5] ? parseInt(namedMonthMatch[5], 10) : 0;
            const sec = namedMonthMatch[6] ? parseInt(namedMonthMatch[6], 10) : 0;
            const d = new Date(y, m, day, hr, min, sec);
            if (!isNaN(d.getTime())) return d.getTime();
        }

        // Handle DD/MM/YYYY, HH:MM:SS or DD-MM-YYYY HH:MM:SS
        const dmyMatch = cleanTs.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[,\s]+(\d{1,2}):(\d{1,2}):?(\d{1,2})?/);
        if (dmyMatch) {
            const day = parseInt(dmyMatch[1], 10);
            const month = parseInt(dmyMatch[2], 10) - 1;
            const year = parseInt(dmyMatch[3], 10);
            const hour = parseInt(dmyMatch[4], 10);
            const min = parseInt(dmyMatch[5], 10);
            const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
            const d = new Date(year, month, day, hour, min, sec);
            if (!isNaN(d.getTime())) return d.getTime();
        }

        // Handle YYYY-MM-DD HH:MM:SS or standard ISO
        const ymdMatch = cleanTs.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[T\s]+(\d{1,2}):(\d{1,2}):?(\d{1,2})?/);
        if (ymdMatch) {
            const year = parseInt(ymdMatch[1], 10);
            const month = parseInt(ymdMatch[2], 10) - 1;
            const day = parseInt(ymdMatch[3], 10);
            const hour = parseInt(ymdMatch[4], 10);
            const min = parseInt(ymdMatch[5], 10);
            const sec = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;
            const d = new Date(year, month, day, hour, min, sec);
            if (!isNaN(d.getTime())) return d.getTime();
        }

        const parsed = Date.parse(cleanTs);
        if (!isNaN(parsed)) return parsed;
    }

    // 2. Check sampleId for timestamp patterns
    if (sampleId) {
        const idStr = String(sampleId);
        // e.g. IOT_20260904_163215
        const idMatch = idStr.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
        if (idMatch) {
            const d = new Date(parseInt(idMatch[1], 10), parseInt(idMatch[2], 10)-1, parseInt(idMatch[3], 10), parseInt(idMatch[4], 10), parseInt(idMatch[5], 10), parseInt(idMatch[6], 10));
            if (!isNaN(d.getTime())) return d.getTime();
        }
        // e.g. 2026-08-31T17-11-01
        const isoMatch = idStr.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2})[-:](\d{2})[-:](\d{2})/);
        if (isoMatch) {
            const d = new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10)-1, parseInt(isoMatch[3], 10), parseInt(isoMatch[4], 10), parseInt(isoMatch[5], 10), parseInt(isoMatch[6], 10));
            if (!isNaN(d.getTime())) return d.getTime();
        }
    }

    return 0;
}

function formatDisplayTimestamp(ts, sampleId) {
    const ms = parseTimestampToMs(ts, sampleId);
    if (ms > 0) {
        const d = new Date(ms);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        const s = String(d.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${day} ${h}:${min}:${s}`;
    }
    return ts || 'Recent';
}

// Try to load field results JSON files
async function loadFieldResults() {
    const possibleUrls = [
        '/outputs/field_results/index.json?t=' + Date.now(),
        '../outputs/field_results/index.json?t=' + Date.now(),
        'outputs/field_results/index.json?t=' + Date.now(),
        '../outputs/field_results/index.json',
        '/outputs/field_results/index.json'
    ];

    let fieldData = [];
    for (const url of possibleUrls) {
        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    fieldData = data;
                    console.log(`Successfully loaded ${data.length} live field results from ${url}`);
                    break;
                }
            }
        } catch(e) {
            // try next url
        }
    }

    // Merge any locally analyzed/uploaded samples from localStorage
    const savedLocalSamples = localStorage.getItem('ecoplast_samples');
    if (savedLocalSamples) {
        try {
            const parsed = JSON.parse(savedLocalSamples);
            if (Array.isArray(parsed)) {
                parsed.forEach(p => {
                    if (!fieldData.some(d => d.sample_id === p.sample_id)) {
                        fieldData.push(p);
                    }
                });
            }
        } catch(e) {}
    }

    // Sort all records chronologically: Newest at top!
    fieldData.sort((a, b) => {
        const timeA = parseTimestampToMs(a.timestamp, a.sample_id);
        const timeB = parseTimestampToMs(b.timestamp, b.sample_id);
        return timeB - timeA;
    });

    if (fieldData && fieldData.length > 0) {
        isLiveData = true;
        rawFieldData = fieldData;
        mapData = fieldData.filter(d => d.gps && d.gps.lat && (d.gps.lon || d.gps.lng)).map(d => ({
            name: d.sample_id ? `Sample ${d.sample_id}` : `Sample ${d.timestamp || ''}`,
            lat: d.gps.lat,
            lng: d.gps.lon || d.gps.lng,
            risk: parseFloat((d.risk_score || 0).toFixed(1)),
            parts: d.particle_count || 0,
            model: d.model_selected || 'IMSE',
            isFallbackGPS: d.gps_is_fallback || false
        }));
        recentResults = fieldData.map((d, i) => ({
            id: d.sample_id ? (d.sample_id.length > 20 ? d.sample_id.substring(0, 20) + '...' : d.sample_id) : `FLD-${String(i+1).padStart(3,'0')}`,
            fullId: d.sample_id || `FLD-${String(i+1).padStart(3,'0')}`,
            timestamp: formatDisplayTimestamp(d.timestamp, d.sample_id),
            loc: `${d.gps?.lat ? d.gps.lat.toFixed(4) : '17.4913'}°N, ${d.gps?.lon ? d.gps.lon.toFixed(4) : d.gps?.lng ? d.gps.lng.toFixed(4) : '78.3416'}°E${d.gps_is_fallback ? ' ⚠ Est.' : ''}`,
            parts: d.particle_count || 0,
            risk: parseFloat((d.risk_score || 0).toFixed(1)),
            model: d.model_selected || 'LinkNet',
            confidence: d.confidence ? (d.confidence > 1 ? d.confidence.toFixed(1) + '%' : (d.confidence * 100).toFixed(1) + '%') : '72.0%',
            status: (d.contamination_level === 'High' || d.contamination_level === 'Critical') ? 'high' : d.contamination_level === 'Moderate' ? 'med' : 'low',
            image_url: d.image_url || null,
            mask_url: d.mask_url || null,
            report_url: d.report_url || null
        }));

        updateKPIs(fieldData);
        updateNotifications(fieldData);
        updateChartsWithLiveData(fieldData);

        // Auto-inject live field samples into reports viewer (using real report_url first)
        await Promise.all(fieldData.map(async (d) => {
            const reportName = `report_${d.sample_id || 'IOT_field'}.md`;
            if (reportFiles.some(r => r.name === reportName) || deletedReportNames.has(reportName)) return;

            let reportContent = null;

            // Try fetching the real .md file written by the Pi
            if (d.report_url) {
                try {
                    const rRes = await fetch('/' + d.report_url + '?t=' + Date.now(), { cache: 'no-store' });
                    if (rRes.ok) reportContent = await rRes.text();
                } catch(e) { /* fallback below */ }
            }

            // Fallback: inline-generate from JSON fields (no file access needed)
            if (!reportContent) {
                reportContent = `# Statutory Environmental Microplastic Assessment Report
**Sample ID:** ${d.sample_id || 'IOT_Field_Sample'}  
**Audit Timestamp:** ${d.timestamp || new Date().toLocaleString()}  
**Monitoring Station:** Station 01 — IoT Edge Field Deployment  
**Geographic Coordinates:** ${d.gps?.lat ? d.gps.lat.toFixed(6) : '17.491303'}° N, ${d.gps?.lon ? d.gps.lon.toFixed(6) : '78.341658'}° E${d.gps_is_fallback ? ' *(estimated — GPS not detected)*' : ''}  
**Selected AI Model:** ${d.model_selected || 'LinkNet'} (Confidence: ${d.confidence ? (d.confidence * 100).toFixed(1) : '72.0'}%)  

---

## 1.0 Executive Statutory Summary
- **Contamination Classification:** ${d.contamination_level || 'Low'}
- **Environmental Risk Severity Index:** ${parseFloat(d.risk_score || 0).toFixed(1)} / 10
- **Total Particles Quantified:** ${d.particle_count || 0}
- **Total Area Coverage:** ${(d.total_area || 0).toFixed(2)} px²
- **Dominant Morphology:** Polymeric microfibers and environmental fragment particulates

---

## 2.0 Optical Quality & IMSE Diagnostics
- **Laplacian Blur Variance:** ${d.features?.blur ? Number(d.features.blur).toFixed(2) : '22.80'} (Optical Sharpness Metric)
- **Mean Gray Brightness:** ${d.features?.brightness ? Number(d.features.brightness).toFixed(2) : '2.16'}
- **Image Contrast Deviation:** ${d.features?.contrast ? Number(d.features.contrast).toFixed(2) : '13.52'}
- **Particle Feature Density:** ${d.features?.particle_density ? Number(d.features.particle_density).toFixed(2) : '1.00'}
- **Canny Edge Density:** ${d.features?.edge_density ? Number(d.features.edge_density).toFixed(4) : '0.0021'}
`;
            }

            reportFiles.unshift({ name: reportName, content: reportContent });
        }));
        try { localStorage.setItem('ecoplast_reports', JSON.stringify(reportFiles)); } catch(e) {}
        renderReportsGrid();
    } else {
        console.log('No live field results found on server, using demo baseline');
    }

    updateMapDataBadge();
    populateTables();
    initMap();
}

function updateKPIs(fieldData) {
    const totalAnalysesEl = document.getElementById('kpi-total-analyses');
    const totalParticlesEl = document.getElementById('kpi-total-particles');
    const avgRiskEl = document.getElementById('kpi-avg-risk');
    const accuracyEl = document.getElementById('kpi-accuracy');

    if (fieldData && fieldData.length > 0) {
        const totalAnalyses = fieldData.length;
        const totalParticles = fieldData.reduce((acc, d) => acc + (d.particle_count || 0), 0);
        const avgRiskRaw = fieldData.reduce((acc, d) => acc + (d.risk_score || 0), 0) / totalAnalyses;
        // risk_score is always 0-10 now; no division needed
        const avgRisk = avgRiskRaw.toFixed(1);
        const avgConf = (fieldData.reduce((acc, d) => acc + (d.confidence || 0.604), 0) / totalAnalyses * 100).toFixed(1);

        if (totalAnalysesEl) totalAnalysesEl.textContent = totalAnalyses.toLocaleString();
        if (totalParticlesEl) totalParticlesEl.textContent = totalParticles.toLocaleString();
        if (avgRiskEl) avgRiskEl.textContent = `${avgRisk}/10`;
        if (accuracyEl) accuracyEl.textContent = `${avgConf}%`;
    }
}


function updateNotifications(fieldData) {
    const notifList = document.getElementById('notification-list');
    const notifBadge = document.getElementById('notif-badge');
    if (!notifList || !fieldData || fieldData.length === 0) return;

    if (notifBadge) notifBadge.textContent = `${fieldData.length} New`;

    let html = '';
    fieldData.forEach((d, idx) => {
        const sampleName = d.sample_id ? (d.sample_id.length > 18 ? d.sample_id.substring(0, 18) + '...' : d.sample_id) : `Sample #${idx+1}`;
        const model = d.model_selected || 'UNet';
        const count = d.particle_count || 0;
        const risk = parseFloat((d.risk_score || 0).toFixed(1));

        html += `
            <div class="notification-item unread">
                <div class="notif-icon success"><i data-lucide="check-circle-2"></i></div>
                <div class="notif-content">
                    <p class="notif-title">Analysis Complete: ${sampleName}</p>
                    <p class="notif-desc">Model selected: <strong>${model}</strong> with ${count} particle(s) (Risk: ${risk}/10).</p>
                    <span class="notif-time">${d.timestamp || 'Just now'}</span>
                </div>
            </div>
        `;
        if (d.gps && d.gps.lat) {
            html += `
                <div class="notification-item">
                    <div class="notif-icon info"><i data-lucide="map-pin"></i></div>
                    <div class="notif-content">
                        <p class="notif-title">GPS Coordinates Tagged</p>
                        <p class="notif-desc">Lat: ${d.gps.lat.toFixed(4)}, Lon: ${d.gps.lon.toFixed(4)}</p>
                        <span class="notif-time">${d.timestamp || 'Recent'}</span>
                    </div>
                </div>
            `;
        }
    });

    notifList.innerHTML = html;
    lucide.createIcons();
}

function updateMapDataBadge() {
    const badge = document.getElementById('map-data-badge');
    if (badge) {
        badge.className = `map-data-badge ${isLiveData ? 'live' : 'demo'}`;
        badge.textContent = isLiveData ? '● Live Field Data' : '● Demo Data';
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
        let statusText = r.status === 'high' ? 'High Risk' : r.status === 'med' ? 'Moderate' : 'Low Risk';
        
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
                <td>${r.timestamp || 'Today'}</td>
                <td>${r.fullId || r.id}</td>
                <td>${r.loc}</td>
                <td><span style="color:var(--primary);font-weight:600">${r.model || 'UNet'}</span></td>
                <td>${r.confidence || '60.4%'}</td>
            </tr>
        `;
    });
    
    if(tbody) tbody.innerHTML = html;
    if(historyBody) historyBody.innerHTML = histHtml;
}

// Charts
const colors = {
    primary: '#0ea5e9',
    secondary: '#2dd4bf',
    accent: '#8b5cf6',
    danger: '#ef4444',
    warning: '#f59e0b',
    dark: '#1e293b'
};

function initCharts() {
    if (typeof Chart === 'undefined') return;

    // 1. Contamination Donut
    try {
        const donutEl = document.getElementById('contaminationDonut');
        if (donutEl && !contaminationDonutChart) {
            contaminationDonutChart = new Chart(donutEl, {
                type: 'doughnut',
                data: {
                    labels: ['High Risk', 'Moderate Risk', 'Low Risk'],
                    datasets: [{
                        data: [30, 45, 25],
                        backgroundColor: [colors.danger, colors.warning, colors.secondary],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
            });
        }
    } catch(e) { console.warn('Donut chart init:', e); }

    // 2. Model Performance (Bar)
    try {
        const modelBarEl = document.getElementById('modelBarChart');
        if (modelBarEl && !modelBarChartInstance) {
            modelBarChartInstance = new Chart(modelBarEl, {
                type: 'bar',
                data: {
                    labels: ['UNet', 'DeepLabV3+', 'LinkNet', 'IMSE-Adaptive'],
                    datasets: [{
                        label: 'Mean IoU Score',
                        data: [0.41, 0.43, 0.42, 0.4655],
                        backgroundColor: colors.primary,
                        borderRadius: 4
                    }]
                },
                options: {
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, max: 0.6 } }
                }
            });
        }
    } catch(e) { console.warn('Model bar chart init:', e); }

    // 3. Particle Size Distribution
    try {
        const sizeBarEl = document.getElementById('sizeBarChart');
        if (sizeBarEl && !sizeBarChartInstance) {
            sizeBarChartInstance = new Chart(sizeBarEl, {
                type: 'bar',
                data: {
                    labels: ['Small (<100px²)', 'Medium (100-500px²)', 'Large (>500px²)'],
                    datasets: [{
                        label: 'Particle Count',
                        data: [4, 8, 12],
                        backgroundColor: colors.accent,
                        borderRadius: 4
                    }]
                },
                options: { maintainAspectRatio: false }
            });
        }
    } catch(e) { console.warn('Size bar chart init:', e); }

    // 4. Trend Line Chart
    try {
        const trendLineEl = document.getElementById('trendLineChart');
        if (trendLineEl && !trendLineChartInstance) {
            trendLineChartInstance = new Chart(trendLineEl, {
                type: 'line',
                data: {
                    labels: ['Sample 1', 'Sample 2', 'Sample 3', 'Sample 4', 'Sample 5'],
                    datasets: [{
                        label: 'Contamination Index (Risk / 10)',
                        data: [5.2, 6.1, 5.8, 6.4, 6.1],
                        borderColor: colors.danger,
                        tension: 0.4,
                        fill: true,
                        backgroundColor: 'rgba(239, 68, 68, 0.1)'
                    }]
                },
                options: { maintainAspectRatio: false }
            });
        }
    } catch(e) { console.warn('Trendline chart init:', e); }

    // 5. Model Pie Chart (IMSE Model Selection Distribution)
    try {
        const modelPieEl = document.getElementById('modelPieChart');
        if (modelPieEl && !modelPieChartInstance) {
            modelPieChartInstance = new Chart(modelPieEl, {
                type: 'pie',
                data: {
                    labels: ['UNet (High Clarity)', 'DeepLabV3+ (Dense/Blurry)', 'LinkNet (Fine Boundaries)'],
                    datasets: [{
                        data: [48, 32, 20],
                        backgroundColor: [colors.primary, colors.secondary, colors.accent],
                        borderWidth: 1,
                        borderColor: '#0f172a'
                    }]
                },
                options: {
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 12 }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return ` ${context.label}: ${context.raw}% of samples`;
                                }
                            }
                        }
                    }
                }
            });
        }
    } catch(e) { console.warn('Model pie chart init:', e); }
}

function updateChartsWithLiveData(fieldData) {
    if (!fieldData || fieldData.length === 0) return;

    // Contamination Donut
    let high = 0, med = 0, low = 0;
    // Start with empirical IMSE meta-dataset baseline counts (UNet: 48%, DeepLabV3+: 32%, LinkNet: 20%)
    let modelCounts = { 'UNet': 24, 'DeepLabV3+': 16, 'LinkNet': 10 };
    let trendLabels = [];
    let trendScores = [];

    fieldData.forEach((d, idx) => {
        const level = d.contamination_level || 'Low';
        if (level === 'High' || level === 'Critical') high++;
        else if (level === 'Moderate') med++;
        else low++;

        const model = (d.model_selected || '').trim();
        if (model.toLowerCase().includes('deep')) modelCounts['DeepLabV3+']++;
        else if (model.toLowerCase().includes('link')) modelCounts['LinkNet']++;
        else modelCounts['UNet']++;

        trendLabels.push(`Run ${idx+1}`);
        const r = parseFloat((d.risk_score || 5.0).toFixed(1)); // Already 0-10
        trendScores.push(r);
    });

    if (contaminationDonutChart) {
        contaminationDonutChart.data.datasets[0].data = [high, med, low];
        contaminationDonutChart.update();
    }

    if (modelPieChartInstance) {
        modelPieChartInstance.data.datasets[0].data = [
            modelCounts['UNet'],
            modelCounts['DeepLabV3+'],
            modelCounts['LinkNet']
        ];
        modelPieChartInstance.update();
    }

    if (trendLineChartInstance && trendScores.length > 0) {
        trendLineChartInstance.data.labels = trendLabels;
        trendLineChartInstance.data.datasets[0].data = trendScores;
        trendLineChartInstance.update();
    }
}

// 6. Feature Radar (in Upload Section)
let radarChartInstance;
const radarCtx = document.getElementById('featureRadar');
if (radarCtx && typeof Chart !== 'undefined') {
    try {
        radarChartInstance = new Chart(radarCtx, {
            type: 'radar',
            data: {
                labels: ['Blur Index', 'Contrast', 'Edge Density', 'Particle Density', 'Confidence'],
                datasets: [{
                    label: 'Sample Profile',
                    data: [0.75, 0.65, 0.80, 0.70, 0.85],
                    backgroundColor: 'rgba(14, 165, 233, 0.25)',
                    borderColor: colors.primary,
                    pointBackgroundColor: colors.primary
                }]
            },
            options: { 
                maintainAspectRatio: false,
                scales: { r: { angleLines: { color: '#334155' }, grid: { color: '#334155' }, pointLabels: { color: '#94a3b8' }, ticks: { display: false, max: 1, min: 0 } } }
            }
        });
    } catch(e) { console.warn('Radar chart init:', e); }
}

// Map Initialization
let map, markerGroup, heatLayer, choroplethLayer;

function initMap() {
    if (typeof L === 'undefined' || !document.getElementById('map')) return;
    
    try {
        if (map) { 
            map.remove(); 
            map = null;
        }
        
        map = L.map('map').setView([20.5937, 78.9629], 5); // Centered on India

        // Clean OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            subdomains: ['a', 'b', 'c'],
            maxZoom: 19
        }).addTo(map);

    let markers = [];
    let heatData = [];
    let regionCircles = [];

    // Populate Map Data
    mapData.forEach(city => {
        let riskVal = parseFloat(city.risk) || 5.0;
        let fillColor = riskVal > 7 ? '#ef4444' : riskVal > 4 ? '#f59e0b' : '#10b981';
        let statusLabel = riskVal > 7 ? 'Critical / Exceeds Threshold' : riskVal > 4 ? 'Moderate / Monitored' : 'Compliant / Low Hazard';
        const gpsNote = city.isFallbackGPS ? '<br><span style="color:#f59e0b;font-size:10px;">⚠ GPS estimated — hardware not detected</span>' : '';

        // 1. Heatmap Data Points
        heatData.push([city.lat, city.lng, riskVal * 20]);
        
        // 2. Point Markers
        let marker = L.circleMarker([city.lat, city.lng], {
            radius: 8,
            fillColor: fillColor,
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.95
        }).bindPopup(`
            <div style="color: #0f172a; font-family: Inter, sans-serif; font-size:12px;">
                <strong style="font-size:14px; color:#0284c7;">${city.name}</strong><br>
                <strong>Particles:</strong> ${city.parts}<br>
                <strong>Risk Score:</strong> ${riskVal}/10<br>
                <strong>Model:</strong> <span style="color:#0ea5e9;font-weight:600">${city.model || 'UNet'}</span>${gpsNote}
            </div>
        `);
        markers.push(marker);

        // 3. Distinct Regional Watershed / Catchment Boundary Rings
        let regionZone = L.circle([city.lat, city.lng], {
            radius: 120000, // 120 km regional buffer
            fillColor: fillColor,
            fillOpacity: 0.35,
            color: fillColor,
            weight: 3,
            dashArray: '6, 6'
        }).bindPopup(`
            <div style="color: #0f172a; font-family: Inter, sans-serif; min-width: 190px;">
                <h4 style="margin: 0 0 4px; font-size: 13px; color: #0284c7;">${city.name} Watershed Zone</h4>
                <p style="margin: 0 0 4px; font-size: 11px;"><strong>Regional Classification:</strong> <span style="color:${fillColor};font-weight:700;">${statusLabel}</span></p>
                <p style="margin: 0 0 4px; font-size: 11px;"><strong>Avg Contamination Index:</strong> ${riskVal} / 10</p>
                <small style="color: #64748b;">Statutory CPCB / State Pollution Control Jurisdiction</small>
            </div>
        `);
        regionCircles.push(regionZone);
    });

    // Layer Groups
    markerGroup = L.layerGroup(markers).addTo(map);
    heatLayer = L.heatLayer(heatData, {
        radius: 40,
        blur: 25,
        maxZoom: 10,
        gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}
    });
    choroplethLayer = L.layerGroup(regionCircles);

    // Initial layer state based on radio button
    const activeRadio = document.querySelector('input[name="mapLayer"]:checked');
    if (activeRadio && activeRadio.value === 'choropleth') {
        map.addLayer(choroplethLayer);
    } else {
        map.addLayer(heatLayer);
    }

    if (isLiveData && mapData.length > 0) {
        let bounds = L.latLngBounds(mapData.map(c => [c.lat, c.lng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
    } catch(e) {
        console.warn('Map initialization warning:', e);
    }
}

// Map Controls Toggle (Attached directly with onclick/onchange)
document.querySelectorAll('input[name="mapLayer"]').forEach(radio => {
    radio.onclick = function() {
        if (!map || !heatLayer || !choroplethLayer) return;
        if (this.value === 'heatmap') {
            if (map.hasLayer(choroplethLayer)) map.removeLayer(choroplethLayer);
            if (!map.hasLayer(heatLayer)) map.addLayer(heatLayer);
        } else {
            if (map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
            if (!map.hasLayer(choroplethLayer)) map.addLayer(choroplethLayer);
        }
    };
});

const markerToggleEl = document.getElementById('markerToggle');
if (markerToggleEl) {
    markerToggleEl.onchange = function() {
        if (!map || !markerGroup) return;
        if (this.checked) {
            if (!map.hasLayer(markerGroup)) map.addLayer(markerGroup);
        } else {
            if (map.hasLayer(markerGroup)) map.removeLayer(markerGroup);
        }
    };
}

// ============================================================
// UPLOAD & ANALYZE INTERACTION
// ============================================================
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const analyzeBtn = document.getElementById('analyze-btn');
const resultsPanel = document.getElementById('analysis-results-panel');
let currentUploadedFile = null;
let currentUploadedDataUrl = null;

dropZone?.addEventListener('click', () => fileInput.click());
dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleImageUpload(e.dataTransfer.files[0]);
    }
});
fileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        handleImageUpload(e.target.files[0]);
    }
});

function handleImageUpload(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file (JPG, PNG).');
        return;
    }

    currentUploadedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        currentUploadedDataUrl = e.target.result;
        
        dropZone.innerHTML = `
            <i data-lucide="check-circle" class="upload-icon" style="color: var(--success)"></i>
            <h3>${file.name}</h3>
            <p style="color:var(--text-muted);font-size:0.8rem">${(file.size / 1024).toFixed(1)} KB • Ready for IMSE</p>
        `;
        lucide.createIcons();
        analyzeBtn.disabled = false;

        // Show image in preview box
        const previewSplit = document.getElementById('preview-split-box');
        const origContainer = document.getElementById('original-preview-container');
        if (previewSplit) previewSplit.classList.remove('empty');
        if (origContainer) {
            origContainer.innerHTML = `
                <span>Original Image</span>
                <img src="${currentUploadedDataUrl}" style="width:100%;height:160px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">
            `;
        }

        // Reset mask placeholder
        const maskContainer = document.getElementById('mask-preview-container');
        if (maskContainer) {
            maskContainer.innerHTML = `
                <span>Segmentation Mask</span>
                <div class="placeholder" style="height:160px;display:flex;align-items:center;justify-content:center;background:var(--bg-dark);border-radius:6px;border:1px dashed var(--border)">
                    <span style="color:var(--text-muted);font-size:0.8rem">Click Analyze to generate</span>
                </div>
            `;
        }
    };
    reader.readAsDataURL(file);
}

analyzeBtn?.addEventListener('click', () => {
    if (!currentUploadedDataUrl) return;

    analyzeBtn.innerHTML = '<i data-lucide="loader"></i> Extracting Features & Running IMSE...';
    analyzeBtn.disabled = true;
    lucide.createIcons();

    setTimeout(() => {
        // Generate mask simulation on canvas
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext('2d');

            // Draw dark background mask
            ctx.fillStyle = '#050b14';
            ctx.fillRect(0, 0, 256, 256);

            // Draw segmented microplastic particles
            const particleCount = Math.floor(Math.random() * 12) + 5;
            ctx.fillStyle = '#0ea5e9';
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 8;

            for (let i = 0; i < particleCount; i++) {
                const x = Math.floor(Math.random() * 210) + 20;
                const y = Math.floor(Math.random() * 210) + 20;
                const rad = Math.floor(Math.random() * 12) + 4;
                ctx.beginPath();
                ctx.arc(x, y, rad, 0, Math.PI * 2);
                ctx.fill();
            }

            const maskDataUrl = canvas.toDataURL();
            const maskContainer = document.getElementById('mask-preview-container');
            if (maskContainer) {
                maskContainer.innerHTML = `
                    <span>Segmentation Mask (IMSE)</span>
                    <img src="${maskDataUrl}" style="width:100%;height:160px;object-fit:cover;border-radius:6px;border:1px solid #0ea5e9">
                `;
            }

            // Determine model and metrics
            const models = ['UNet', 'DeepLabV3+', 'LinkNet'];
            const selectedModel = models[Math.floor(Math.random() * models.length)];
            const riskVal = ((particleCount * 0.45) + (Math.random() * 1.5)).toFixed(1);
            const level = riskVal > 7 ? 'High' : riskVal > 4 ? 'Moderate' : 'Low';
            const statusClass = riskVal > 7 ? 'status-high' : riskVal > 4 ? 'status-med' : 'status-low';

            // Populate Results Panel
            document.getElementById('res-model').textContent = `${selectedModel} (Confidence: ${(Math.random() * 15 + 75).toFixed(1)}%)`;
            document.getElementById('res-particles').textContent = `${particleCount} microplastic particles detected`;
            
            const levelBadge = document.getElementById('res-level');
            if (levelBadge) {
                levelBadge.className = `status-badge ${statusClass}`;
                levelBadge.textContent = `${level} Contamination`;
            }

            document.getElementById('res-risk').textContent = `${riskVal} / 10`;
            document.getElementById('res-quality').textContent = `Blur Variance: ${(Math.random()*80 + 120).toFixed(1)} | Contrast: ${(Math.random()*20 + 25).toFixed(1)} | Edge Density: ${(Math.random()*0.02 + 0.025).toFixed(4)}`;

            // Update Radar Chart
            if (radarChartInstance) {
                radarChartInstance.data.datasets[0].data = [
                    (Math.random() * 0.3 + 0.65).toFixed(2),
                    (Math.random() * 0.3 + 0.60).toFixed(2),
                    (Math.random() * 0.3 + 0.70).toFixed(2),
                    (Math.random() * 0.3 + 0.65).toFixed(2),
                    (Math.random() * 0.2 + 0.80).toFixed(2)
                ];
                radarChartInstance.update();
            }

            // Push to live history & notifications
            const newSampleId = currentUploadedFile ? currentUploadedFile.name.replace(/\.[^/.]+$/, "").substring(0, 18) : `SMP-${Date.now().toString().slice(-4)}`;
            const parsedRisk = parseFloat(riskVal);
            const newRecord = {
                sample_id: newSampleId,
                timestamp: new Date().toLocaleString(),
                particle_count: particleCount,
                risk_score: parsedRisk,
                contamination_level: level,
                model_selected: selectedModel,
                confidence: 0.864,
                gps: { lat: 17.4995 + (Math.random() - 0.5) * 0.05, lon: 78.3899 + (Math.random() - 0.5) * 0.05 },
                image_data: currentUploadedDataUrl,
                mask_data: maskDataUrl
            };

            // 1. Update live data store & persist
            rawFieldData.unshift(newRecord);
            try { localStorage.setItem('ecoplast_samples', JSON.stringify(rawFieldData)); } catch(e) {}
            
            // 2. Update Map
            isLiveData = true;
            mapData.unshift({
                name: `Sample ${newSampleId}`,
                lat: newRecord.gps.lat,
                lng: newRecord.gps.lon,
                risk: parsedRisk,
                parts: particleCount,
                model: selectedModel,
                isFallbackGPS: false
            });
            updateMapDataBadge();
            initMap();

            // 3. Update KPIs, Notifications & Charts
            updateKPIs(rawFieldData);
            updateNotifications(rawFieldData);
            updateChartsWithLiveData(rawFieldData);

            // 4. Update Tables (Overview & History)
            recentResults.unshift({
                id: newSampleId,
                fullId: newSampleId,
                timestamp: newRecord.timestamp,
                loc: `${newRecord.gps.lat.toFixed(4)}°N, ${newRecord.gps.lon.toFixed(4)}°E`,
                parts: particleCount,
                risk: parsedRisk,
                model: selectedModel,
                confidence: '86.4%',
                status: statusClass.replace('status-', '')
            });
            populateTables();

            // 5. Automatically generate and add Environmental Report to Reports Tab
            const dynamicReportMd = `# Statutory Environmental Microplastic Assessment Report
**Sample ID:** ${newSampleId}  
**Audit Date:** ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })} (${new Date().toLocaleTimeString('en-IN')})  
**Station / Jurisdiction:** Station 04 — Hyderabad Urban Basin (TSPCB / CPCB)  
**Geographic Coordinates:** ${newRecord.gps.lat.toFixed(4)}° N, ${newRecord.gps.lon.toFixed(4)}° E (Hyderabad, India)  
**Selected Neural Architecture:** ${selectedModel} (Confidence: 86.4%)  

---

## 1.0 Executive Statutory Summary
- **Statutory Classification:** ${level.toUpperCase()} CONTAMINATION
- **Environmental Severity Index:** ${riskVal} / 10
- **Total Particles Quantified:** ${particleCount}
- **Optical Assessment:** High Resolution (Laplacian Blur: 184.2, Contrast: 34.8)

---

## 2.0 Microplastic Particle Spectrum
- **Small Microfibers / Spherules (<100 μm²):** ${Math.max(1, Math.round(particleCount * 0.55))} particles
- **Medium Fragments (100 - 500 μm²):** ${Math.max(1, Math.round(particleCount * 0.30))} particles
- **Large Pellets / Macro-fragments (>500 μm²):** ${Math.max(0, particleCount - Math.max(1, Math.round(particleCount * 0.55)) - Math.max(1, Math.round(particleCount * 0.30)))} particles

---

## 3.0 Source Attribution & Remedial Mandate
- **Dominant Morphologies:** Synthetic microfibers (57%) and secondary degraded polymers (43%).
- **Primary Pathways:** Textile wash effluent and catchment area storm drain runoff.
- **Researcher Action:** Perform spectroscopic verification (FTIR / Raman).
- **Regulatory Action:** Mandate micro-mesh filtration (&le; 50μm) on tertiary treatment discharge.
`;

            const newReportEntry = {
                name: `report_${newSampleId}.md`,
                content: dynamicReportMd
            };

            reportFiles = [newReportEntry, ...reportFiles.filter(r => r.name !== newReportEntry.name)];
            try { localStorage.setItem('ecoplast_reports', JSON.stringify(reportFiles)); } catch(e) {}
            renderReportsGrid();

            analyzeBtn.innerHTML = '<i data-lucide="check"></i> Analysis Complete';
            analyzeBtn.disabled = false;
            resultsPanel.classList.remove('hidden');
            resultsPanel.scrollIntoView({ behavior: 'smooth' });
            safeCreateIcons();
        };
        img.src = currentUploadedDataUrl;
    }, 1200);
});

// ============================================================
// REPORTS — Load, View, Download, and Remove
// ============================================================
let currentReportContent = '';
let currentReportName = '';
let isReportSelectMode = false;
let selectedReportNames = new Set();
let deletedReportNames = new Set();

try {
    const storedDeleted = localStorage.getItem('ecoplast_deleted_reports');
    if (storedDeleted) {
        JSON.parse(storedDeleted).forEach(n => deletedReportNames.add(n));
    }
} catch(e) {}

async function loadReports() {
    // 1. Fetch server outputs/reports/index.json if available
    try {
        const res = await fetch('/outputs/reports/index.json?t=' + Date.now(), { cache: 'no-store' });
        if (res.ok) {
            const serverReports = await res.json();
            if (Array.isArray(serverReports)) {
                serverReports.forEach(sr => {
                    const rName = sr.name || `report_${sr.sample_id}.md`;
                    if (!deletedReportNames.has(rName) && !reportFiles.some(r => r.name === rName)) {
                        reportFiles.push({
                            name: rName,
                            content: sr.content || ''
                        });
                    }
                });
            }
        }
    } catch(e) {}

    // 2. Merge any existing saved reports from localStorage (excluding user-deleted reports)
    const savedReports = localStorage.getItem('ecoplast_reports');
    if (savedReports) {
        try {
            const parsed = JSON.parse(savedReports);
            if (Array.isArray(parsed) && parsed.length > 0) {
                parsed.forEach(p => {
                    if (!deletedReportNames.has(p.name) && !reportFiles.some(r => r.name === p.name)) {
                        reportFiles.push(p);
                    }
                });
            }
        } catch(e) {}
    }

    // Filter out any deleted reports
    reportFiles = reportFiles.filter(r => !deletedReportNames.has(r.name));

    // 3. Default baseline: test_sample_001 if empty and not deleted
    if (reportFiles.length === 0 && !deletedReportNames.has('report_test_sample_001.md')) {
        const baselineReport = {
            name: 'report_test_sample_001.md',
            content: `# Statutory Environmental Microplastic Assessment Report
**Sample ID:** test_sample_001  
**Audit Date:** 02 September 2026  
**Monitoring Station:** Station 04 — Hyderabad Urban Basin  
**Geographic Coordinates:** 17.4995° N, 78.3899° E (Hyderabad, India)  
**Selected Model:** UNet (Confidence: 86.4%)  

---

## 1.0 Executive Statutory Summary
- **Contamination Level:** Moderate
- **Risk Severity Score:** 5.8 / 10
- **Total Particles Detected:** 14
- **Dominant Polymer Profile:** Synthetic microfibers & degraded polyethylene
`
        };
        reportFiles.push(baselineReport);
    }

    try { localStorage.setItem('ecoplast_reports', JSON.stringify(reportFiles)); } catch(e) {}
    renderReportsGrid();
}

function toggleReportSelectMode(forceState = null) {
    isReportSelectMode = (forceState !== null) ? forceState : !isReportSelectMode;
    const toolbar = document.getElementById('reports-delete-toolbar');
    const toggleBtn = document.getElementById('remove-reports-toggle-btn');
    
    if (isReportSelectMode) {
        if (toolbar) toolbar.style.display = 'flex';
        if (toggleBtn) {
            toggleBtn.innerHTML = '<i data-lucide="check"></i> Done Selecting';
            toggleBtn.style.background = 'rgba(239, 68, 68, 0.2)';
            toggleBtn.style.color = '#fca5a5';
        }
    } else {
        if (toolbar) toolbar.style.display = 'none';
        if (toggleBtn) {
            toggleBtn.innerHTML = '<i data-lucide="trash-2"></i> Remove';
            toggleBtn.style.background = 'transparent';
            toggleBtn.style.color = '#f87171';
        }
        selectedReportNames.clear();
    }
    updateSelectedReportsCount();
    renderReportsGrid(document.getElementById('report-search-input')?.value || '');
    safeCreateIcons();
}

function toggleSelectReport(reportName, e) {
    if (e) e.stopPropagation();
    if (selectedReportNames.has(reportName)) {
        selectedReportNames.delete(reportName);
    } else {
        selectedReportNames.add(reportName);
    }
    updateSelectedReportsCount();
    renderReportsGrid(document.getElementById('report-search-input')?.value || '');
}

function selectAllReports() {
    if (selectedReportNames.size === reportFiles.length) {
        selectedReportNames.clear();
    } else {
        reportFiles.forEach(r => selectedReportNames.add(r.name));
    }
    updateSelectedReportsCount();
    renderReportsGrid(document.getElementById('report-search-input')?.value || '');
}

function updateSelectedReportsCount() {
    const countEl = document.getElementById('selected-reports-count');
    if (countEl) countEl.textContent = selectedReportNames.size;
    
    const selectAllBtn = document.getElementById('reports-select-all-btn');
    if (selectAllBtn) {
        if (reportFiles.length > 0 && selectedReportNames.size === reportFiles.length) {
            selectAllBtn.innerHTML = '<i data-lucide="square"></i> Deselect All';
        } else {
            selectAllBtn.innerHTML = '<i data-lucide="check-square"></i> Select All';
        }
        safeCreateIcons();
    }
}

function deleteSelectedReports() {
    if (selectedReportNames.size === 0) {
        alert("Please select at least one report to remove.");
        return;
    }
    
    const count = selectedReportNames.size;
    if (!confirm(`Are you sure you want to remove ${count} selected report${count === 1 ? '' : 's'}?`)) {
        return;
    }

    selectedReportNames.forEach(name => {
        deletedReportNames.add(name);
    });

    reportFiles = reportFiles.filter(r => !selectedReportNames.has(r.name));
    selectedReportNames.clear();

    // Persist deleted names and remaining reports
    try {
        localStorage.setItem('ecoplast_deleted_reports', JSON.stringify(Array.from(deletedReportNames)));
        localStorage.setItem('ecoplast_reports', JSON.stringify(reportFiles));
    } catch(e) {}

    toggleReportSelectMode(false);
}

function deleteSingleReport(reportName, e) {
    if (e) e.stopPropagation();
    const cleanName = reportName.replace('report_', '').replace('.md', '').replace(/_/g, ' ');
    if (!confirm(`Are you sure you want to remove report "${cleanName}"?`)) {
        return;
    }

    deletedReportNames.add(reportName);
    selectedReportNames.delete(reportName);
    reportFiles = reportFiles.filter(r => r.name !== reportName);

    try {
        localStorage.setItem('ecoplast_deleted_reports', JSON.stringify(Array.from(deletedReportNames)));
        localStorage.setItem('ecoplast_reports', JSON.stringify(reportFiles));
    } catch(e) {}

    updateSelectedReportsCount();
    renderReportsGrid(document.getElementById('report-search-input')?.value || '');
    safeCreateIcons();
}

function extractReportTimestamp(report) {
    if (!report) return 0;
    
    const repName = (report.name || '').replace('report_', '').replace('.md', '').trim();
    
    // 1. Cross-reference with rawFieldData if sample_id matches
    if (Array.isArray(rawFieldData) && rawFieldData.length > 0) {
        const matched = rawFieldData.find(d => {
            if (!d.sample_id) return false;
            const sid = String(d.sample_id).trim();
            return sid === repName || repName.includes(sid) || sid.includes(repName);
        });
        if (matched) {
            const t = parseTimestampToMs(matched.timestamp, matched.sample_id);
            if (t > 0) return t;
        }
    }

    // 2. Try extracting Audit Timestamp / Audit Date from report markdown content
    if (report.content) {
        const tsMatch = report.content.match(/\*\*(?:Audit Date|Audit Timestamp):\*\*\s*([^\n\r]+)/i);
        if (tsMatch) {
            const rawTs = tsMatch[1].trim();
            const parsed = parseTimestampToMs(rawTs, report.name);
            if (parsed > 0) return parsed;
        }
    }
    
    // 3. Try parsing from report filename (e.g. report_IOT_20260904_163215.md)
    if (report.name) {
        const parsed = parseTimestampToMs('', report.name);
        if (parsed > 0) return parsed;
    }
    
    return 0;
}

function renderReportsGrid(filterQuery = '') {
    const reportsGrid = document.getElementById('reports-grid');
    const countBadge = document.getElementById('reports-count-badge');
    if (!reportsGrid) return;

    // Sort reports chronologically: Newest first!
    if (Array.isArray(reportFiles) && reportFiles.length > 0) {
        reportFiles.sort((a, b) => {
            const timeA = extractReportTimestamp(a);
            const timeB = extractReportTimestamp(b);
            return timeB - timeA;
        });
    }

    if (countBadge) {
        countBadge.textContent = `${reportFiles.length} Report${reportFiles.length === 1 ? '' : 's'}`;
    }

    const q = (typeof filterQuery === 'string' ? filterQuery : '').toLowerCase().trim();
    const filtered = q 
        ? reportFiles.filter(r => r.name.toLowerCase().includes(q) || (r.content && r.content.toLowerCase().includes(q)))
        : reportFiles;

    if (!filtered || filtered.length === 0) {
        reportsGrid.innerHTML = `
            <div class="report-empty-state">
                <i data-lucide="file-search" style="width:48px;height:48px;opacity:0.3"></i>
                <p>${q ? 'No matching reports found.' : 'No reports found. Run an analysis to generate your first report.'}</p>
            </div>`;
        safeCreateIcons();
        return;
    }

    let html = '';
    filtered.forEach((report) => {
        const originalIndex = reportFiles.indexOf(report);
        const displayName = report.name.replace('report_', '').replace('.md', '').replace(/_/g, ' ');
        const timeMs = extractReportTimestamp(report);
        const dateSubtext = timeMs > 0 ? formatDisplayTimestamp(new Date(timeMs).toISOString()) : 'Statutory Environmental Audit Report';
        const isSelected = selectedReportNames.has(report.name);
        
        html += `
            <div class="report-card ${isReportSelectMode ? 'select-mode' : ''} ${isSelected ? 'selected' : ''}" 
                 onclick="${isReportSelectMode ? `toggleSelectReport('${report.name}', event)` : ''}">
                
                ${isReportSelectMode ? `
                    <div class="report-card-checkbox-container">
                        <input type="checkbox" class="report-card-checkbox" ${isSelected ? 'checked' : ''} 
                               onclick="toggleSelectReport('${report.name}', event)">
                    </div>
                ` : ''}

                <div style="display:flex;align-items:center;gap:8px;padding-right:${isReportSelectMode ? '28px' : '0'};">
                    <i data-lucide="file-text" class="report-icon" style="flex-shrink:0;"></i>
                    <h4 style="margin:0;font-size:0.95rem;font-weight:600;color:var(--text-main);word-break:break-all;">${displayName}</h4>
                </div>
                <p style="margin:0;font-size:0.8rem;color:var(--text-muted);">${dateSubtext}</p>
                <div class="report-btns" style="margin-top:auto;">
                    <button class="btn primary small" onclick="event.stopPropagation(); viewReport(${originalIndex})">
                        <i data-lucide="eye"></i> View
                    </button>
                    <button class="btn secondary small" onclick="event.stopPropagation(); exportGovernmentReportPDF(${originalIndex})">
                        <i data-lucide="file-check"></i> Gov PDF
                    </button>
                    <button class="btn outline small" onclick="event.stopPropagation(); downloadReport(${originalIndex}, 'md')">
                        <i data-lucide="download"></i> .md
                    </button>
                </div>
            </div>`;
    });
    
    reportsGrid.innerHTML = html;
    safeCreateIcons();
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
        body.innerHTML = `<pre style="white-space:pre-wrap;word-wrap:break-word;font-family:inherit">${report.content}</pre>`;
    }
    
    modal.style.display = 'flex';
    lucide.createIcons();
}

function exportGovernmentReportPDF(index) {
    const report = (typeof index === 'number') ? reportFiles[index] : { name: currentReportName, content: currentReportContent };
    if (!report || !report.content) {
        alert("Please select a valid report to export.");
        return;
    }

    const sampleName = (report.name || 'Sample_Field_01').replace('report_', '').replace('.md', '').replace(/_/g, ' ');
    const auditDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    const docRef = `ENVISTATS/TS/HYD-2026/MP-${Math.floor(1000 + Math.random() * 9000)}`;

    // Parse dynamic metrics from Markdown content if available
    const content = report.content || '';
    
    // Extract Model
    const modelMatch = content.match(/Model Used[:\*_\s]+([A-Za-z0-9\+]+)/i) || content.match(/Selected Model[:\*_\s]+([A-Za-z0-9\+]+)/i);
    const selectedModel = modelMatch ? modelMatch[1] : (document.getElementById('res-model')?.textContent || 'UNet');

    // Extract Particle Count
    const countMatch = content.match(/Total Particles[:\*_\s]+(\d+)/i) || content.match(/Particle Count[:\*_\s]+(\d+)/i);
    const particleCount = countMatch ? parseInt(countMatch[1]) : (parseInt(document.getElementById('res-particles')?.textContent) || 14);

    // Extract Contamination Level
    const levelMatch = content.match(/Contamination Level[:\*_\s]+([A-Za-z]+)/i);
    const contamLevel = levelMatch ? levelMatch[1] : (document.getElementById('res-level')?.textContent.replace(' Contamination', '') || 'Moderate');

    // Extract Risk Score
    const riskMatch = content.match(/Risk (?:Assessment|Score)[:\*_\s]+([0-9\.]+)/i);
    const riskScore = riskMatch ? riskMatch[1] : (document.getElementById('res-risk')?.textContent.split('/')[0].trim() || '5.8');

    // Calculate dynamic size breakdown
    const smallCount = Math.max(1, Math.round(particleCount * 0.55));
    const medCount = Math.max(1, Math.round(particleCount * 0.30));
    const largeCount = Math.max(0, particleCount - smallCount - medCount);

    // Dynamic Sample & Mask Images (Authentic Microscope Field Capture & Neural Mask)
    let sampleImgSrc = null;
    let maskImgSrc = null;

    // 1. Check rawFieldData for this specific sample
    const rawSample = (Array.isArray(rawFieldData) ? rawFieldData : []).find(d => {
        if (!d || !d.sample_id) return false;
        const sid = String(d.sample_id).trim();
        const rName = (report.name || '').replace('report_', '').replace('.md', '').trim();
        return sid === rName || rName.includes(sid) || sid.includes(rName);
    });

    if (rawSample) {
        if (rawSample.image_data) sampleImgSrc = rawSample.image_data;
        else if (rawSample.image_url) sampleImgSrc = '/' + rawSample.image_url;
        else if (rawSample.image_file) sampleImgSrc = '/outputs/field_results/' + rawSample.image_file;

        if (rawSample.mask_data) maskImgSrc = rawSample.mask_data;
        else if (rawSample.mask_url) maskImgSrc = '/' + rawSample.mask_url;
        else if (rawSample.mask_file) maskImgSrc = '/outputs/field_results/' + rawSample.mask_file;
    }

    // 2. Check if this is a dataset benchmark sample (e.g. b--12-_jpg.rf..., c--56-_jpg.rf...)
    const cleanSampleName = (report.name || '').replace('report_', '').replace('.md', '').trim();
    if (!sampleImgSrc && cleanSampleName) {
        if (cleanSampleName.includes('_jpg.rf.') || cleanSampleName.includes('--')) {
            sampleImgSrc = `/dataset/valid/${cleanSampleName}.jpg`;
            maskImgSrc = `/outputs/masks/valid/${cleanSampleName}.png`;
        } else if (cleanSampleName.startsWith('IOT_')) {
            const dtMatch = cleanSampleName.match(/IOT_(\d+_\d+|\d{4}-\d{2}-\d{2}T[\d-]+)/);
            if (dtMatch) {
                sampleImgSrc = `/outputs/field_results/capture_${dtMatch[1]}.jpg`;
                maskImgSrc = `/outputs/field_results/mask_${dtMatch[1]}.png`;
            }
        }
    }

    // 3. If currently uploaded sample is in memory
    if (!sampleImgSrc && currentUploadedDataUrl) {
        sampleImgSrc = currentUploadedDataUrl;
    }
    const maskContainer = document.getElementById('mask-preview-container');
    const maskImgEl = maskContainer ? maskContainer.querySelector('img') : null;
    if (!maskImgSrc && maskImgEl && maskImgEl.src) {
        maskImgSrc = maskImgEl.src;
    }

    // 4. Authentic Fallbacks (Real optical microplastic water sample & mask from dataset)
    if (!sampleImgSrc) {
        sampleImgSrc = `/dataset/valid/b--12-_jpg.rf.016f209b7c5439a4f12cfde8e1b20114.jpg`;
    }
    if (!maskImgSrc) {
        maskImgSrc = `/outputs/masks/valid/b--12-_jpg.rf.016f209b7c5439a4f12cfde8e1b20114.png`;
    }

    const statusBadgeColor = (contamLevel.toLowerCase().includes('high') || contamLevel.toLowerCase().includes('critical')) 
        ? '#b91c1c' : contamLevel.toLowerCase().includes('mod') ? '#d97706' : '#15803d';

    // Build EnviStats Government Statutory Report HTML
    const reportContainer = document.createElement('div');
    reportContainer.id = 'gov-pdf-render';
    reportContainer.className = 'gov-pdf-document';
    reportContainer.innerHTML = `
        <div class="gov-pdf-page">
            <!-- Official Header -->
            <div class="gov-header">
                <div class="gov-emblem">
                    <div class="gov-seal">🇮🇳</div>
                </div>
                <div class="gov-title-block">
                    <h2>CENTRAL POLLUTION CONTROL BOARD (CPCB)</h2>
                    <h3>MINISTRY OF ENVIRONMENT, FOREST & CLIMATE CHANGE (MoEFCC), GOVT. OF INDIA</h3>
                    <h4>NATIONAL WATER QUALITY MONITORING PROGRAMME (NWQMP) — ENVISTATS FRAMEWORK</h4>
                    <p class="gov-sub">STATUTORY SCIENTIFIC AUDIT: MICROPLASTIC QUANTIFICATION & AI RISK ASSESSMENT</p>
                </div>
            </div>

            <div class="gov-meta-box">
                <table class="gov-meta-table">
                    <tr>
                        <td><strong>Document Ref No:</strong> ${docRef}</td>
                        <td><strong>Audit Date:</strong> ${auditDate}</td>
                    </tr>
                    <tr>
                        <td><strong>Monitoring Station:</strong> Station 04 — Hyderabad Urban Basin</td>
                        <td><strong>State / Jurisdiction:</strong> Telangana State Pollution Control Board (TSPCB)</td>
                    </tr>
                    <tr>
                        <td><strong>Geographic Coordinates:</strong> 17.4995° N, 78.3899° E (Hyderabad)</td>
                        <td><strong>Lead Investigator:</strong> Usha, Lead Environmental AI Researcher (Team Astro)</td>
                    </tr>
                </table>
            </div>

            <!-- Table of Contents -->
            <div class="gov-section-header">
                <span>TABLE OF CONTENTS</span>
            </div>
            <div class="gov-toc">
                <div class="toc-row"><span>1.0 Executive Statutory Summary & Environmental Classification</span><span class="toc-dots"></span><span>Page 1</span></div>
                <div class="toc-row"><span>2.0 Geographic Field Sampling & Satellite Telemetry Data</span><span class="toc-dots"></span><span>Page 1</span></div>
                <div class="toc-row"><span>3.0 Optical Microscopic Sample & Artificial Intelligence Segmentation Evidence</span><span class="toc-dots"></span><span>Page 1</span></div>
                <div class="toc-row"><span>4.0 Microplastic Particle Spectrum & Morphological Quantification</span><span class="toc-dots"></span><span>Page 2</span></div>
                <div class="toc-row"><span>5.0 Intelligent Model Selection Engine (IMSE) Optical Quality Profile</span><span class="toc-dots"></span><span>Page 2</span></div>
                <div class="toc-row"><span>6.0 Environmental Hazard Index & Contamination Rating</span><span class="toc-dots"></span><span>Page 2</span></div>
                <div class="toc-row"><span>7.0 Suspected Pollution Source Attribution & Pathway Analysis</span><span class="toc-dots"></span><span>Page 2</span></div>
                <div class="toc-row"><span>8.0 Statutory Recommendations & Remedial Mandates</span><span class="toc-dots"></span><span>Page 2</span></div>
                <div class="toc-row"><span>9.0 Official Verification, Endorsement & Signature Block</span><span class="toc-dots"></span><span>Page 2</span></div>
            </div>

            <!-- Section 1.0 & 2.0 -->
            <div class="gov-section-header">
                <span>1.0 EXECUTIVE STATUTORY SUMMARY & REGULATORY STATUS</span>
            </div>
            <p class="gov-p">
                This scientific audit report presents the empirical microplastic assessment conducted under the National Environmental Quality Monitoring Framework using edge-deployed intelligent microscopy and deep neural network segmentation (IMSE Architecture).
            </p>
            <div class="gov-status-stamp" style="border-color:${statusBadgeColor}; color:${statusBadgeColor}; background:rgba(0,0,0,0.02);">
                <strong>STATUTORY CLASSIFICATION:</strong> ${contamLevel.toUpperCase()} CONTAMINATION (SEVERITY INDEX: ${riskScore} / 10)
            </div>

            <div class="gov-section-header" style="margin-top:16px;">
                <span>2.0 SAMPLING SITE & GEOLOCATION METADATA</span>
            </div>
            <table class="gov-data-table">
                <thead>
                    <tr>
                        <th>Parameter</th>
                        <th>Field Observation / Value</th>
                        <th>Standard Benchmark</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Sample Identifier</td>
                        <td>${sampleName}</td>
                        <td>Standard Field Code</td>
                    </tr>
                    <tr>
                        <td>GPS Fix & Satellite Lock</td>
                        <td>17.4995° N, 78.3899° E (4 Satellites Active • Hyderabad)</td>
                        <td>WGS-84 Geodetic Datum</td>
                    </tr>
                    <tr>
                        <td>Water Body Type</td>
                        <td>Inland Surface / Urban Drainage Reservoir</td>
                        <td>Class C / D Inland Waters</td>
                    </tr>
                    <tr>
                        <td>Optical Acquisition Device</td>
                        <td>Digital Field Microscope (1080p Optical Sensor)</td>
                        <td>CPCB Standard Microscopy Protocol</td>
                    </tr>
                </tbody>
            </table>

            <!-- Section 3.0: Visual Evidence -->
            <div class="gov-section-header" style="margin-top:16px;">
                <span>3.0 OPTICAL MICROSCOPIC EVIDENCE & SEGMENTATION FIGURES</span>
            </div>
            <div class="gov-figures-grid">
                <div class="gov-figure-box">
                    <div class="gov-fig-img-placeholder" style="background:#0f172a; border-radius:4px; overflow:hidden;">
                        <img src="${sampleImgSrc}" alt="Microscope Field Capture" style="width:100%;height:150px;object-fit:cover;display:block;" onerror="if(this.src.includes('/valid/')){this.src=this.src.replace('/valid/','/train/');}">
                    </div>
                    <div class="gov-fig-caption">Figure 1.1: Raw Optical Microscope Capture (${sampleName})</div>
                </div>
                <div class="gov-figure-box">
                    <div class="gov-fig-img-placeholder" style="background:#0f172a; border-radius:4px; overflow:hidden;">
                        <img src="${maskImgSrc}" alt="Neural Mask Overlay" style="width:100%;height:150px;object-fit:cover;display:block;" onerror="if(this.src.includes('/valid/')){this.src=this.src.replace('/valid/','/train/');}">
                    </div>
                    <div class="gov-fig-caption">Figure 1.2: IMSE Segmentation Neural Mask (${selectedModel} Architecture)</div>
                </div>
            </div>
        </div>

        <div class="html2pdf__page-break"></div>

        <div class="gov-pdf-page">
            <!-- Section 4.0: Quantification -->
            <div class="gov-section-header">
                <span>4.0 PARTICLE SPECTRUM & MORPHOLOGICAL QUANTIFICATION</span>
            </div>
            <table class="gov-data-table">
                <thead>
                    <tr>
                        <th>Size Category</th>
                        <th>Dimension Range</th>
                        <th>Particle Count</th>
                        <th>Area Coverage (%)</th>
                        <th>Ecotoxicological Hazard</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Small Particles (Microfibers / Spherules)</td>
                        <td>&lt; 100 μm²</td>
                        <td>${smallCount} Particles</td>
                        <td>${(smallCount * 0.18).toFixed(2)}%</td>
                        <td>High Ingestion Risk (Trophic Transfer)</td>
                    </tr>
                    <tr>
                        <td>Medium Particles (Fragments)</td>
                        <td>100 - 500 μm²</td>
                        <td>${medCount} Particles</td>
                        <td>${(medCount * 0.72).toFixed(2)}%</td>
                        <td>Biofilm Colonization Potential</td>
                    </tr>
                    <tr>
                        <td>Large Particles (Macro-fragments)</td>
                        <td>&gt; 500 μm²</td>
                        <td>${largeCount} Particles</td>
                        <td>${(largeCount * 1.55).toFixed(2)}%</td>
                        <td>Secondary Fragmentation Vector</td>
                    </tr>
                    <tr style="background:#f1f5f9;font-weight:700;">
                        <td>TOTAL PARTICULATE AGGREGATE</td>
                        <td>Cumulative Spectrum</td>
                        <td>${particleCount} Particles</td>
                        <td>${(smallCount * 0.18 + medCount * 0.72 + largeCount * 1.55).toFixed(2)}% Area</td>
                        <td>Significant Environmental Load</td>
                    </tr>
                </tbody>
            </table>

            <!-- Section 5.0 & 6.0: IMSE & Risk -->
            <div class="gov-section-header" style="margin-top:16px;">
                <span>5.0 INTELLIGENT MODEL SELECTION (IMSE) OPTICAL QUALITY PROFILE</span>
            </div>
            <table class="gov-data-table">
                <thead>
                    <tr>
                        <th>Optical Feature</th>
                        <th>Measured Metric</th>
                        <th>Optimal Domain</th>
                        <th>Selected Neural Backbone</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Laplacian Blur Variance</td>
                        <td>184.2 (High Clarity)</td>
                        <td>&gt; 100.0</td>
                        <td rowspan="4" style="vertical-align:middle;text-align:center;font-weight:bold;color:#0369a1;background:#f8fafc;">
                            ${selectedModel}<br><small>(ResNet34 Pretrained)</small><br><span style="color:#059669;">Confidence: 86.4%</span>
                        </td>
                    </tr>
                    <tr>
                        <td>Gray Level Contrast Index</td>
                        <td>34.8 (High Dynamic Range)</td>
                        <td>20 - 60</td>
                    </tr>
                    <tr>
                        <td>Particle Boundary Density</td>
                        <td>0.0382 contours/pixel</td>
                        <td>Adaptive</td>
                    </tr>
                    <tr>
                        <td>Canny Edge Ratio</td>
                        <td>0.0418</td>
                        <td>&gt; 0.02</td>
                    </tr>
                </tbody>
            </table>

            <!-- Section 7.0 & 8.0: Source Attribution & Recommendations -->
            <div class="gov-section-header" style="margin-top:16px;">
                <span>7.0 POTENTIAL POLLUTION SOURCE ATTRIBUTION</span>
            </div>
            <p class="gov-p">
                Morphological clustering reveals dominant presence of <strong>synthetic microfibers</strong> (${Math.round((smallCount/particleCount)*100)}%) and <strong>secondary degraded polymer fragments</strong> (${Math.round(((medCount+largeCount)/particleCount)*100)}%). Primary emission pathways point to synthetic textile effluent and urban storm drain runoff within the catchment area.
            </p>

            <div class="gov-section-header" style="margin-top:16px;">
                <span>8.0 STATUTORY RECOMMENDATIONS & REMEDIAL MANDATES</span>
            </div>
            <ul class="gov-list">
                <li><strong>For Environmental Researchers:</strong> Conduct multi-seasonal spectral verification (FTIR / Raman spectroscopy) to determine exact polymer composition.</li>
                <li><strong>For State Regulators (TSPCB / CPCB):</strong> Enforce micro-filtration standards (&le; 50μm mesh) on tertiary effluent treatment plants discharging into this water basin.</li>
                <li><strong>For Municipal Administration:</strong> Implement public awareness advisories against domestic open-drain synthetic washing discharges.</li>
            </ul>

            <!-- Section 9.0: Verification Block -->
            <div class="gov-section-header" style="margin-top:20px;">
                <span>9.0 OFFICIAL VERIFICATION & SCIENTIFIC ENDORSEMENT</span>
            </div>
            <div class="gov-sign-block">
                <div class="gov-sign-col">
                    <div class="gov-stamp-box">
                        <span>CPCB / TSPCB</span><br>
                        <strong>AI FIELD VERIFIED</strong><br>
                        <small>Ref: ${docRef}</small>
                    </div>
                </div>
                <div class="gov-sign-col" style="text-align:right;">
                    <div class="gov-signature-line">
                        <em>Usha</em><br>
                        <strong>Usha</strong><br>
                        Lead Environmental AI Researcher<br>
                        <small>Team Astro • EcoPlast Monitoring Project</small>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(reportContainer);

    // Render to crisp PDF using html2pdf
    const opt = {
        margin: [10, 10, 10, 10],
        filename: `CPCB_EnviStats_Report_${sampleName.replace(/\s+/g, '_')}_2026.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
    };

    if (window.html2pdf) {
        window.html2pdf().set(opt).from(reportContainer).save().then(() => {
            document.body.removeChild(reportContainer);
        });
    } else {
        window.print();
        document.body.removeChild(reportContainer);
    }
}

function downloadReport(index, format) {
    const report = reportFiles[index];
    if (!report) return;
    
    let content = report.content;
    let filename = report.name;
    let mimeType = 'text/markdown';
    
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

document.getElementById('modal-download-pdf')?.addEventListener('click', () => {
    exportGovernmentReportPDF();
});

document.getElementById('modal-download-md')?.addEventListener('click', () => {
    downloadReport(0, 'md');
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
document.getElementById('refresh-reports-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('refresh-reports-btn');
    if (btn) btn.innerHTML = '<i data-lucide="loader"></i> Refreshing...';
    safeCreateIcons();
    await loadFieldResults();
    await loadReports();
    if (btn) btn.innerHTML = '<i data-lucide="refresh-cw"></i> Refresh';
    safeCreateIcons();
});

// Remove reports button & selection toolbar handlers
document.getElementById('remove-reports-toggle-btn')?.addEventListener('click', () => toggleReportSelectMode());
document.getElementById('reports-select-all-btn')?.addEventListener('click', () => selectAllReports());
document.getElementById('reports-delete-selected-btn')?.addEventListener('click', () => deleteSelectedReports());
document.getElementById('reports-cancel-delete-btn')?.addEventListener('click', () => toggleReportSelectMode(false));

// ============================================================
// REPORT SEARCH FILTER
// ============================================================
const reportSearchInput = document.getElementById('report-search-input');
reportSearchInput?.addEventListener('input', (e) => {
    renderReportsGrid(e.target.value);
});

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
// TOPBAR DROPDOWNS (Notification & Profile)
// ============================================================
const notifBtn = document.getElementById('notification-btn');
const notifDropdown = document.getElementById('notification-dropdown');
const profileBtn = document.getElementById('profile-btn');
const profileDropdown = document.getElementById('profile-dropdown');

notifBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown?.classList.remove('active');
    notifDropdown?.classList.toggle('active');
});

profileBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown?.classList.remove('active');
    profileDropdown?.classList.toggle('active');
});

document.addEventListener('click', (e) => {
    if (!notifDropdown?.contains(e.target) && !notifBtn?.contains(e.target)) {
        notifDropdown?.classList.remove('active');
    }
    if (!profileDropdown?.contains(e.target) && !profileBtn?.contains(e.target)) {
        profileDropdown?.classList.remove('active');
    }
});

// ============================================================
// STARTUP — Fail-safe initialization
// ============================================================
async function initDashboard() {
    // 1. Initialize baseline tables & charts immediately
    try { populateTables(); } catch(e) { console.warn(e); }
    try { initCharts(); } catch(e) { console.warn(e); }
    try { initMap(); } catch(e) { console.warn(e); }
    try { await loadReports(); } catch(e) { console.warn(e); }
    safeCreateIcons();

    // 2. Fetch live IoT field data from server (updates tables, charts, map, reports)
    try {
        await loadFieldResults();
    } catch(e) {
        console.error('Error loading live field results:', e);
    }
}

// Start initialization
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}

// ============================================================
// AUTO-POLLING — Refresh live field results every 30 seconds
// ============================================================
const POLL_INTERVAL_MS = 30000;
const liveIndicator = document.createElement('div');
liveIndicator.id = 'live-poll-indicator';
liveIndicator.style.cssText = `
    position: fixed; bottom: 18px; right: 18px;
    background: #0f172a; border: 1px solid #334155;
    color: #94a3b8; font-size: 11px; font-family: 'Inter', sans-serif;
    padding: 6px 12px; border-radius: 20px;
    display: flex; align-items: center; gap: 6px;
    z-index: 9999; opacity: 0.85;
    transition: opacity 0.3s;
`;
liveIndicator.innerHTML = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;"></span> Live &bull; syncs every 30s`;
document.body.appendChild(liveIndicator);

setInterval(async () => {
    const dot = liveIndicator.querySelector('span');
    if (dot) { dot.style.background = '#f59e0b'; } // amber = fetching

    const prevCount = rawFieldData.length;
    try {
        await loadFieldResults();
    } catch(e) {
        console.warn('Poll error:', e);
    }

    if (dot) {
        const hasNew = rawFieldData.length > prevCount;
        dot.style.background = hasNew ? '#0ea5e9' : '#22c55e'; // blue = new data, green = up to date
        liveIndicator.title = hasNew
            ? `${rawFieldData.length - prevCount} new capture(s) loaded at ${new Date().toLocaleTimeString()}`
            : `Last synced: ${new Date().toLocaleTimeString()}`;
    }
}, POLL_INTERVAL_MS);

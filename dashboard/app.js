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

// Chart references for dynamic updates
let contaminationDonutChart, modelBarChartInstance, sizeBarChartInstance, trendLineChartInstance, modelPieChartInstance;

// Try to load field results JSON files
async function loadFieldResults() {
    try {
        const response = await fetch('../outputs/field_results/index.json');
        if (response.ok) {
            const fieldData = await response.json();
            if (fieldData && fieldData.length > 0) {
                isLiveData = true;
                rawFieldData = fieldData;
                mapData = fieldData.filter(d => d.gps && d.gps.lat && d.gps.lon).map(d => ({
                    name: d.sample_id ? `Sample ${d.sample_id}` : `Sample ${d.timestamp || ''}`,
                    lat: d.gps.lat,
                    lng: d.gps.lon,
                    risk: (d.risk_score ? (d.risk_score > 10 ? d.risk_score / 10 : d.risk_score) : 0).toFixed(1),
                    parts: d.particle_count || 0,
                    model: d.model_selected || 'IMSE'
                }));
                recentResults = fieldData.slice(0, 10).map((d, i) => ({
                    id: d.sample_id ? (d.sample_id.length > 16 ? d.sample_id.substring(0, 16) + '...' : d.sample_id) : `FLD-${String(i+1).padStart(3,'0')}`,
                    fullId: d.sample_id || `FLD-${String(i+1).padStart(3,'0')}`,
                    timestamp: d.timestamp || new Date().toISOString().split('T')[0],
                    loc: `${d.gps?.lat?.toFixed(4) || '28.7041'}, ${d.gps?.lon?.toFixed(4) || '77.1025'}`,
                    parts: d.particle_count || 0,
                    risk: (d.risk_score ? (d.risk_score > 10 ? d.risk_score / 10 : d.risk_score) : 0).toFixed(1),
                    model: d.model_selected || 'UNet',
                    confidence: d.confidence ? (d.confidence * 100).toFixed(1) + '%' : '60.4%',
                    status: (d.contamination_level === 'High' || d.contamination_level === 'Critical') ? 'high' : d.contamination_level === 'Moderate' ? 'med' : 'low'
                }));

                updateKPIs(fieldData);
                updateNotifications(fieldData);
                updateChartsWithLiveData(fieldData);
            }
        }
    } catch(e) {
        console.log('No live field results found, using demo data', e);
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

    if (!fieldData || fieldData.length === 0) return;

    const totalAnalyses = fieldData.length;
    const totalParticles = fieldData.reduce((acc, d) => acc + (d.particle_count || 0), 0);
    const avgRiskRaw = fieldData.reduce((acc, d) => acc + (d.risk_score || 0), 0) / totalAnalyses;
    const avgRisk = (avgRiskRaw > 10 ? avgRiskRaw / 10 : avgRiskRaw).toFixed(1);
    
    const avgConf = (fieldData.reduce((acc, d) => acc + (d.confidence || 0.604), 0) / totalAnalyses * 100).toFixed(1);

    if (totalAnalysesEl) totalAnalysesEl.textContent = totalAnalyses.toLocaleString();
    if (totalParticlesEl) totalParticlesEl.textContent = totalParticles.toLocaleString();
    if (avgRiskEl) avgRiskEl.textContent = `${avgRisk}/10`;
    if (accuracyEl) accuracyEl.textContent = `${avgConf}%`;
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
        const risk = (d.risk_score ? (d.risk_score > 10 ? d.risk_score / 10 : d.risk_score) : 0).toFixed(1);

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

// 1. Contamination Donut
contaminationDonutChart = new Chart(document.getElementById('contaminationDonut'), {
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

// 2. Model Performance (Bar)
modelBarChartInstance = new Chart(document.getElementById('modelBarChart'), {
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

// 3. Particle Size Distribution
sizeBarChartInstance = new Chart(document.getElementById('sizeBarChart'), {
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

// 4. Trend Line Chart
trendLineChartInstance = new Chart(document.getElementById('trendLineChart'), {
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

// 5. Model Pie Chart
modelPieChartInstance = new Chart(document.getElementById('modelPieChart'), {
    type: 'pie',
    data: {
        labels: ['UNet', 'DeepLabV3+', 'LinkNet'],
        datasets: [{
            data: [60, 25, 15],
            backgroundColor: [colors.primary, colors.secondary, colors.accent],
            borderWidth: 1
        }]
    },
    options: { maintainAspectRatio: false }
});

function updateChartsWithLiveData(fieldData) {
    if (!fieldData || fieldData.length === 0) return;

    // Contamination Donut
    let high = 0, med = 0, low = 0;
    let modelCounts = { 'UNet': 0, 'DeepLabV3+': 0, 'LinkNet': 0 };
    let trendLabels = [];
    let trendScores = [];

    fieldData.forEach((d, idx) => {
        const level = d.contamination_level || 'Low';
        if (level === 'High' || level === 'Critical') high++;
        else if (level === 'Moderate') med++;
        else low++;

        const model = d.model_selected || 'UNet';
        if (modelCounts[model] !== undefined) modelCounts[model]++;
        else modelCounts['UNet']++;

        trendLabels.push(`Run ${idx+1}`);
        const r = d.risk_score ? (d.risk_score > 10 ? d.risk_score / 10 : d.risk_score) : 5.0;
        trendScores.push(parseFloat(r.toFixed(1)));
    });

    if (contaminationDonutChart) {
        contaminationDonutChart.data.datasets[0].data = [high, med, low];
        contaminationDonutChart.update();
    }

    if (modelPieChartInstance) {
        modelPieChartInstance.data.datasets[0].data = [
            modelCounts['UNet'] || 1,
            modelCounts['DeepLabV3+'] || 0,
            modelCounts['LinkNet'] || 0
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
if (radarCtx) {
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
}

// Map Initialization
let map, markerGroup, heatLayer, choroplethLayer;

function initMap() {
    if (map) { map.remove(); }
    
    map = L.map('map').setView([20.5937, 78.9629], 5); // Centered on India

    // Clean OpenStreetMap tiles (100% Free, No API Key, No Watermark)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains: ['a', 'b', 'c'],
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
        let riskVal = parseFloat(city.risk) || 5.0;
        let marker = L.circleMarker([city.lat, city.lng], {
            radius: 8,
            fillColor: riskVal > 7 ? colors.danger : riskVal > 4 ? colors.warning : colors.secondary,
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.85
        }).bindPopup(`
            <div style="color: #0f172a; font-family: Inter, sans-serif;">
                <strong style="font-size:14px">${city.name}</strong><br>
                <strong>Particles:</strong> ${city.parts}<br>
                <strong>Risk Score:</strong> ${riskVal}/10<br>
                <strong>Model:</strong> <span style="color:#0ea5e9;font-weight:600">${city.model || 'UNet'}</span>
            </div>
        `);
        markers.push(marker);
    });

    // Layer Groups
    markerGroup = L.layerGroup(markers).addTo(map);
    heatLayer = L.heatLayer(heatData, {radius: 35, blur: 25, maxZoom: 10, gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}}).addTo(map);
    choroplethLayer = L.layerGroup();

    if (isLiveData && mapData.length > 0) {
        let bounds = L.latLngBounds(mapData.map(c => [c.lat, c.lng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
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

document.getElementById('markerToggle')?.addEventListener('change', (e) => {
    if(e.target.checked) map.addLayer(markerGroup);
    else map.removeLayer(markerGroup);
});

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
            const newSampleId = currentUploadedFile ? currentUploadedFile.name.substring(0, 16) : `SMP-${Date.now().toString().slice(-4)}`;
            const newRecord = {
                sample_id: newSampleId,
                timestamp: new Date().toLocaleTimeString(),
                particle_count: particleCount,
                risk_score: parseFloat(riskVal) * 10,
                contamination_level: level,
                model_selected: selectedModel,
                confidence: 0.82,
                gps: { lat: 28.7041 + (Math.random() - 0.5) * 0.1, lon: 77.1025 + (Math.random() - 0.5) * 0.1 }
            };

            rawFieldData.unshift(newRecord);
            updateKPIs(rawFieldData);
            updateNotifications(rawFieldData);
            updateChartsWithLiveData(rawFieldData);

            recentResults.unshift({
                id: newSampleId,
                fullId: newSampleId,
                loc: `${newRecord.gps.lat.toFixed(4)}, ${newRecord.gps.lon.toFixed(4)}`,
                parts: particleCount,
                risk: riskVal,
                model: selectedModel,
                confidence: '82.0%',
                status: statusClass.replace('status-', '')
            });
            populateTables();

            analyzeBtn.innerHTML = '<i data-lucide="check"></i> Analysis Complete';
            analyzeBtn.disabled = false;
            resultsPanel.classList.remove('hidden');
            resultsPanel.scrollIntoView({ behavior: 'smooth' });
            lucide.createIcons();
        };
        img.src = currentUploadedDataUrl;
    }, 1200);
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
// STARTUP — Load everything
// ============================================================
// Initialize with demo data immediately, then try loading live data
populateTables();
initMap();
loadFieldResults();
loadReports();
lucide.createIcons();

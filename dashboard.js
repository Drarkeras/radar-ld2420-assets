/**
 * dashboard.js - Frontend Asíncrono para el ESP32 + HLK-LD2420
 * Alojar en CDN externo (ej. jsDelivr / GitHub Pages)
 */
let currentTab = 'sensor';
let radarData = null;
let pollTimer = null;

const TOTAL_GATES = 16;
const GATE_SIZE_M = 0.70;

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    radarData = await res.json();
    renderLiveStatus();
  } catch (err) {
    console.error('Error fetching status:', err);
    document.getElementById('statusBadge').className = 'badge bg-danger fs-6';
    document.getElementById('statusBadge').innerText = 'Desconectado';
  }
}

function renderLiveStatus() {
  if (!radarData) return;
  
  document.getElementById('headerDeviceName').innerText = radarData.deviceName || 'ESP32 Radar';
  const badge = document.getElementById('statusBadge');
  
  let stateText = radarData.state;
  let bgClass = 'bg-info';
  
  if (radarData.state === 'WAIT_CALIB_30S') {
    stateText = 'Esperando despeje (' + radarData.timeRemainingSec + 's)';
    bgClass = 'bg-warning text-dark';
  } else if (radarData.state === 'CALIBRATING_10S') {
    stateText = 'Muestreando base (' + radarData.timeRemainingSec + 's)';
    bgClass = 'bg-primary';
  } else if (radarData.state === 'MONITORING_5S') {
    stateText = 'Monitoreo Activo (5s)';
    bgClass = 'bg-success';
  } else if (radarData.state === 'VERIFYING_1S') {
    stateText = 'Verificando anomalía (' + radarData.verifyCounter + '/3)';
    bgClass = 'bg-danger animate-pulse';
  } else if (radarData.state === 'COOLDOWN_15S') {
    stateText = 'Alerta / Cooldown (' + radarData.timeRemainingSec + 's)';
    bgClass = 'bg-danger';
  } else if (radarData.state === 'BURST_SNOOZE') {
    stateText = 'Silenciado (' + radarData.timeRemainingSec + 's)';
    bgClass = 'bg-secondary';
  }
  
  badge.className = 'badge fs-6 ' + bgClass;
  badge.innerText = stateText;

  if (currentTab === 'sensor') {
    updateGatesVisual();
  }
}

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tab-sensor').classList.toggle('active', tab === 'sensor');
  document.getElementById('tab-general').classList.toggle('active', tab === 'general');
  
  const container = document.getElementById('tabContent');
  if (tab === 'sensor') {
    renderSensorTab(container);
  } else {
    renderGeneralTab(container);
  }
}

function renderSensorTab(container) {
  container.innerHTML = `
    <div class="card bg-secondary bg-opacity-10 border-secondary mb-4">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h5 class="m-0">Pestaña 1: Segmentación de Puertas de Detección (Gates 0 - 15)</h5>
        <button class="btn btn-sm btn-outline-warning" onclick="triggerCalibrate()">
          🔄 Recalibrar Fondo
        </button>
      </div>
      <div class="card-body">
        <p class="small text-muted mb-3">
          Cada tramo representa 0.70 metros (hasta 11.2m). Haga clic en cualquier tramo para excluirlo de la detección.
        </p>

        <!-- Barra continua de 16 Gates -->
        <div class="radar-gates-track d-flex gap-1 mb-3" id="gatesTrack"></div>

        <!-- Leyenda -->
        <div class="d-flex flex-wrap gap-3 small text-muted mb-4">
          <div class="d-flex align-items-center gap-1">
            <span class="legend-box gate-calibrated"></span> Tramo Calibrado (Base)
          </div>
          <div class="d-flex align-items-center gap-1">
            <span class="legend-box gate-detected"></span> Presencia Actual
          </div>
          <div class="d-flex align-items-center gap-1">
            <span class="legend-box gate-excluded"></span> Tramo Excluido (Mudo)
          </div>
        </div>

        <hr class="border-secondary my-4">

        <h6 class="fw-bold mb-3">Parámetros de Lectura y Temporización</h6>
        <form id="sensorForm" onsubmit="saveSensorConfig(event)">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label small">Frecuencia de Escaneo (segundos)</label>
              <input type="number" class="form-control bg-dark text-light border-secondary" id="scanSec" value="5" min="1" max="60">
              <div class="form-text text-muted">Tiempo entre lecturas en reposo.</div>
            </div>
            <div class="col-md-4">
              <label class="form-label small">Cooldown de Notificación (segundos)</label>
              <input type="number" class="form-control bg-dark text-light border-secondary" id="coolSec" value="15" min="5" max="120">
              <div class="form-text text-muted">Mínimo entre alertas continuas.</div>
            </div>
            <div class="col-md-4">
              <label class="form-label small">Tolerancia de Anomalía (± cm)</label>
              <input type="number" class="form-control bg-dark text-light border-secondary" id="tolCm" value="25" min="5" max="100">
              <div class="form-text text-muted">Variación mínima respecto al fondo.</div>
            </div>
          </div>

          <div class="card bg-dark border-secondary p-3 mt-4">
            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" id="snoozeEn" onchange="toggleSnoozeFields()">
              <label class="form-check-label fw-semibold" for="snoozeEn">
                Dejar de notificar temporalmente tras actividad continua (Burst Snooze)
              </label>
            </div>
            <div class="row g-3" id="snoozeFields" style="display:none;">
              <div class="col-md-6">
                <label class="form-label small">Alertas continuas antes de silenciar</label>
                <input type="number" class="form-control bg-secondary bg-opacity-25 text-light border-secondary" id="snzCount" value="6" min="2" max="20">
              </div>
              <div class="col-md-6">
                <label class="form-label small">Tiempo de silenciado (segundos)</label>
                <input type="number" class="form-control bg-secondary bg-opacity-25 text-light border-secondary" id="snzSec" value="300" min="30" max="3600">
              </div>
            </div>
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-primary px-4">Guardar Ajustes de Sensor</button>
          </div>
        </form>
      </div>
    </div>
  `;
  updateGatesVisual();
  loadConfigIntoFields();
}

function updateGatesVisual() {
  const track = document.getElementById('gatesTrack');
  if (!track || !radarData) return;
  
  let html = '';
  for (let g = 0; g < TOTAL_GATES; g++) {
    const isExcluded = radarData.excludedGates ? radarData.excludedGates[g] : false;
    const isCalibrated = (radarData.baselineGate === g);
    const isCurrent = (radarData.currentGate === g && radarData.currentDistanceCm > 0);
    
    let classes = ['gate-cell'];
    if (isExcluded) classes.push('gate-excluded');
    if (isCalibrated) classes.push('gate-calibrated');
    if (isCurrent) classes.push('gate-detected');

    const distStart = (g * GATE_SIZE_M).toFixed(1);
    const distEnd = ((g + 1) * GATE_SIZE_M).toFixed(1);

    html += `
      <div class="${classes.join(' ')}" onclick="toggleGate(${g})" title="Gate ${g} (${distStart}m - ${distEnd}m)">
        <div class="gate-num">G${g}</div>
        <div class="gate-range">${distStart}-${distEnd}m</div>
        ${isCalibrated ? '<span class="badge-dot dot-calib" title="Base Calibrada"></span>' : ''}
        ${isCurrent ? '<span class="badge-dot dot-detect" title="Detectado"></span>' : ''}
        ${isExcluded ? '<span class="gate-cross">✕</span>' : ''}
      </div>
    `;
  }
  track.innerHTML = html;
}

function toggleGate(gateIndex) {
  if (!radarData || !radarData.excludedGates) return;
  radarData.excludedGates[gateIndex] = !radarData.excludedGates[gateIndex];
  
  // Calcular nueva máscara
  let mask = 0;
  for (let i = 0; i < TOTAL_GATES; i++) {
    if (radarData.excludedGates[i]) mask |= (1 << i);
  }
  radarData.excludedMask = mask;
  updateGatesVisual();
}

function toggleSnoozeFields() {
  const enabled = document.getElementById('snoozeEn').checked;
  document.getElementById('snoozeFields').style.display = enabled ? 'flex' : 'none';
}

async function loadConfigIntoFields() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    if (document.getElementById('scanSec')) document.getElementById('scanSec').value = cfg.scanIntervalSec || 5;
    if (document.getElementById('coolSec')) document.getElementById('coolSec').value = cfg.minNotifyCooldownSec || 15;
    if (document.getElementById('tolCm')) document.getElementById('tolCm').value = cfg.anomalyToleranceCm || 25;
    if (document.getElementById('snoozeEn')) {
      document.getElementById('snoozeEn').checked = !!cfg.enableBurstSnooze;
      toggleSnoozeFields();
    }
    if (document.getElementById('snzCount')) document.getElementById('snzCount').value = cfg.burstAlertCount || 6;
    if (document.getElementById('snzSec')) document.getElementById('snzSec').value = cfg.burstSnoozeSec || 300;
  } catch (e) {
    console.error('Error loading config', e);
  }
}

async function saveSensorConfig(e) {
  e.preventDefault();
  const params = new URLSearchParams();
  params.append('scanSec', document.getElementById('scanSec').value);
  params.append('coolSec', document.getElementById('coolSec').value);
  params.append('tolCm', document.getElementById('tolCm').value);
  params.append('exMask', radarData ? radarData.excludedMask : 0);
  params.append('snoozeEn', document.getElementById('snoozeEn').checked ? '1' : '0');
  params.append('snzCount', document.getElementById('snzCount').value);
  params.append('snzSec', document.getElementById('snzSec').value);

  const res = await fetch('/api/save', { method: 'POST', body: params });
  const text = await res.text();
  alert(text);
}

function renderGeneralTab(container) {
  container.innerHTML = `
    <div class="card bg-secondary bg-opacity-10 border-secondary">
      <div class="card-header">
        <h5 class="m-0">Pestaña 2: Ajustes Generales, Red y Telegram</h5>
      </div>
      <div class="card-body">
        <form onsubmit="saveGeneralConfig(event)">
          <div class="mb-3">
            <label class="form-label">Nombre del Dispositivo</label>
            <input type="text" class="form-control bg-dark text-light border-secondary" id="genDevName" required>
          </div>
          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <label class="form-label">SSID Wi-Fi</label>
              <input type="text" class="form-control bg-dark text-light border-secondary" id="genSsid" required>
            </div>
            <div class="col-md-6">
              <label class="form-label">Contraseña Wi-Fi</label>
              <input type="password" class="form-control bg-dark text-light border-secondary" id="genPass" value="******">
              <div class="form-text text-muted">Mantenga '******' si no desea modificarla.</div>
            </div>
          </div>
          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <label class="form-label">Telegram Bot Token</label>
              <input type="password" class="form-control bg-dark text-light border-secondary" id="genTgToken" value="******">
            </div>
            <div class="col-md-6">
              <label class="form-label">Telegram Chat ID</label>
              <input type="text" class="form-control bg-dark text-light border-secondary" id="genTgChat" value="******">
            </div>
          </div>
          <div class="mb-4">
            <label class="form-label">URL del Servidor de Actualizaciones (version.json)</label>
            <input type="text" class="form-control bg-dark text-light border-secondary" id="genOtaUrl">
          </div>
          <button type="submit" class="btn btn-danger px-4">Guardar y Reiniciar ESP32</button>
        </form>
      </div>
    </div>
  `;
  loadGeneralConfig();
}

async function loadGeneralConfig() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    document.getElementById('genDevName').value = cfg.deviceName || '';
    document.getElementById('genSsid').value = cfg.wifiSsid || '';
    document.getElementById('genOtaUrl').value = cfg.otaServerUrl || '';
  } catch (e) {
    console.error(e);
  }
}

async function saveGeneralConfig(e) {
  e.preventDefault();
  if (!confirm('El dispositivo guardará los datos y se reiniciará. ¿Desea continuar?')) return;
  const params = new URLSearchParams();
  params.append('devName', document.getElementById('genDevName').value);
  params.append('ssid', document.getElementById('genSsid').value);
  params.append('pass', document.getElementById('genPass').value);
  params.append('tgToken', document.getElementById('genTgToken').value);
  params.append('tgChat', document.getElementById('genTgChat').value);
  params.append('otaUrl', document.getElementById('genOtaUrl').value);

  const res = await fetch('/api/save', { method: 'POST', body: params });
  const text = await res.text();
  alert(text);
}

async function triggerCalibrate() {
  if (!confirm('¿Iniciar nueva calibración de fondo? Asegúrese de despejar la habitación.')) return;
  await fetch('/api/calibrate', { method: 'POST' });
}

// Iniciar sondeo
switchTab('sensor');
fetchStatus();
pollTimer = setInterval(fetchStatus, 2000);

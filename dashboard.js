/**
 * dashboard.js - Frontend Asíncrono para el ESP32 + HLK-LD2420
 * Alojar en CDN externo (ej. jsDelivr / GitHub Pages)
 */
let currentTab = 'sensor';
let radarData = null;
let pollTimer = null;

const TOTAL_GATES = 16;
const GATE_SIZE_M = 0.70;
const UI_TEXT = {
  es: {
    disconnected: 'Desconectado',
    reconnecting: 'Reconectando...',
    waitingClear: 'Esperando despeje',
    samplingBase: 'Muestreando base',
    monitoringActive: 'Monitoreo Activo',
    verifyingAnomaly: 'Verificando anomalía',
    alertCooldown: 'Alerta / Cooldown',
    snoozed: 'Silenciado',
    version: 'Versión',
    language: 'Idioma',
    sensorTabTitle: 'Pestaña 1: Segmentación de Puertas de Detección (Gates 0 - 15)',
    sensorIntro: 'Cada tramo representa 0.70 metros (hasta 11.2m). Haga clic en cualquier tramo para excluirlo de la detección.',
    sensorLegendBase: 'Tramo Calibrado (Base)',
    sensorLegendDetected: 'Presencia Actual',
    sensorLegendExcluded: 'Tramo Excluido (Mudo)',
    sensorParams: 'Parámetros de Lectura y Temporización',
    scanLabel: 'Frecuencia de Escaneo (segundos)',
    scanHint: 'Tiempo entre lecturas en reposo.',
    cooldownLabel: 'Cooldown de Notificación (segundos)',
    cooldownHint: 'Mínimo entre alertas continuas.',
    toleranceLabel: 'Tolerancia de Anomalía (± cm)',
    toleranceHint: 'Variación mínima respecto al fondo.',
    snoozeToggle: 'Dejar de notificar temporalmente tras actividad continua (Burst Snooze)',
    snoozeAlertCount: 'Alertas continuas antes de silenciar',
    snoozeSeconds: 'Tiempo de silenciado (segundos)',
    saveSensor: 'Guardar Ajustes de Sensor',
    saveGeneral: 'Guardar y Reiniciar ESP32',
    generalTitle: 'Pestaña 2: Ajustes Generales, Red y Telegram',
    deviceNameLabel: 'Nombre del Dispositivo',
    wifiSsidLabel: 'SSID Wi‑Fi',
    wifiPasswordLabel: 'Contraseña Wi‑Fi',
    wifiPasswordHint: 'Mantenga \'******\' si no desea modificarla.',
    telegramTokenLabel: 'Telegram Bot Token',
    telegramChatLabel: 'Telegram Chat ID',
    otaUrlLabel: 'URL del Servidor de Actualizaciones (version.json)',
    otaAutoCheck: 'Buscar actualizaciones automáticamente',
    otaIntervalLabel: 'Intervalo entre comprobaciones (segundos)',
    checkUpdateNow: 'Comprobar ahora',
    updateLogTitle: 'Registro de actualizaciones',
    updateLogHint: 'Eventos desde la última actualización correcta.',
    noUpdateLogs: 'Sin eventos todavía.',
    confirmReboot: 'El dispositivo guardará los datos y se reiniciará. ¿Desea continuar?',
    confirmCalibrate: '¿Iniciar nueva calibración de fondo? Asegúrese de despejar la habitación.',
    triggerCalibrate: '🔄 Recalibrar Fondo',
    languageButton: 'EN',
    languageSwitch: 'ES',
    toggleGate: 'Gate'
  },
  en: {
    disconnected: 'Disconnected',
    reconnecting: 'Reconnecting...',
    waitingClear: 'Waiting for room to clear',
    samplingBase: 'Sampling baseline',
    monitoringActive: 'Monitoring Active',
    verifyingAnomaly: 'Verifying anomaly',
    alertCooldown: 'Alert / Cooldown',
    snoozed: 'Snoozed',
    version: 'Version',
    language: 'Language',
    sensorTabTitle: 'Tab 1: Detection Gate Segmentation (Gates 0 - 15)',
    sensorIntro: 'Each segment represents 0.70 meters (up to 11.2m). Click any segment to exclude it from detection.',
    sensorLegendBase: 'Calibrated Segment (Baseline)',
    sensorLegendDetected: 'Current Presence',
    sensorLegendExcluded: 'Muted Segment',
    sensorParams: 'Read and Timing Parameters',
    scanLabel: 'Scan Frequency (seconds)',
    scanHint: 'Time between readings in standby.',
    cooldownLabel: 'Notification Cooldown (seconds)',
    cooldownHint: 'Minimum time between continuous alerts.',
    toleranceLabel: 'Anomaly Tolerance (± cm)',
    toleranceHint: 'Minimum variation from the background.',
    snoozeToggle: 'Stop notifying temporarily after continuous activity (Burst Snooze)',
    snoozeAlertCount: 'Continuous alerts before muting',
    snoozeSeconds: 'Muted time (seconds)',
    saveSensor: 'Save Sensor Settings',
    saveGeneral: 'Save and Reboot ESP32',
    generalTitle: 'Tab 2: General Settings, Network and Telegram',
    deviceNameLabel: 'Device Name',
    wifiSsidLabel: 'Wi‑Fi SSID',
    wifiPasswordLabel: 'Wi‑Fi Password',
    wifiPasswordHint: 'Keep \'******\' if you do not want to change it.',
    telegramTokenLabel: 'Telegram Bot Token',
    telegramChatLabel: 'Telegram Chat ID',
    otaUrlLabel: 'Update Server URL (version.json)',
    otaAutoCheck: 'Search for updates automatically',
    otaIntervalLabel: 'Check interval (seconds)',
    checkUpdateNow: 'Check now',
    updateLogTitle: 'Update log',
    updateLogHint: 'Events since the last successful update.',
    noUpdateLogs: 'No events yet.',
    confirmReboot: 'The device will save the data and reboot. Continue?',
    confirmCalibrate: 'Start a new background calibration? Make sure the room is clear.',
    triggerCalibrate: '🔄 Recalibrate baseline',
    languageButton: 'ES',
    languageSwitch: 'EN',
    toggleGate: 'Gate'
  }
};
let currentLanguage = 'es';

function getText(key) {
  return UI_TEXT[currentLanguage][key] || key;
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    radarData = await res.json();
    if (radarData && typeof radarData.language !== 'undefined') {
      const serverLang = radarData.language === 1 ? 'en' : 'es';
      if (serverLang !== currentLanguage) {
        currentLanguage = serverLang;
        applyLanguage(currentLanguage);
      }
    }
    renderLiveStatus();
  } catch (err) {
    console.error('Error fetching status:', err);
    document.getElementById('statusBadge').className = 'badge bg-danger fs-6';
    document.getElementById('statusBadge').innerText = getText('disconnected');
  }
}

function applyLanguage(lang) {
  currentLanguage = lang === 'en' ? 'en' : 'es';
  const toggle = document.getElementById('languageToggle');
  if (toggle) {
    toggle.textContent = getText('languageButton');
    toggle.title = getText('language');
  }
  const versionBadge = document.getElementById('firmwareVersionBadge');
  if (versionBadge && radarData && radarData.firmwareVersion) {
    versionBadge.textContent = 'v' + radarData.firmwareVersion;
  }
  const tabContent = document.getElementById('tabContent');
  if (currentTab && tabContent) {
    switchTab(currentTab);
  }
}

function renderLiveStatus() {
  if (!radarData) return;
   
  document.getElementById('headerDeviceName').innerText = radarData.deviceName || 'ESP32 Radar';
  const badge = document.getElementById('statusBadge');
  const versionBadge = document.getElementById('firmwareVersionBadge');
  if (versionBadge && radarData.firmwareVersion) {
    versionBadge.textContent = 'v' + radarData.firmwareVersion;
  }
  
  let stateText = radarData.state;
  let bgClass = 'bg-info';
   
  if (radarData.state === 'WAIT_CALIB_30S') {
    stateText = getText('waitingClear') + ' (' + radarData.timeRemainingSec + 's)';
    bgClass = 'bg-warning text-dark';
  } else if (radarData.state === 'CALIBRATING_10S') {
    stateText = getText('samplingBase') + ' (' + radarData.timeRemainingSec + 's)';
    bgClass = 'bg-primary';
  } else if (radarData.state === 'MONITORING_5S') {
    stateText = getText('monitoringActive') + ' (5s)';
    bgClass = 'bg-success';
  } else if (radarData.state === 'VERIFYING_1S') {
    stateText = getText('verifyingAnomaly') + ' (' + radarData.verifyCounter + '/3)';
    bgClass = 'bg-danger animate-pulse';
  } else if (radarData.state === 'COOLDOWN_15S') {
    stateText = getText('alertCooldown') + ' (' + radarData.timeRemainingSec + 's)';
    bgClass = 'bg-danger';
  } else if (radarData.state === 'BURST_SNOOZE') {
    stateText = getText('snoozed') + ' (' + radarData.timeRemainingSec + 's)';
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
  const t = UI_TEXT[currentLanguage];
  container.innerHTML = `
    <div class="card bg-secondary bg-opacity-10 border-secondary mb-4">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h5 class="m-0">${t.sensorTabTitle}</h5>
        <button class="btn btn-sm btn-outline-warning" onclick="triggerCalibrate()">
          ${t.triggerCalibrate}
        </button>
      </div>
      <div class="card-body">
        <p class="small text-muted mb-3">
          ${t.sensorIntro}
        </p>

        <div class="radar-gates-track d-flex gap-1 mb-3" id="gatesTrack"></div>

        <div class="d-flex flex-wrap gap-3 small text-muted mb-4">
          <div class="d-flex align-items-center gap-1">
            <span class="legend-box gate-calibrated"></span> ${t.sensorLegendBase}
          </div>
          <div class="d-flex align-items-center gap-1">
            <span class="legend-box gate-detected"></span> ${t.sensorLegendDetected}
          </div>
          <div class="d-flex align-items-center gap-1">
            <span class="legend-box gate-excluded"></span> ${t.sensorLegendExcluded}
          </div>
        </div>

        <hr class="border-secondary my-4">

        <h6 class="fw-bold mb-3">${t.sensorParams}</h6>
        <form id="sensorForm" onsubmit="saveSensorConfig(event)">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label small">${t.scanLabel}</label>
              <input type="number" class="form-control bg-dark text-light border-secondary" id="scanSec" value="5" min="1" max="60">
              <div class="form-text text-muted">${t.scanHint}</div>
            </div>
            <div class="col-md-4">
              <label class="form-label small">${t.cooldownLabel}</label>
              <input type="number" class="form-control bg-dark text-light border-secondary" id="coolSec" value="15" min="5" max="120">
              <div class="form-text text-muted">${t.cooldownHint}</div>
            </div>
            <div class="col-md-4">
              <label class="form-label small">${t.toleranceLabel}</label>
              <input type="number" class="form-control bg-dark text-light border-secondary" id="tolCm" value="25" min="5" max="100">
              <div class="form-text text-muted">${t.toleranceHint}</div>
            </div>
          </div>

          <div class="card bg-dark border-secondary p-3 mt-4">
            <div class="form-check form-switch mb-2">
              <input class="form-check-input" type="checkbox" id="snoozeEn" onchange="toggleSnoozeFields()">
              <label class="form-check-label fw-semibold" for="snoozeEn">
                ${t.snoozeToggle}
              </label>
            </div>
            <div class="row g-3" id="snoozeFields" style="display:none;">
              <div class="col-md-6">
                <label class="form-label small">${t.snoozeAlertCount}</label>
                <input type="number" class="form-control bg-secondary bg-opacity-25 text-light border-secondary" id="snzCount" value="6" min="2" max="20">
              </div>
              <div class="col-md-6">
                <label class="form-label small">${t.snoozeSeconds}</label>
                <input type="number" class="form-control bg-secondary bg-opacity-25 text-light border-secondary" id="snzSec" value="300" min="30" max="3600">
              </div>
            </div>
          </div>

          <div class="mt-4">
            <button type="submit" class="btn btn-primary px-4">${t.saveSensor}</button>
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

  let mask = 0;
  for (let i = 0; i < TOTAL_GATES; i++) {
    if (radarData.excludedGates[i]) mask |= (1 << i);
  }
  radarData.excludedMask = mask;
  updateGatesVisual();
  persistGateMask(mask);
}

async function persistGateMask(mask) {
  try {
    const params = new URLSearchParams();
    params.append('exMask', String(mask));
    await fetch('/api/gates', { method: 'POST', body: params });
  } catch (err) {
    console.error('Error saving gate mute state:', err);
  }
}

function toggleSnoozeFields() {
  const enabled = document.getElementById('snoozeEn').checked;
  document.getElementById('snoozeFields').style.display = enabled ? 'flex' : 'none';
}

async function loadConfigIntoFields() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    if (typeof cfg.language !== 'undefined') {
      currentLanguage = cfg.language === 1 ? 'en' : 'es';
    }
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
  params.append('lang', currentLanguage === 'en' ? 'en' : 'es');
  params.append('snoozeEn', document.getElementById('snoozeEn').checked ? '1' : '0');
  params.append('snzCount', document.getElementById('snzCount').value);
  params.append('snzSec', document.getElementById('snzSec').value);

  const res = await fetch('/api/save', { method: 'POST', body: params });
  const text = await res.text();
  alert(text);
}

function renderGeneralTab(container) {
  const t = UI_TEXT[currentLanguage];
  container.innerHTML = `
    <div class="card bg-secondary bg-opacity-10 border-secondary">
      <div class="card-header">
        <h5 class="m-0">${t.generalTitle}</h5>
      </div>
      <div class="card-body">
        <form onsubmit="saveGeneralConfig(event)">
          <div class="mb-3">
            <label class="form-label">${t.deviceNameLabel}</label>
            <input type="text" class="form-control bg-dark text-light border-secondary" id="genDevName" required>
          </div>
          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <label class="form-label">${t.wifiSsidLabel}</label>
              <input type="text" class="form-control bg-dark text-light border-secondary" id="genSsid" required>
            </div>
            <div class="col-md-6">
              <label class="form-label">${t.wifiPasswordLabel}</label>
              <input type="password" class="form-control bg-dark text-light border-secondary" id="genPass" value="******">
              <div class="form-text text-muted">${t.wifiPasswordHint}</div>
            </div>
          </div>
          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <label class="form-label">${t.telegramTokenLabel}</label>
              <input type="password" class="form-control bg-dark text-light border-secondary" id="genTgToken" value="******">
            </div>
            <div class="col-md-6">
              <label class="form-label">${t.telegramChatLabel}</label>
            <input type="text" class="form-control bg-dark text-light border-secondary" id="genTgChat" value="">
            </div>
          </div>
        <div class="mb-3">
            <label class="form-label">${t.otaUrlLabel}</label>
            <input type="text" class="form-control bg-dark text-light border-secondary" id="genOtaUrl">
          </div>
        <div class="row g-3 mb-3">
          <div class="col-md-6">
            <div class="form-check form-switch mt-2">
              <input class="form-check-input" type="checkbox" id="otaAutoCheck">
              <label class="form-check-label" for="otaAutoCheck">${t.otaAutoCheck}</label>
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label">${t.otaIntervalLabel}</label>
            <input type="number" min="300" step="60" class="form-control bg-dark text-light border-secondary" id="otaIntervalSec">
          </div>
        </div>
        <div class="d-flex gap-2 mb-4">
          <button type="submit" class="btn btn-danger px-4">${t.saveGeneral}</button>
          <button type="button" class="btn btn-outline-warning" onclick="checkForUpdatesNow()">${t.checkUpdateNow}</button>
        </div>
      </form>

      <div class="card bg-dark border-secondary mt-3">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h6 class="m-0">${t.updateLogTitle}</h6>
          <span class="badge bg-light text-dark" id="otaStatusBadge">OK</span>
        </div>
        <div class="card-body">
          <small class="text-muted d-block mb-2">${t.updateLogHint}</small>
          <div id="otaLogList" class="small text-light"></div>
        </div>
      </div>
    </div>
  </div>
  `;
  loadGeneralConfig();
  loadOtaLog();
}

async function loadGeneralConfig() {
  try {
  const res = await fetch('/api/config');
  const cfg = await res.json();
  document.getElementById('genDevName').value = cfg.deviceName || '';
  document.getElementById('genSsid').value = cfg.wifiSsid || '';
  document.getElementById('genOtaUrl').value = cfg.otaServerUrl || '';
  document.getElementById('genTgChat').value = cfg.telegramChatId || '';
  const autoCheck = document.getElementById('otaAutoCheck');
  if (autoCheck) autoCheck.checked = !!cfg.otaAutoCheckEnabled;
  const interval = document.getElementById('otaIntervalSec');
  if (interval) interval.value = cfg.otaCheckIntervalSec || 86400;
  } catch (e) {
  console.error(e);
  }
}

async function loadOtaLog() {
  try {
  const res = await fetch('/api/updates');
  const data = await res.json();
  const container = document.getElementById('otaLogList');
  if (!container) return;
  const entries = Array.isArray(data.log) ? data.log : [];
  container.innerHTML = entries.length ? entries.map(item => `<div class="border-bottom border-secondary pb-1 mb-1">${item}</div>`).join('') : `<div class="text-muted">${getText('noUpdateLogs')}</div>`;
  const badge = document.getElementById('otaStatusBadge');
  if (badge) {
    badge.className = 'badge ' + (data.lastSuccessfulVersion ? 'bg-success text-dark' : 'bg-secondary');
    badge.textContent = data.lastSuccessfulVersion ? 'v' + data.lastSuccessfulVersion : 'N/A';
  }
  } catch (e) {
  console.error('Error loading OTA log:', e);
  }
}

async function checkForUpdatesNow() {
  try {
  const res = await fetch('/api/check-update', { method: 'POST' });
  const data = await res.json();
  await loadOtaLog();
  alert(data.updated ? 'Actualización aplicada correctamente.' : 'Comprobación finalizada sin nueva actualización.');
  } catch (e) {
  console.error('OTA manual check failed:', e);
  alert('No se pudo comprobar la actualización.');
  }
}

async function saveGeneralConfig(e) {
  e.preventDefault();
  if (!confirm(getText('confirmReboot'))) return;
  const params = new URLSearchParams();
  params.append('devName', document.getElementById('genDevName').value);
  params.append('ssid', document.getElementById('genSsid').value);
  params.append('pass', document.getElementById('genPass').value);
  params.append('tgToken', document.getElementById('genTgToken').value);
  params.append('tgChat', document.getElementById('genTgChat').value);
  params.append('otaUrl', document.getElementById('genOtaUrl').value);
  params.append('otaAuto', document.getElementById('otaAutoCheck').checked ? '1' : '0');
  params.append('otaInt', document.getElementById('otaIntervalSec').value || 86400);
  params.append('lang', currentLanguage === 'en' ? 'en' : 'es');

  const res = await fetch('/api/save', { method: 'POST', body: params });
  const text = await res.text();
  alert(text);
}

async function triggerCalibrate() {
  if (!confirm(getText('confirmCalibrate'))) return;
  await fetch('/api/calibrate', { method: 'POST' });
}

const languageToggle = document.getElementById('languageToggle');
if (languageToggle) {
  languageToggle.addEventListener('click', () => {
    const nextLang = currentLanguage === 'en' ? 'es' : 'en';
    currentLanguage = nextLang;
    applyLanguage(nextLang);
    const params = new URLSearchParams();
    params.append('lang', nextLang);
    fetch('/api/language', { method: 'POST', body: params }).catch(err => console.error('Language persist failed', err));
  });
}

// Iniciar sondeo
switchTab('sensor');
fetchStatus();
pollTimer = setInterval(fetchStatus, 2000);

import { useEffect, useMemo, useState } from "react";

const API_URL = "http://localhost:4000";

const postJson = async (path, payload) => {
  await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

function LineChart({ values, color, yLabel, xLabel, yUnit = "", precision = 0 }) {
  const W = 560;
  const H = 220;
  const M = { top: 16, right: 16, bottom: 34, left: 50 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const safeValues = values.length ? values : [0, 0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const pad = Math.max(1, (max - min) * 0.08);
  const yMin = Math.max(0, min - pad);
  const yMax = max + pad;
  const span = Math.max(1e-6, yMax - yMin);
  const formatY = (v) => `${v.toFixed(precision)}${yUnit}`;

  const points = safeValues
    .map((v, i) => {
      const x = M.left + (i / Math.max(safeValues.length - 1, 1)) * plotW;
      const y = M.top + (1 - (v - yMin) / span) * plotH;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((k) => {
        const y = M.top + k * plotH;
        const val = yMax - k * span;
        return (
          <g key={`y-${k}`}>
            <line x1={M.left} y1={y} x2={W - M.right} y2={y} className="grid-line" />
            <text x={M.left - 8} y={y + 3} className="axis-text axis-text-right">
              {formatY(val)}
            </text>
          </g>
        );
      })}
      {[0, 0.25, 0.5, 0.75, 1].map((k) => {
        const x = M.left + k * plotW;
        const idx = Math.round(k * Math.max(safeValues.length - 1, 0));
        return (
          <g key={`x-${k}`}>
            <line x1={x} y1={M.top} x2={x} y2={H - M.bottom} className="grid-line v" />
            <text x={x} y={H - 12} className="axis-text axis-text-center">
              {idx}
            </text>
          </g>
        );
      })}
      <line x1={M.left} y1={M.top} x2={M.left} y2={H - M.bottom} className="axis-line" />
      <line x1={M.left} y1={H - M.bottom} x2={W - M.right} y2={H - M.bottom} className="axis-line" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.4" />
      <text x={12} y={M.top + plotH / 2} className="axis-label" transform={`rotate(-90 12 ${M.top + plotH / 2})`}>
        {yLabel}
      </text>
      <text x={M.left + plotW / 2} y={H - 2} className="axis-label axis-text-center">
        {xLabel}
      </text>
    </svg>
  );
}

function BarChart({ data, labels, colors, yLabel, yMax }) {
  const W = 560;
  const H = 220;
  const M = { top: 16, right: 16, bottom: 34, left: 50 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const barW = plotW / (data.length * 1.8);

  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((k) => {
        const y = M.top + k * plotH;
        const val = Math.round((1 - k) * yMax);
        return (
          <g key={`bar-y-${k}`}>
            <line x1={M.left} y1={y} x2={W - M.right} y2={y} className="grid-line" />
            <text x={M.left - 8} y={y + 3} className="axis-text axis-text-right">
              {val}
            </text>
          </g>
        );
      })}
      <line x1={M.left} y1={M.top} x2={M.left} y2={H - M.bottom} className="axis-line" />
      <line x1={M.left} y1={H - M.bottom} x2={W - M.right} y2={H - M.bottom} className="axis-line" />
      {data.map((v, i) => {
        const h = (Math.max(0, v) / yMax) * plotH;
        const x = M.left + ((i + 0.5) * plotW) / data.length - barW / 2;
        const y = H - M.bottom - h;
        return (
          <g key={labels[i]}>
            <rect x={x} y={y} width={barW} height={h} rx="4" fill={colors[i]} />
            <text x={x + barW / 2} y={H - 12} className="axis-text axis-text-center">
              {labels[i]}
            </text>
          </g>
        );
      })}
      <text x={12} y={M.top + plotH / 2} className="axis-label" transform={`rotate(-90 12 ${M.top + plotH / 2})`}>
        {yLabel}
      </text>
    </svg>
  );
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const start = (Math.PI / 180) * startDeg;
  const end = (Math.PI / 180) * endDeg;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

function DialGauge({ title, value, min, max, unit = "", color = "#22c55e" }) {
  const pct = Math.max(0, Math.min(1, (value - min) / Math.max(1, max - min)));
  const startDeg = 180;
  const endDeg = 360;
  const valueDeg = startDeg + (endDeg - startDeg) * pct;
  const display = `${Math.round(value)}${unit}`;

  const ticks = new Array(11).fill(0).map((_, i) => {
    const deg = 180 + i * 18;
    const rad = (Math.PI / 180) * deg;
    const x1 = 70 + 42 * Math.cos(rad);
    const y1 = 70 + 42 * Math.sin(rad);
    const x2 = 70 + 47 * Math.cos(rad);
    const y2 = 70 + 47 * Math.sin(rad);
    return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} className="dial-tick" />;
  });
  const gid = `grad-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <div className="dial-card">
      <div className="dial-title">{title}</div>
      <svg viewBox="0 0 140 95" className="dial-svg">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="55%" stopColor={color} />
            <stop offset="100%" stopColor="#facc15" />
          </linearGradient>
        </defs>
        <path d={arcPath(70, 70, 48, 180, 360)} className="dial-track" />
        <path
          d={arcPath(70, 70, 48, 180, valueDeg)}
          className="dial-progress"
          style={{ stroke: `url(#${gid})` }}
        />
        {ticks}
      </svg>
      <div className="dial-value" style={{ color }}>
        {display}
      </div>
    </div>
  );
}

function LedBulb({ r, g, b, intensity }) {
  const safeIntensity = Math.max(0.08, Math.min(1, intensity));
  const glowOpacity = 0.35 + safeIntensity * 0.45;
  const bulbColor = `rgba(${r}, ${g}, ${b}, ${0.55 + safeIntensity * 0.4})`;
  const glowColor = `rgba(${r}, ${g}, ${b}, ${glowOpacity})`;

  return (
    <div className="led-card">
      <div className="dial-title">LED Output</div>
      <div className="led-stage">
        <div className="led-glow" style={{ background: `radial-gradient(circle, ${glowColor} 0%, rgba(0,0,0,0) 70%)` }} />
        <div
          className="led-bulb"
          style={{
            background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.95), ${bulbColor})`,
            boxShadow: `0 0 ${18 + safeIntensity * 18}px ${glowColor}`,
          }}
        />
        <div className="led-base-top" />
        <div className="led-leg left" />
        <div className="led-leg right" />
      </div>
    </div>
  );
}

export default function App() {
  const [sim, setSim] = useState(null);
  const [now, setNow] = useState(new Date());
  const [control, setControl] = useState({
    speed: 1,
    ambientTemp: 25,
    humidity: 50,
    driveCurrent: 350,
    adcBits: 10,
  });
  const [rulModel, setRulModel] = useState({
    baseLifeHours: 12000,
    hoursPenalty: 0.55,
    ripplePenalty: 85,
    tempPenalty: 22,
    currentPenalty: 12,
    anomalyPenalty: 2200,
    minRul: 0,
  });
  const [inject, setInject] = useState({
    rgbEnabled: false,
    r: 600,
    g: 400,
    b: 250,
    ldrEnabled: false,
    ldr: 1000,
    rippleEnabled: false,
    ripple: 25,
  });

  useEffect(() => {
    const loadState = async () => {
      const res = await fetch(`${API_URL}/api/state`);
      const data = await res.json();
      setSim(data);
      setControl({
        speed: data.speed,
        ambientTemp: data.ambientTemp,
        humidity: data.humidity,
        driveCurrent: data.driveCurrent,
        adcBits: data.adc?.bits ?? 10,
      });
      setRulModel(data.rulModel ?? rulModel);
    };
    loadState();
    const id = setInterval(loadState, 500);
    const clockId = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(id);
      clearInterval(clockId);
    };
  }, []);

  if (!sim) return <div className="loading">Loading simulator...</div>;

  const applyControl = (next) => {
    setControl(next);
    postJson("/api/control", next);
  };

  const applyAnomalies = (next) => {
    setInject(next);
    postJson("/api/anomalies", {
      rgb: { enabled: next.rgbEnabled, r: Number(next.r), g: Number(next.g), b: Number(next.b) },
      ldr: { enabled: next.ldrEnabled, value: Number(next.ldr) },
      ripple: { enabled: next.rippleEnabled, value: Number(next.ripple) },
    });
  };

  const cTrace = sim.history.map((h) => h.rgb.C);
  const rippleTrace = sim.history.map((h) => h.ripplePercent);
  const ldrTrace = sim.history.map((h) => h.ldr);
  const anomalyVal = Number(
    (Number(inject.rgbEnabled) * 0.35 + Number(inject.ldrEnabled) * 0.3 + Number(inject.rippleEnabled) * 0.35).toFixed(2)
  );
  const ldrMax = sim.adc?.max ?? 1023;
  const junctionTemp = sim.ambientTemp + (sim.driveCurrent / 1000) * 3 * 15;
  const displayR = Math.min(255, Math.round((sim.sensors.rgb.R / 1023) * 255));
  const displayG = Math.min(255, Math.round((sim.sensors.rgb.G / 1023) * 255));
  const displayB = Math.min(255, Math.round((sim.sensors.rgb.B / 1023) * 255));
  const rgbIntensity = Math.min(
    1,
    Math.max(0.1, (sim.sensors.rgb.R + sim.sensors.rgb.G + sim.sensors.rgb.B) / (1023 * 3))
  );

  const saveRulModel = async () => {
    await postJson("/api/rul-model", {
      baseLifeHours: Number(rulModel.baseLifeHours),
      hoursPenalty: Number(rulModel.hoursPenalty),
      ripplePenalty: Number(rulModel.ripplePenalty),
      tempPenalty: Number(rulModel.tempPenalty),
      currentPenalty: Number(rulModel.currentPenalty),
      anomalyPenalty: Number(rulModel.anomalyPenalty),
      minRul: Number(rulModel.minRul),
    });
  };

  const applyScenario = (name) => {
    const map = {
      normal: { ambientTemp: 25, humidity: 50, driveCurrent: 350 },
      capfail: { ambientTemp: 40, humidity: 65, driveCurrent: 360, rippleEnabled: true, ripple: 15 },
      phosphor: { ambientTemp: 55, humidity: 40, driveCurrent: 400, rgbEnabled: true, r: 900, g: 700, b: 500 },
      catastrophic: { ambientTemp: 75, humidity: 80, driveCurrent: 650, rippleEnabled: true, rgbEnabled: true, ldrEnabled: true },
      stress: { ambientTemp: 90, humidity: 90, driveCurrent: 680, rippleEnabled: true, ripple: 30 },
    };
    const selected = map[name];
    if (!selected) return;
    const nextControl = {
      speed: control.speed,
      ambientTemp: selected.ambientTemp,
      humidity: selected.humidity,
      driveCurrent: selected.driveCurrent,
    };
    applyControl(nextControl);
    const nextInject = {
      ...inject,
      rgbEnabled: !!selected.rgbEnabled,
      ldrEnabled: !!selected.ldrEnabled,
      rippleEnabled: !!selected.rippleEnabled,
      r: selected.r ?? inject.r,
      g: selected.g ?? inject.g,
      b: selected.b ?? inject.b,
      ldr: selected.ldr ?? inject.ldr,
      ripple: selected.ripple ?? inject.ripple,
    };
    applyAnomalies(nextInject);
  };

  return (
    <div className="page bg-bg text-gray">
      <header className="topbar card-header">
        <div className="brand brand-rich">
          <span className="dot glow-pulse" />
          <div>
            <h1 className="title">LED Digital Twin Simulator</h1>
            <div className="title-sub">Sensor stream emulation · ESP32 + TCS34725 + LDR</div>
          </div>
        </div>
        <div className="top-actions">
          <span className={`status-pill ${sim.playing ? "ok" : "warn"}`}>
            {sim.playing ? "RUNNING" : "PAUSED"}
          </span>
          <span className="status-pill neutral">{Math.round(sim.timeHours)} h</span>
          <span className="status-pill neutral">{now.toLocaleTimeString()}</span>
          <button className="run-btn" onClick={() => postJson("/api/control", { playing: !sim.playing })}>
            {sim.playing ? "Pause" : "Run"}
          </button>
          <select
            className="speed-select"
            value={control.speed}
            onChange={(e) => applyControl({ ...control, speed: Number(e.target.value) })}
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={3}>3x</option>
            <option value={6}>6x</option>
          </select>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <section className="side-section">
            <h3>Parameters</h3>
            <label>
              Operating Hours
              <div className="inline-value">{Math.round(sim.timeHours)}</div>
              <input type="range" className="slider-track" min="0" max="50000" value={Math.round(sim.timeHours)} readOnly />
            </label>
            <label>
              Drive Current ({control.driveCurrent} mA)
              <input
                className="slider-track"
                type="range"
                min="50"
                max="700"
                step="10"
                value={control.driveCurrent}
                onChange={(e) => applyControl({ ...control, driveCurrent: Number(e.target.value) })}
              />
            </label>
            <label>
              Ambient Temp ({control.ambientTemp} C)
              <input
                className="slider-track"
                type="range"
                min="-10"
                max="100"
                value={control.ambientTemp}
                onChange={(e) => applyControl({ ...control, ambientTemp: Number(e.target.value) })}
              />
            </label>
            <label>
              Humidity ({control.humidity}%)
              <input
                className="slider-track"
                type="range"
                min="0"
                max="100"
                value={control.humidity}
                onChange={(e) => applyControl({ ...control, humidity: Number(e.target.value) })}
              />
            </label>
            <label>
              ADC Resolution ({control.adcBits}-bit)
              <select
                className="speed-select full-width"
                value={control.adcBits}
                onChange={(e) => applyControl({ ...control, adcBits: Number(e.target.value) })}
              >
                <option value={10}>10-bit (0-1023)</option>
                <option value={12}>12-bit (0-4095)</option>
              </select>
            </label>
          </section>

          <section className="side-section">
            <h3>Fault Injection</h3>
            <div className="toggle-row">
              <span>
                Ripple Increase
                <small>Capacitor ESR degradation</small>
              </span>
              <label className="toggle-box">
                <input
                  type="checkbox"
                  checked={inject.rippleEnabled}
                  onChange={(e) => applyAnomalies({ ...inject, rippleEnabled: e.target.checked })}
                />
                <span className="toggle-track"></span>
                <span className="toggle-knob"></span>
              </label>
            </div>
            <div className="toggle-row">
              <span>
                Color Shift
                <small>Phosphor degradation</small>
              </span>
              <label className="toggle-box">
                <input
                  type="checkbox"
                  checked={inject.rgbEnabled}
                  onChange={(e) => applyAnomalies({ ...inject, rgbEnabled: e.target.checked })}
                />
                <span className="toggle-track"></span>
                <span className="toggle-knob"></span>
              </label>
            </div>
            <div className="toggle-row">
              <span>
                Sudden Failure
                <small>Bond wire / die attach</small>
              </span>
              <label className="toggle-box">
                <input
                  type="checkbox"
                  checked={inject.ldrEnabled}
                  onChange={(e) => applyAnomalies({ ...inject, ldrEnabled: e.target.checked })}
                />
                <span className="toggle-track"></span>
                <span className="toggle-knob"></span>
              </label>
            </div>
            <div className="inject-custom">
              <div className="mini-label">Custom Inject Values</div>
              <div className="triple-input">
                <div>
                  <div className="input-label">R</div>
                  <input type="number" value={inject.r} min="0" max="1023" onChange={(e) => applyAnomalies({ ...inject, r: e.target.value })} />
                </div>
                <div>
                  <div className="input-label">G</div>
                  <input type="number" value={inject.g} min="0" max="1023" onChange={(e) => applyAnomalies({ ...inject, g: e.target.value })} />
                </div>
                <div>
                  <div className="input-label">B</div>
                  <input type="number" value={inject.b} min="0" max="1023" onChange={(e) => applyAnomalies({ ...inject, b: e.target.value })} />
                </div>
              </div>
              <div className="input-label">LDR ADC ({ldrMax === 1023 ? "10-bit" : "12-bit"})</div>
              <input type="number" value={inject.ldr} min="0" max={ldrMax} onChange={(e) => applyAnomalies({ ...inject, ldr: e.target.value })} />
              <div className="input-label">Ripple (%)</div>
              <input type="number" value={inject.ripple} min="0" max="100" onChange={(e) => applyAnomalies({ ...inject, ripple: e.target.value })} />
            </div>
          </section>

          <section className="side-section">
            <h3>RUL Formula Editor</h3>
            <div className="formula-note">
              RUL = base - (hours*hoursPenalty) - ripple - thermal - current - anomaly
            </div>
            <div className="formula-grid">
              <div>
                <div className="input-label">Base Life (h)</div>
                <input type="number" value={rulModel.baseLifeHours} onChange={(e) => setRulModel({ ...rulModel, baseLifeHours: Number(e.target.value) })} />
              </div>
              <div>
                <div className="input-label">Hours Penalty</div>
                <input type="number" step="0.01" value={rulModel.hoursPenalty} onChange={(e) => setRulModel({ ...rulModel, hoursPenalty: Number(e.target.value) })} />
              </div>
              <div>
                <div className="input-label">Ripple Penalty</div>
                <input type="number" value={rulModel.ripplePenalty} onChange={(e) => setRulModel({ ...rulModel, ripplePenalty: Number(e.target.value) })} />
              </div>
              <div>
                <div className="input-label">Temp Penalty</div>
                <input type="number" value={rulModel.tempPenalty} onChange={(e) => setRulModel({ ...rulModel, tempPenalty: Number(e.target.value) })} />
              </div>
              <div>
                <div className="input-label">Current Penalty</div>
                <input type="number" value={rulModel.currentPenalty} onChange={(e) => setRulModel({ ...rulModel, currentPenalty: Number(e.target.value) })} />
              </div>
              <div>
                <div className="input-label">Anomaly Penalty</div>
                <input type="number" value={rulModel.anomalyPenalty} onChange={(e) => setRulModel({ ...rulModel, anomalyPenalty: Number(e.target.value) })} />
              </div>
            </div>
            <button type="button" className="scenario-btn full-width" onClick={saveRulModel}>
              Apply RUL Formula
            </button>
          </section>

          <section className="side-section">
            <h3>Scenarios</h3>
            <div className="scenario-grid">
              <button type="button" className="scenario-btn" onClick={() => applyScenario("normal")}>Normal Aging</button>
              <button type="button" className="scenario-btn" onClick={() => applyScenario("capfail")}>Cap. Failure</button>
              <button type="button" className="scenario-btn" onClick={() => applyScenario("phosphor")}>Phosphor Deg.</button>
              <button type="button" className="scenario-btn" onClick={() => applyScenario("catastrophic")}>Catastrophic</button>
              <button type="button" className="scenario-btn wide" onClick={() => applyScenario("stress")}>Thermal Stress Test</button>
            </div>
          </section>

          <section className="side-section">
            <h3>Sensor Readouts</h3>
            <div className="readout-head">
              <span>TCS34725</span>
              <span>RGBC</span>
            </div>
            <div className="readout"><span>R</span><strong>{sim.sensors.rgb.R}</strong></div>
            <div className="readout"><span>G</span><strong>{sim.sensors.rgb.G}</strong></div>
            <div className="readout"><span>B</span><strong>{sim.sensors.rgb.B}</strong></div>
            <div className="readout"><span>C</span><strong>{sim.sensors.rgb.C}</strong></div>
            <div className="readout"><span>LDR ADC</span><strong>{sim.sensors.ldr}</strong></div>
            <div className="readout"><span>Ripple</span><strong>{sim.sensors.ripplePercent}%</strong></div>
          </section>
        </aside>

        <main className="main-grid">
          <section className="tile card">
            <div className="tile-head">
              <h3>TCS34725 Sensor</h3>
            </div>
            <BarChart
              data={[sim.sensors.rgb.R, sim.sensors.rgb.G, sim.sensors.rgb.B, sim.sensors.rgb.C]}
              labels={["R", "G", "B", "C"]}
              colors={["rgba(239, 68, 68, 0.78)", "rgba(34, 197, 94, 0.78)", "rgba(59, 130, 246, 0.78)", "rgba(180,180,180,0.75)"]}
              yLabel="Counts (ADC)"
              yMax={3200}
            />
          </section>

          <section className="tile card">
            <div className="tile-head">
              <h3>Ripple Waveform</h3>
            </div>
            <LineChart
              values={rippleTrace}
              color="#22c55e"
              yLabel="Ripple (%)"
              xLabel="Sample Index"
              yUnit="%"
              precision={1}
            />
          </section>

          <section className="tile span-2 card">
            <div className="tile-head">
              <h3>Sensor Timeline</h3>
            </div>
            <div className="timeline-grid">
              <LineChart
                values={cTrace}
                color="#f59e0b"
                yLabel="Clear Channel (C)"
                xLabel="Sample Index"
                precision={0}
              />
              <LineChart
                values={ldrTrace}
                color="#3b82f6"
                yLabel="LDR (ADC)"
                xLabel="Sample Index"
                precision={0}
              />
            </div>
          </section>

          <section className="gauge-row span-2">
            <DialGauge title="Anomaly" value={anomalyVal * 100} min={0} max={100} color="#22c55e" />
            <DialGauge title="RUL" value={sim.derived?.rulHours ?? 0} min={0} max={Math.max(1000, rulModel.baseLifeHours)} unit="h" color="#4ade80" />
            <DialGauge title="LDR ADC" value={sim.sensors.ldr} min={0} max={ldrMax} color="#fbbf24" />
            <DialGauge title="Junction" value={junctionTemp} min={0} max={150} unit="°C" color="#22c55e" />
            <LedBulb r={displayR} g={displayG} b={displayB} intensity={rgbIntensity} />
          </section>
        </main>
      </div>
    </div>
  );
}

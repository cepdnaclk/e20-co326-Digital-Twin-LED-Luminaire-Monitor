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

  return (
    <div className="dial-card">
      <div className="dial-title">{title}</div>
      <svg viewBox="0 0 140 95" className="dial-svg">
        <path d={arcPath(70, 70, 48, 180, 360)} className="dial-track" />
        <path
          d={arcPath(70, 70, 48, 180, valueDeg)}
          className="dial-progress"
          style={{ stroke: color }}
        />
        {ticks}
      </svg>
      <div className="dial-value" style={{ color }}>
        {display}
      </div>
    </div>
  );
}

export default function App() {
  const [sim, setSim] = useState(null);
  const [control, setControl] = useState({
    speed: 1,
    ambientTemp: 25,
    humidity: 50,
    driveCurrent: 350,
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
      });
    };
    loadState();
    const id = setInterval(loadState, 500);
    return () => clearInterval(id);
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
        <div className="brand">
          <span className="dot glow-pulse" />
          <h1 className="title">LED Digital Twin</h1>
          <span className="version">v2.0</span>
        </div>
        <div className="top-actions">
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
          </section>

          <section className="side-section">
            <h3>Fault Injection</h3>
            <label className="toggle-row">
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
            </label>
            <label className="toggle-row">
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
            </label>
            <label className="toggle-row">
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
            </label>
            <div className="inject-custom">
              <div className="mini-label">Custom Inject Values</div>
              <div className="triple-input">
                <input type="number" value={inject.r} min="0" max="1023" onChange={(e) => applyAnomalies({ ...inject, r: e.target.value })} />
                <input type="number" value={inject.g} min="0" max="1023" onChange={(e) => applyAnomalies({ ...inject, g: e.target.value })} />
                <input type="number" value={inject.b} min="0" max="1023" onChange={(e) => applyAnomalies({ ...inject, b: e.target.value })} />
              </div>
              <input type="number" value={inject.ldr} min="0" max="4095" onChange={(e) => applyAnomalies({ ...inject, ldr: e.target.value })} />
              <input type="number" value={inject.ripple} min="0" max="100" onChange={(e) => applyAnomalies({ ...inject, ripple: e.target.value })} />
            </div>
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
            <DialGauge title="RUL" value={Math.max(0, 10000 - sim.timeHours * 0.5)} min={0} max={10000} unit="h" color="#4ade80" />
            <DialGauge title="LDR ADC" value={sim.sensors.ldr} min={0} max={4095} color="#fbbf24" />
            <DialGauge title="Junction" value={sim.ambientTemp + (sim.driveCurrent / 1000) * 3 * 15} min={0} max={150} unit="°C" color="#22c55e" />
          </section>
        </main>
      </div>
    </div>
  );
}

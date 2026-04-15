import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const TICK_SECONDS = 0.5;

const state = {
  playing: true,
  speed: 1,
  timeHours: 0,
  ambientTemp: 25,
  humidity: 50,
  driveCurrent: 350,
  anomalies: {
    rgb: { enabled: false, r: 0, g: 0, b: 0 },
    ldr: { enabled: false, value: 0 },
    ripple: { enabled: false, value: 0 },
  },
  sensors: {
    rgb: { R: 0, G: 0, B: 0, C: 0 },
    ldr: 0,
    ripplePercent: 0,
  },
};

const history = [];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const noise = (v, ratio = 0.03) => v + (Math.random() - 0.5) * 2 * v * ratio;

function simulate() {
  if (state.playing) {
    state.timeHours += TICK_SECONDS * state.speed * 30;
  }

  const intensity =
    Math.exp(-0.00006 * state.timeHours) *
    (1 - Math.max(0, state.ambientTemp - 25) * 0.0025) *
    (1 - Math.max(0, state.humidity - 50) * 0.001) *
    (1 + (state.driveCurrent - 350) * 0.0004);

  const safeIntensity = clamp(intensity, 0.05, 1.1);
  const baseR = clamp(noise(255 * safeIntensity * 1.0), 0, 1023);
  const baseG = clamp(noise(240 * safeIntensity * 0.95), 0, 1023);
  const baseB = clamp(noise(225 * safeIntensity * 0.9), 0, 1023);
  const baseLdr = clamp(
    noise((4095 * Math.log10(1 + safeIntensity * 9)) / Math.log10(10), 0.02),
    0,
    4095
  );
  const baseRipple = clamp(
    noise((1 + state.timeHours * 0.0001 + (state.driveCurrent - 350) * 0.0005) * 1.6, 0.1),
    0.2,
    45
  );

  const finalR = state.anomalies.rgb.enabled ? state.anomalies.rgb.r : baseR;
  const finalG = state.anomalies.rgb.enabled ? state.anomalies.rgb.g : baseG;
  const finalB = state.anomalies.rgb.enabled ? state.anomalies.rgb.b : baseB;
  const finalLdr = state.anomalies.ldr.enabled ? state.anomalies.ldr.value : baseLdr;
  const finalRipple = state.anomalies.ripple.enabled
    ? state.anomalies.ripple.value
    : baseRipple;

  state.sensors.rgb = {
    R: Math.round(finalR),
    G: Math.round(finalG),
    B: Math.round(finalB),
    C: Math.round(finalR + finalG + finalB),
  };
  state.sensors.ldr = Math.round(finalLdr);
  state.sensors.ripplePercent = Number(finalRipple.toFixed(2));

  history.push({
    t: Math.round(state.timeHours),
    rgb: { ...state.sensors.rgb },
    ldr: state.sensors.ldr,
    ripplePercent: state.sensors.ripplePercent,
  });
  if (history.length > 120) history.shift();
}

setInterval(simulate, TICK_SECONDS * 1000);

app.get("/api/state", (_req, res) => {
  res.json({ ...state, history });
});

app.post("/api/control", (req, res) => {
  const { playing, speed, ambientTemp, humidity, driveCurrent } = req.body;

  if (typeof playing === "boolean") state.playing = playing;
  if (typeof speed === "number") state.speed = clamp(speed, 0.25, 8);
  if (typeof ambientTemp === "number") state.ambientTemp = clamp(ambientTemp, -10, 100);
  if (typeof humidity === "number") state.humidity = clamp(humidity, 0, 100);
  if (typeof driveCurrent === "number") state.driveCurrent = clamp(driveCurrent, 50, 700);

  res.json({ ok: true, state });
});

app.post("/api/anomalies", (req, res) => {
  const { rgb, ldr, ripple } = req.body;

  if (rgb) {
    state.anomalies.rgb.enabled = !!rgb.enabled;
    if (typeof rgb.r === "number") state.anomalies.rgb.r = clamp(rgb.r, 0, 1023);
    if (typeof rgb.g === "number") state.anomalies.rgb.g = clamp(rgb.g, 0, 1023);
    if (typeof rgb.b === "number") state.anomalies.rgb.b = clamp(rgb.b, 0, 1023);
  }
  if (ldr) {
    state.anomalies.ldr.enabled = !!ldr.enabled;
    if (typeof ldr.value === "number") state.anomalies.ldr.value = clamp(ldr.value, 0, 4095);
  }
  if (ripple) {
    state.anomalies.ripple.enabled = !!ripple.enabled;
    if (typeof ripple.value === "number") {
      state.anomalies.ripple.value = clamp(ripple.value, 0, 100);
    }
  }

  res.json({ ok: true, anomalies: state.anomalies });
});

app.listen(PORT, () => {
  console.log(`Simulator API running on http://localhost:${PORT}`);
});

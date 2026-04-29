import express from "express";
import cors from "cors";
import mqtt from "mqtt";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const TICK_SECONDS = 0.5;
const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";
const MQTT_TOPIC =
  process.env.MQTT_TOPIC || "factory/sitea/floor1/line1/cell1/lum_0001/telemetry/raw";
const MQTT_CLIENT_ID =
  process.env.MQTT_CLIENT_ID || `led-simulator-${Math.random().toString(16).slice(2, 10)}`;
const MQTT_ENABLED = (process.env.MQTT_ENABLED || "true").toLowerCase() !== "false";
const DEFAULT_INSTANCE_ID = process.env.DEFAULT_INSTANCE_ID || "lum_0001";
const MAX_HISTORY = 120;
const HEALTHY_DEFAULTS = {
  ambientTemp: 25,
  humidity: 45,
  driveCurrent: 320,
  speed: 1,
  adcBits: 12,
};

const instances = new Map();

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const noise = (v, ratio = 0.03) => v + (Math.random() - 0.5) * 2 * v * ratio;

const sanitizePathSegment = (value, fallback) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
};

const buildTopicBase = (location, luminaireId) =>
  `factory/${location.site}/${location.floor}/${location.line}/${location.cell}/${luminaireId}`;

function createLampState(instanceId, overrides = {}, options = {}) {
  const location = {
    site: sanitizePathSegment(overrides?.location?.site, "sitea"),
    floor: sanitizePathSegment(overrides?.location?.floor, "floor1"),
    line: sanitizePathSegment(overrides?.location?.line, "line1"),
    cell: sanitizePathSegment(overrides?.location?.cell, "cell1"),
  };
  const topicBase = overrides.topicBase || buildTopicBase(location, instanceId);
  const defaultTopic = `${topicBase}/telemetry/raw`;

  const initialSpeed = typeof overrides.speed === "number" ? overrides.speed : HEALTHY_DEFAULTS.speed;
  const initialAmbientTemp =
    typeof overrides.ambientTemp === "number" ? overrides.ambientTemp : HEALTHY_DEFAULTS.ambientTemp;
  const initialHumidity =
    typeof overrides.humidity === "number" ? overrides.humidity : HEALTHY_DEFAULTS.humidity;
  const initialDriveCurrent =
    typeof overrides.driveCurrent === "number" ? overrides.driveCurrent : HEALTHY_DEFAULTS.driveCurrent;
  const initialAdcBits =
    typeof overrides.adcBits === "number" ? (overrides.adcBits >= 12 ? 12 : 10) : HEALTHY_DEFAULTS.adcBits;

  return {
    id: instanceId,
    playing: !!overrides.playing,
    speed: clamp(initialSpeed, 0.25, 8),
    timeHours: typeof overrides.timeHours === "number" ? Math.max(0, overrides.timeHours) : 0,
    ambientTemp: clamp(initialAmbientTemp, -10, 100),
    humidity: clamp(initialHumidity, 0, 100),
    driveCurrent: clamp(initialDriveCurrent, 50, 700),
    location,
    topicBase,
    mqttTopic: options.isDefault ? MQTT_TOPIC : defaultTopic,
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
    adc: {
      bits: initialAdcBits,
      max: initialAdcBits === 12 ? 4095 : 1023,
    },
    initialValues: {
      ambientTemp: clamp(initialAmbientTemp, -10, 100),
      humidity: clamp(initialHumidity, 0, 100),
      driveCurrent: clamp(initialDriveCurrent, 50, 700),
      speed: clamp(initialSpeed, 0.25, 8),
      adcBits: initialAdcBits,
    },
    rulModel: {
      baseLifeHours: 12000,
      hoursPenalty: 0.55,
      ripplePenalty: 85,
      tempPenalty: 22,
      currentPenalty: 12,
      anomalyPenalty: 2200,
      minRul: 0,
    },
    derived: {
      anomalyScore: 0,
      rulHours: 12000,
    },
    history: [],
  };
}

function ensureInstance(id) {
  const instance = instances.get(id);
  if (!instance) return null;
  return instance;
}

function getPublicState(instance) {
  return {
    ...instance,
    history: [...instance.history],
  };
}

let mqttClient = null;
let mqttConnected = false;

function initMqtt() {
  if (!MQTT_ENABLED) {
    console.log("MQTT publishing disabled (MQTT_ENABLED=false).");
    return;
  }

  mqttClient = mqtt.connect(MQTT_URL, {
    clientId: MQTT_CLIENT_ID,
    reconnectPeriod: 2000,
    connectTimeout: 5000,
  });

  mqttClient.on("connect", () => {
    mqttConnected = true;
    console.log(`Connected to MQTT broker: ${MQTT_URL}`);
  });

  mqttClient.on("reconnect", () => {
    mqttConnected = false;
  });

  mqttClient.on("close", () => {
    mqttConnected = false;
  });

  mqttClient.on("error", (err) => {
    mqttConnected = false;
    console.warn(`MQTT error: ${err.message}`);
  });
}

function publishSensorSample(instance) {
  if (!mqttClient || !mqttConnected) return;

  const payload = {
    timestamp: new Date().toISOString(),
    lamp: {
      id: instance.id,
      location: instance.location,
      topicBase: instance.topicBase,
    },
    sim: {
      timeHours: Number(instance.timeHours.toFixed(2)),
      speed: instance.speed,
      playing: instance.playing,
    },
    environment: {
      ambientTemp: instance.ambientTemp,
      humidity: instance.humidity,
      driveCurrent: instance.driveCurrent,
    },
    sensors: {
      tcs34725: instance.sensors.rgb,
      ldrAdc: instance.sensors.ldr,
      ripplePercent: instance.sensors.ripplePercent,
    },
    derived: instance.derived,
    adc: instance.adc,
    anomalies: instance.anomalies,
  };

  mqttClient.publish(instance.mqttTopic, JSON.stringify(payload), { qos: 0, retain: false }, (err) => {
    if (err) {
      console.warn(`Failed to publish MQTT sample: ${err.message}`);
    }
  });
}

function applyInitialValues(instance, resetTime = true) {
  instance.ambientTemp = instance.initialValues.ambientTemp;
  instance.humidity = instance.initialValues.humidity;
  instance.driveCurrent = instance.initialValues.driveCurrent;
  instance.speed = instance.initialValues.speed;
  instance.adc.bits = instance.initialValues.adcBits >= 12 ? 12 : 10;
  instance.adc.max = instance.adc.bits === 12 ? 4095 : 1023;
  if (resetTime) {
    instance.timeHours = 0;
    instance.history.length = 0;
  }
  instance.anomalies.rgb.enabled = false;
  instance.anomalies.ldr.enabled = false;
  instance.anomalies.ripple.enabled = false;
}

function simulateInstance(instance) {
  if (!instance.playing) return;

  instance.timeHours += TICK_SECONDS * instance.speed * 30;

  const intensity =
    Math.exp(-0.00006 * instance.timeHours) *
    (1 - Math.max(0, instance.ambientTemp - 25) * 0.0025) *
    (1 - Math.max(0, instance.humidity - 50) * 0.001) *
    (1 + (instance.driveCurrent - 350) * 0.0004);

  const safeIntensity = clamp(intensity, 0.05, 1.1);
  const adcMax = instance.adc.max;
  const baseR = clamp(noise(255 * safeIntensity * 1.0), 0, 1023);
  const baseG = clamp(noise(240 * safeIntensity * 0.95), 0, 1023);
  const baseB = clamp(noise(225 * safeIntensity * 0.9), 0, 1023);
  const baseLdr = clamp(
    noise((adcMax * Math.log10(1 + safeIntensity * 9)) / Math.log10(10), 0.02),
    0,
    adcMax
  );
  const baseRipple = clamp(
    noise((1 + instance.timeHours * 0.0001 + (instance.driveCurrent - 350) * 0.0005) * 1.6, 0.1),
    0.2,
    45
  );

  const finalR = instance.anomalies.rgb.enabled ? instance.anomalies.rgb.r : baseR;
  const finalG = instance.anomalies.rgb.enabled ? instance.anomalies.rgb.g : baseG;
  const finalB = instance.anomalies.rgb.enabled ? instance.anomalies.rgb.b : baseB;
  const finalLdr = instance.anomalies.ldr.enabled ? instance.anomalies.ldr.value : baseLdr;
  const finalRipple = instance.anomalies.ripple.enabled
    ? instance.anomalies.ripple.value
    : baseRipple;

  instance.sensors.rgb = {
    R: Math.round(finalR),
    G: Math.round(finalG),
    B: Math.round(finalB),
    C: Math.round(finalR + finalG + finalB),
  };
  instance.sensors.ldr = Math.round(finalLdr);
  instance.sensors.ripplePercent = Number(finalRipple.toFixed(2));

  const anomalyScore =
    0.35 * Number(instance.anomalies.rgb.enabled) +
    0.3 * Number(instance.anomalies.ldr.enabled) +
    0.35 * Number(instance.anomalies.ripple.enabled);

  const rippleRatio = instance.sensors.ripplePercent / 100;
  const tempRise = Math.max(0, instance.ambientTemp - 25);
  const currentRiseRatio = Math.max(0, (instance.driveCurrent - 350) / 350);
  const model = instance.rulModel;
  const rul =
    model.baseLifeHours -
    instance.timeHours * model.hoursPenalty -
    rippleRatio * model.ripplePenalty * 100 -
    tempRise * model.tempPenalty -
    currentRiseRatio * model.currentPenalty * 100 -
    anomalyScore * model.anomalyPenalty;

  instance.derived.anomalyScore = Number(anomalyScore.toFixed(2));
  instance.derived.rulHours = Math.max(model.minRul, Math.round(rul));

  instance.history.push({
    t: Math.round(instance.timeHours),
    rgb: { ...instance.sensors.rgb },
    ldr: instance.sensors.ldr,
    ripplePercent: instance.sensors.ripplePercent,
  });
  if (instance.history.length > MAX_HISTORY) instance.history.shift();

  publishSensorSample(instance);
}

setInterval(() => {
  for (const instance of instances.values()) {
    simulateInstance(instance);
  }
}, TICK_SECONDS * 1000);

instances.set(DEFAULT_INSTANCE_ID, createLampState(DEFAULT_INSTANCE_ID, {}, { isDefault: true }));
initMqtt();

app.get("/api/instances", (_req, res) => {
  const list = [...instances.values()].map((instance) => ({
    id: instance.id,
    playing: instance.playing,
    speed: instance.speed,
    timeHours: Number(instance.timeHours.toFixed(2)),
    location: instance.location,
    mqttTopic: instance.mqttTopic,
    anomalyScore: instance.derived.anomalyScore,
    rulHours: instance.derived.rulHours,
  }));
  res.json({ instances: list, count: list.length, defaultInstanceId: DEFAULT_INSTANCE_ID });
});

app.post("/api/instances", (req, res) => {
  const { ids, count = 1, defaults = {}, replace = false } = req.body || {};
  const created = [];
  const skipped = [];
  const targetIds = Array.isArray(ids) && ids.length
    ? ids.map((id) => sanitizePathSegment(id, "lamp"))
    : Array.from({ length: clamp(Number(count) || 1, 1, 1000) }, (_, idx) => `lum_${String(instances.size + idx + 1).padStart(4, "0")}`);

  for (const candidateId of targetIds) {
    if (!candidateId) continue;
    if (candidateId === DEFAULT_INSTANCE_ID && !replace) {
      skipped.push({ id: candidateId, reason: "default instance already exists" });
      continue;
    }

    if (instances.has(candidateId) && !replace) {
      skipped.push({ id: candidateId, reason: "instance already exists" });
      continue;
    }

    const lamp = createLampState(candidateId, defaults);
    instances.set(candidateId, lamp);
    created.push({ id: candidateId, mqttTopic: lamp.mqttTopic, location: lamp.location });
  }

  res.json({ ok: true, created, skipped, total: instances.size });
});

app.post("/api/instances/bulk/control", (req, res) => {
  const { ids, control = {} } = req.body || {};
  const targetIds = Array.isArray(ids) && ids.length ? ids : [...instances.keys()];
  const updated = [];
  const missing = [];

  for (const id of targetIds) {
    const instance = ensureInstance(id);
    if (!instance) {
      missing.push(id);
      continue;
    }

    const { playing, speed, ambientTemp, humidity, driveCurrent, adcBits } = control;
    if (typeof playing === "boolean") instance.playing = playing;
    if (typeof speed === "number") instance.speed = clamp(speed, 0.25, 8);
    if (typeof ambientTemp === "number") instance.ambientTemp = clamp(ambientTemp, -10, 100);
    if (typeof humidity === "number") instance.humidity = clamp(humidity, 0, 100);
    if (typeof driveCurrent === "number") instance.driveCurrent = clamp(driveCurrent, 50, 700);
    if (typeof adcBits === "number") {
      const bits = adcBits >= 12 ? 12 : 10;
      instance.adc.bits = bits;
      instance.adc.max = bits === 12 ? 4095 : 1023;
      instance.anomalies.ldr.value = clamp(instance.anomalies.ldr.value, 0, instance.adc.max);
    }

    updated.push(id);
  }

  res.json({ ok: true, updated, missing });
});

app.get("/api/instances/:id/state", (req, res) => {
  const instance = ensureInstance(req.params.id);
  if (!instance) return res.status(404).json({ ok: false, error: "Instance not found" });
  return res.json(getPublicState(instance));
});

app.delete("/api/instances/:id", (req, res) => {
  const { id } = req.params;
  if (id === DEFAULT_INSTANCE_ID) {
    return res.status(400).json({ ok: false, error: "Default instance cannot be deleted" });
  }
  if (!instances.has(id)) return res.status(404).json({ ok: false, error: "Instance not found" });
  instances.delete(id);
  return res.json({ ok: true, deleted: id, total: instances.size });
});

app.post("/api/instances/delete-all", (_req, res) => {
  const deleted = [];
  for (const id of instances.keys()) {
    if (id === DEFAULT_INSTANCE_ID) continue;
    deleted.push(id);
    instances.delete(id);
  }
  return res.json({ ok: true, deleted, total: instances.size, keptDefault: DEFAULT_INSTANCE_ID });
});

app.get("/api/state", (_req, res) => {
  const defaultInstance = ensureInstance(DEFAULT_INSTANCE_ID);
  return res.json(getPublicState(defaultInstance));
});

app.post("/api/control", (req, res) => {
  const state = ensureInstance(DEFAULT_INSTANCE_ID);
  const { playing, speed, ambientTemp, humidity, driveCurrent, adcBits } = req.body;

  if (typeof playing === "boolean") state.playing = playing;
  if (typeof speed === "number") state.speed = clamp(speed, 0.25, 8);
  if (typeof ambientTemp === "number") state.ambientTemp = clamp(ambientTemp, -10, 100);
  if (typeof humidity === "number") state.humidity = clamp(humidity, 0, 100);
  if (typeof driveCurrent === "number") state.driveCurrent = clamp(driveCurrent, 50, 700);
  if (typeof adcBits === "number") {
    const bits = adcBits >= 12 ? 12 : 10;
    state.adc.bits = bits;
    state.adc.max = bits === 12 ? 4095 : 1023;
    state.anomalies.ldr.value = clamp(state.anomalies.ldr.value, 0, state.adc.max);
  }

  res.json({ ok: true, state });
});

app.post("/api/anomalies", (req, res) => {
  const state = ensureInstance(DEFAULT_INSTANCE_ID);
  const { rgb, ldr, ripple } = req.body;

  if (rgb) {
    state.anomalies.rgb.enabled = !!rgb.enabled;
    if (typeof rgb.r === "number") state.anomalies.rgb.r = clamp(rgb.r, 0, 1023);
    if (typeof rgb.g === "number") state.anomalies.rgb.g = clamp(rgb.g, 0, 1023);
    if (typeof rgb.b === "number") state.anomalies.rgb.b = clamp(rgb.b, 0, 1023);
  }
  if (ldr) {
    state.anomalies.ldr.enabled = !!ldr.enabled;
    if (typeof ldr.value === "number") state.anomalies.ldr.value = clamp(ldr.value, 0, state.adc.max);
  }
  if (ripple) {
    state.anomalies.ripple.enabled = !!ripple.enabled;
    if (typeof ripple.value === "number") {
      state.anomalies.ripple.value = clamp(ripple.value, 0, 100);
    }
  }

  res.json({ ok: true, anomalies: state.anomalies });
});

app.post("/api/rul-model", (req, res) => {
  const state = ensureInstance(DEFAULT_INSTANCE_ID);
  const {
    baseLifeHours,
    hoursPenalty,
    ripplePenalty,
    tempPenalty,
    currentPenalty,
    anomalyPenalty,
    minRul,
  } = req.body;

  const model = state.rulModel;
  if (typeof baseLifeHours === "number") model.baseLifeHours = clamp(baseLifeHours, 100, 50000);
  if (typeof hoursPenalty === "number") model.hoursPenalty = clamp(hoursPenalty, 0, 10);
  if (typeof ripplePenalty === "number") model.ripplePenalty = clamp(ripplePenalty, 0, 1000);
  if (typeof tempPenalty === "number") model.tempPenalty = clamp(tempPenalty, 0, 200);
  if (typeof currentPenalty === "number") model.currentPenalty = clamp(currentPenalty, 0, 200);
  if (typeof anomalyPenalty === "number") model.anomalyPenalty = clamp(anomalyPenalty, 0, 20000);
  if (typeof minRul === "number") model.minRul = clamp(minRul, 0, 50000);

  res.json({ ok: true, rulModel: model });
});

app.post("/api/initial-values", (req, res) => {
  const state = ensureInstance(DEFAULT_INSTANCE_ID);
  const { ambientTemp, humidity, driveCurrent, speed, adcBits, applyNow } = req.body;

  if (typeof ambientTemp === "number") state.initialValues.ambientTemp = clamp(ambientTemp, -10, 100);
  if (typeof humidity === "number") state.initialValues.humidity = clamp(humidity, 0, 100);
  if (typeof driveCurrent === "number") state.initialValues.driveCurrent = clamp(driveCurrent, 50, 700);
  if (typeof speed === "number") state.initialValues.speed = clamp(speed, 0.25, 8);
  if (typeof adcBits === "number") state.initialValues.adcBits = adcBits >= 12 ? 12 : 10;

  if (applyNow) {
    applyInitialValues(state, true);
  }

  res.json({ ok: true, initialValues: state.initialValues, state });
});

app.post("/api/instances/:id/control", (req, res) => {
  const state = ensureInstance(req.params.id);
  if (!state) return res.status(404).json({ ok: false, error: "Instance not found" });
  const { playing, speed, ambientTemp, humidity, driveCurrent, adcBits } = req.body;

  if (typeof playing === "boolean") state.playing = playing;
  if (typeof speed === "number") state.speed = clamp(speed, 0.25, 8);
  if (typeof ambientTemp === "number") state.ambientTemp = clamp(ambientTemp, -10, 100);
  if (typeof humidity === "number") state.humidity = clamp(humidity, 0, 100);
  if (typeof driveCurrent === "number") state.driveCurrent = clamp(driveCurrent, 50, 700);
  if (typeof adcBits === "number") {
    const bits = adcBits >= 12 ? 12 : 10;
    state.adc.bits = bits;
    state.adc.max = bits === 12 ? 4095 : 1023;
    state.anomalies.ldr.value = clamp(state.anomalies.ldr.value, 0, state.adc.max);
  }
  return res.json({ ok: true, state });
});

app.post("/api/instances/:id/anomalies", (req, res) => {
  const state = ensureInstance(req.params.id);
  if (!state) return res.status(404).json({ ok: false, error: "Instance not found" });
  const { rgb, ldr, ripple } = req.body;

  if (rgb) {
    state.anomalies.rgb.enabled = !!rgb.enabled;
    if (typeof rgb.r === "number") state.anomalies.rgb.r = clamp(rgb.r, 0, 1023);
    if (typeof rgb.g === "number") state.anomalies.rgb.g = clamp(rgb.g, 0, 1023);
    if (typeof rgb.b === "number") state.anomalies.rgb.b = clamp(rgb.b, 0, 1023);
  }
  if (ldr) {
    state.anomalies.ldr.enabled = !!ldr.enabled;
    if (typeof ldr.value === "number") state.anomalies.ldr.value = clamp(ldr.value, 0, state.adc.max);
  }
  if (ripple) {
    state.anomalies.ripple.enabled = !!ripple.enabled;
    if (typeof ripple.value === "number") {
      state.anomalies.ripple.value = clamp(ripple.value, 0, 100);
    }
  }

  return res.json({ ok: true, anomalies: state.anomalies });
});

app.post("/api/instances/:id/rul-model", (req, res) => {
  const state = ensureInstance(req.params.id);
  if (!state) return res.status(404).json({ ok: false, error: "Instance not found" });
  const {
    baseLifeHours,
    hoursPenalty,
    ripplePenalty,
    tempPenalty,
    currentPenalty,
    anomalyPenalty,
    minRul,
  } = req.body;

  const model = state.rulModel;
  if (typeof baseLifeHours === "number") model.baseLifeHours = clamp(baseLifeHours, 100, 50000);
  if (typeof hoursPenalty === "number") model.hoursPenalty = clamp(hoursPenalty, 0, 10);
  if (typeof ripplePenalty === "number") model.ripplePenalty = clamp(ripplePenalty, 0, 1000);
  if (typeof tempPenalty === "number") model.tempPenalty = clamp(tempPenalty, 0, 200);
  if (typeof currentPenalty === "number") model.currentPenalty = clamp(currentPenalty, 0, 200);
  if (typeof anomalyPenalty === "number") model.anomalyPenalty = clamp(anomalyPenalty, 0, 20000);
  if (typeof minRul === "number") model.minRul = clamp(minRul, 0, 50000);

  return res.json({ ok: true, rulModel: model });
});

app.post("/api/instances/:id/initial-values", (req, res) => {
  const state = ensureInstance(req.params.id);
  if (!state) return res.status(404).json({ ok: false, error: "Instance not found" });
  const { ambientTemp, humidity, driveCurrent, speed, adcBits, applyNow } = req.body;

  if (typeof ambientTemp === "number") state.initialValues.ambientTemp = clamp(ambientTemp, -10, 100);
  if (typeof humidity === "number") state.initialValues.humidity = clamp(humidity, 0, 100);
  if (typeof driveCurrent === "number") state.initialValues.driveCurrent = clamp(driveCurrent, 50, 700);
  if (typeof speed === "number") state.initialValues.speed = clamp(speed, 0.25, 8);
  if (typeof adcBits === "number") state.initialValues.adcBits = adcBits >= 12 ? 12 : 10;

  if (applyNow) {
    applyInitialValues(state, true);
  }

  return res.json({ ok: true, initialValues: state.initialValues, state });
});

app.listen(PORT, () => {
  console.log(`Simulator API running on http://localhost:${PORT}`);
  if (MQTT_ENABLED) {
    console.log(`Publishing default sensor samples to MQTT topic: ${MQTT_TOPIC}`);
  }
  console.log(`Default instance id: ${DEFAULT_INSTANCE_ID}`);
});

# Sensor Simulator

React + Node.js simulator for luminaire sensor streams:

- RGB sensor (TCS34725 style RGBC output)
- LDR ADC output
- Ripple monitor output (ESP32 analog input style percent)

This implementation intentionally removes all ML inference features and focuses on sensor simulation and anomaly injection.

## Run

```bash
cd simulator
npm install
npm run install:all
npm run dev
```

- API server: `http://localhost:4000`
- React app: `http://localhost:5173`

## Anomaly Injection

Use the dashboard controls to inject custom values for:

- RGB channels (`R`, `G`, `B`)
- LDR ADC
- Ripple percentage

Each sensor channel can be toggled independently.

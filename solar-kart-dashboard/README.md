# Solar kart telemetry

Real-time battery and motor data from a solar go-kart, streamed from an ESP32 to a live web dashboard.

> Built a real-time data system streaming battery and motor data from a solar go-kart to a live web dashboard.

**Stack:** ESP32, C++ (Arduino framework), Node.js, WebSockets, Chart.js

```
ESP32 on the kart --WiFi/WebSocket--> Node server --WebSocket--> browser dashboard
 (V, A, speed, temp)                  (history + CSV export)      (live gauges + charts)
```

## Try it now (no hardware needed)

```bash
npm install
npm run simulate        # fake kart data
# open http://localhost:3000
```

Tests: `npm test`

## Run it with the real kart

1. **Server** (a laptop or Raspberry Pi on the same network as the kart, or a phone hotspot):
   ```bash
   INGEST_TOKEN=pick-a-secret PACK_V_MIN=20 PACK_V_MAX=29.4 npm start
   ```
   Set `PACK_V_MIN` and `PACK_V_MAX` to your pack's empty and full voltage; the charge estimate is linear between them.
2. **Firmware:** open `firmware/kart_telemetry/` in the Arduino IDE, install the *WebSockets* library by Markus Sattler and the *esp32* board package. Copy `secrets.h.example` to `secrets.h`, fill in WiFi and your laptop's IP, and upload.
3. Open `http://<laptop-ip>:3000` on any phone or laptop.

## Wiring

| Signal | ESP32 pin | Hardware |
|---|---|---|
| Pack voltage | GPIO34 | Divider: pack+ to 100k to pin to 10k to GND (handles up to ~36 V) |
| Motor current | GPIO35 | Hall current sensor (ACS758 or similar). If it runs on 5 V, divide its output down to 3.3 V max |
| Temperature | GPIO32 | 10k NTC thermistor with a 10k resistor to 3.3 V |
| Wheel speed | GPIO27 | Hall sensor plus a magnet on the wheel or axle |

Use ADC1 pins only (32-39). ADC2 pins don't work while WiFi is on.
Share the ground between the ESP32, the sensors and the battery negative. Fuse the voltage divider input.

## Calibrate before you trust it

Edit the CONFIG block at the top of `kart_telemetry.ino`:

- `VOLT_CAL`: adjust until the dashboard voltage matches a multimeter.
- `ZERO_MV`: read the current sensor output with the motor off.
- `WHEEL_CIRC_M` and `MAGNETS_PER_REV`: measure your wheel.

## Features

- Live speed, voltage, current, power and temperature with a connection status indicator
- Rolling charts for the last ~2 minutes, and the server keeps ~30 minutes of history
- Over-temperature warning (set `TEMP_WARN` in `public/index.html`)
- One-click CSV export of the run for analysis in Python or Excel
- Ingest endpoint protected by a shared token

## Ideas for next steps

- Add a solar panel current/voltage channel to chart harvested power
- Store runs in SQLite and compare laps
- GPS for a track map

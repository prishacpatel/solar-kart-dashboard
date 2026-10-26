/*
  Solar go-kart telemetry: ESP32 -> WebSocket -> Node server -> live dashboard.

  Reads pack voltage, motor current, wheel speed and temperature, then sends
  one JSON line about twice a second:  {"v":25.1,"i":12.3,"spd":18.4,"temp":41.2}

  Library needed (Arduino IDE: Tools > Manage Libraries):
    "WebSockets" by Markus Sattler (links2004)
  Board package: "esp32" by Espressif (2.x or newer).

  Calibrate the constants in the CONFIG block against a multimeter before trusting the numbers.
*/
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <math.h>
#include "secrets.h"

// ---------------- CONFIG ----------------
// Pins (ADC1 pins only: ADC2 stops working while WiFi is on)
const int PIN_VOLT  = 34;   // from battery voltage divider
const int PIN_CURR  = 35;   // from current sensor output (through a divider if the sensor is 5 V)
const int PIN_TEMP  = 32;   // NTC thermistor divider
const int PIN_SPEED = 27;   // hall sensor on the wheel/axle

// Voltage divider: Vbat -> R1 -> pin -> R2 -> GND
const float R1 = 100000.0, R2 = 10000.0;
const float VOLT_CAL = 1.000;           // tweak so the dashboard matches your multimeter

// Current sensor (example: ACS758-50B bidirectional, 40 mV/A, 2.5 V at 0 A on 5 V supply,
// then divided down 2:3 to the ESP32). Measure ZERO_MV with the motor off.
const float CURR_DIVIDER = 2.0 / 3.0;   // ratio applied after the sensor (1.0 if none)
const float ZERO_MV      = 2500.0;      // sensor output at 0 A, in mV (before the divider)
const float MV_PER_A     = 40.0;        // sensor sensitivity in mV per amp

// Wheel speed
const int   MAGNETS_PER_REV = 1;
const float WHEEL_CIRC_M    = 1.20;     // wheel circumference in meters

// NTC thermistor (10k at 25 C, beta 3950) with a 10k resistor to 3.3 V
const float NTC_R0 = 10000.0, NTC_BETA = 3950.0, NTC_SERIES_R = 10000.0;

const unsigned long SEND_MS = 500;
// ----------------------------------------

WebSocketsClient ws;
volatile unsigned long pulseCount = 0;
volatile unsigned long lastPulseUs = 0;
unsigned long lastSend = 0, lastPulseSnapshot = 0;

void IRAM_ATTR onPulse() {
  unsigned long now = micros();
  if (now - lastPulseUs > 2000) {      // 2 ms debounce
    pulseCount++;
    lastPulseUs = now;
  }
}

float readMv(int pin) {
  uint32_t sum = 0;
  for (int n = 0; n < 16; n++) sum += analogReadMilliVolts(pin);
  return sum / 16.0;
}

float readPackVolts() {
  float pinMv = readMv(PIN_VOLT);
  return (pinMv / 1000.0) * ((R1 + R2) / R2) * VOLT_CAL;
}

float readAmps() {
  float sensorMv = readMv(PIN_CURR) / CURR_DIVIDER;
  return (sensorMv - ZERO_MV) / MV_PER_A;
}

float readTempC() {
  float mv = readMv(PIN_TEMP);
  if (mv < 20 || mv > 3280) return NAN;               // sensor unplugged or shorted
  float rNtc = NTC_SERIES_R * mv / (3300.0 - mv);
  float k = 1.0 / (1.0 / 298.15 + log(rNtc / NTC_R0) / NTC_BETA);
  return k - 273.15;
}

float readSpeedKmh(unsigned long elapsedMs) {
  noInterrupts();
  unsigned long count = pulseCount;
  interrupts();
  unsigned long delta = count - lastPulseSnapshot;
  lastPulseSnapshot = count;
  float revs = (float)delta / MAGNETS_PER_REV;
  float metersPerSec = revs * WHEEL_CIRC_M / (elapsedMs / 1000.0);
  return metersPerSec * 3.6;
}

void onWsEvent(WStype_t type, uint8_t*, size_t) {
  if (type == WStype_CONNECTED) Serial.println("Connected to server");
  if (type == WStype_DISCONNECTED) Serial.println("Server disconnected, retrying");
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  pinMode(PIN_SPEED, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_SPEED), onPulse, FALLING);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(400); Serial.print("."); }
  Serial.println(WiFi.localIP());

  String path = String("/ingest?token=") + INGEST_TOKEN;
  ws.begin(SERVER_HOST, SERVER_PORT, path);
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(2000);
  lastSend = millis();
}

void loop() {
  ws.loop();
  unsigned long now = millis();
  if (now - lastSend >= SEND_MS) {
    unsigned long elapsed = now - lastSend;
    lastSend = now;

    float temp = readTempC();
    if (isnan(temp)) temp = 0;          // keeps the JSON valid; the dashboard shows 0 if unplugged
    char buf[128];
    snprintf(buf, sizeof(buf), "{\"v\":%.2f,\"i\":%.2f,\"spd\":%.1f,\"temp\":%.1f}",
             readPackVolts(), readAmps(), readSpeedKmh(elapsed), temp);
    if (ws.isConnected()) ws.sendTXT(buf);
    Serial.println(buf);
  }
}

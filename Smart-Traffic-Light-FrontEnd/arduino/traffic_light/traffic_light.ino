// SMART Traffic Light — starter sketch for one intersection (Arduino Uno/Nano).
// Drives 2 sets of red/yellow/green LEDs (North-South, East-West) and one HC-SR04 on the North approach,
// and prints one JSON line per second for the dashboard (Settings > Connect Arduino, 9600 baud).
// The JSON matches the dashboard's live events, so keep the field names when you change things.

// ---- Wiring (change to match your board) ----
const int NS_RED = 2, NS_YELLOW = 3, NS_GREEN = 4;
const int EW_RED = 5, EW_YELLOW = 6, EW_GREEN = 7;
const int TRIG = 9, ECHO = 10;  // HC-SR04: VCC 5V, GND, TRIG, ECHO

// ---- Must match an intersection and sensor id in the dashboard ----
const char *INTERSECTION = "INT-004";  // Plaza Junction
const char *SENSOR = "US-004-N1";       // North approach, lane 1

// ---- Timing in seconds (fixed green; the dashboard simulator adapts green between 12 and 45 s) ----
const int GREEN_SEC = 20, YELLOW_SEC = 3, ALLRED_SEC = 2;
const float NEAR_M = 1.5, MID_M = 3.0, FAR_M = 4.5;

enum Stage { GREEN, YELLOW, ALLRED };
bool nsAxis = true;  // true = North-South has right of way
Stage stage = GREEN;
int remaining = GREEN_SEC;
bool wasPresent = false;
int arrivals = 0;
unsigned long windowStart = 0, lastTick = 0;

void setLights() {
  bool g = stage == GREEN, y = stage == YELLOW;
  digitalWrite(NS_GREEN, nsAxis && g);
  digitalWrite(NS_YELLOW, nsAxis && y);
  digitalWrite(NS_RED, !nsAxis || stage == ALLRED);
  digitalWrite(EW_GREEN, !nsAxis && g);
  digitalWrite(EW_YELLOW, !nsAxis && y);
  digitalWrite(EW_RED, nsAxis || stage == ALLRED);
}

void step() {
  if (--remaining > 0) return;
  if (stage == GREEN) { stage = YELLOW; remaining = YELLOW_SEC; }
  else if (stage == YELLOW) { stage = ALLRED; remaining = ALLRED_SEC; }
  else { stage = GREEN; remaining = GREEN_SEC; nsAxis = !nsAxis; }
}

// Distance in metres, or -1 when nothing is in range.
float readDistance() {
  digitalWrite(TRIG, LOW); delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long us = pulseIn(ECHO, HIGH, 30000UL);  // ~5 m max
  if (us == 0) return -1;
  float m = us * 0.000343 / 2;
  return m <= FAR_M ? m : -1;
}

// Color and seconds-left for one axis, as the dashboard shows them.
void phase(const char *approach, bool mine, bool comma) {
  const char *color;
  int sec;
  if (mine && stage == GREEN) { color = "GREEN"; sec = remaining; }
  else if (mine && stage == YELLOW) { color = "YELLOW"; sec = remaining; }
  else {
    color = "RED";
    // Time until this axis turns green.
    // In all-red, "mine" is the axis that just had green, so it waits out the other axis's full turn.
    if (mine) sec = remaining + GREEN_SEC + YELLOW_SEC + ALLRED_SEC;
    else sec = remaining + (stage == GREEN ? YELLOW_SEC + ALLRED_SEC : stage == YELLOW ? ALLRED_SEC : 0);
  }
  Serial.print("{\"approach\":\""); Serial.print(approach);
  Serial.print("\",\"color\":\""); Serial.print(color);
  Serial.print("\",\"remainingSec\":"); Serial.print(sec);
  Serial.print(comma ? "}," : "}");
}

void sendSignal() {
  bool ns = nsAxis, ew = !nsAxis;
  Serial.print("{\"event\":\"signal.state\",\"data\":{\"intersectionId\":\""); Serial.print(INTERSECTION);
  Serial.print("\",\"mode\":\"FIXED\",\"updatedAt\":\"\",\"phases\":[");
  phase("N", ns, true); phase("S", ns, true); phase("E", ew, true); phase("W", ew, false);
  Serial.println("]}}");
}

void sendLane(float d) {
  bool present = d >= 0;
  const char *level = !present ? "NONE" : d <= NEAR_M ? "NEAR" : d <= MID_M ? "MID" : "FAR";
  Serial.print("{\"event\":\"lane.status\",\"data\":{\"intersectionId\":\""); Serial.print(INTERSECTION);
  Serial.print("\",\"approach\":\"N\",\"lane\":1,\"queueLength\":"); Serial.print(present ? 1 : 0);  // one sensor can't count a queue
  Serial.print(",\"density\":\""); Serial.print(present && d <= NEAR_M ? "MODERATE" : "LOW");
  Serial.print("\",\"cameraCounts\":{},\"sensor\":{\"sensorId\":\""); Serial.print(SENSOR);
  Serial.print("\",\"timestamp\":\"\",\"vehiclePresent\":"); Serial.print(present ? "true" : "false");
  Serial.print(",\"distanceM\":");
  if (present) Serial.print(d, 2); else Serial.print("null");
  Serial.print(",\"distanceLevel\":\""); Serial.print(level);
  Serial.print("\",\"countLast5Min\":"); Serial.print(arrivals);
  Serial.println("}}}");
}

void setup() {
  int pins[] = { NS_RED, NS_YELLOW, NS_GREEN, EW_RED, EW_YELLOW, EW_GREEN, TRIG };
  for (int p : pins) pinMode(p, OUTPUT);
  pinMode(ECHO, INPUT);
  Serial.begin(9600);
  setLights();
}

void loop() {
  if (millis() - lastTick < 1000) return;
  lastTick += 1000;

  step();
  setLights();

  float d = readDistance();
  if (d >= 0 && !wasPresent) arrivals++;
  wasPresent = d >= 0;
  // shortcut: count resets every 5 min instead of a rolling window; fine for a demo.
  if (millis() - windowStart >= 300000UL) { windowStart = millis(); arrivals = 0; }

  sendSignal();
  sendLane(d);
}

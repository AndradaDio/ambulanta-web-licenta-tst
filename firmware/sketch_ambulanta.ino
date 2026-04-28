#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_MLX90614.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include "heartRate.h"
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// CONFIG
const char* ssid = "RETEAUA_TA"; 
const char* parola = "PAROLA_TA"; 
const char* FIREBASE_HOST = "proiect-licenta-tst-default-rtdb.firebaseio.com";

#define LED_ROSU 25                 // GPIO25 status Firebase
#define LED_GALBEN 26               // GPIO26 status WiFi
#define LED_ALBASTRU 27             // GPIO27 deget detectat pe senzor
#define LUNGIME_BUFFER 75           // NR DE SAMPLE-URI CITITE PER CICLU
#define LATIME_ECRAN 128            // rezolutie orizontala ecran OLED
#define INALTIME_ECRAN 64           // rezolutie verticala ecran OLED
#define NR_CITIRI 6                 // NR DE CITIRI PENTRU CALCULUL MEDIEI
const int INTERVAL_FIREBASE = 2000; // INTERVALUL DE TRANSMISIE DATE IN MS

// OBIECTE
Adafruit_SSD1306 ecran(LATIME_ECRAN, INALTIME_ECRAN, &Wire, -1);
Adafruit_MLX90614 senzorTemp;
MAX30105 senzorPuls;

// VARIABILE
float temperatura = 0;// valoare initiala temperatura, puls, spo2
int puls = 0, spo2 = 0;
bool degetDetectat = false;

uint32_t bufferIR[LUNGIME_BUFFER], bufferRosu[LUNGIME_BUFFER];
int32_t valoareSpo2, valoarePuls;
int8_t spo2Valid, pulsValid;

int istoricPuls[NR_CITIRI] = {0};
int indexPuls = 0;
int istoricSpo2[NR_CITIRI] = {0};
int indexSpo2 = 0;

unsigned long ultimaActualizareFirebase = 0;
String sessionId = "";

// UTIL
void setLED(int pin, bool stare) { digitalWrite(pin, stare); }

void genereazaSessionId() {
  sessionId = String(millis()) + String(random(1000, 9999)); // SessionId = millis() + numar aleatoriu
  Serial.println("Session ID: " + sessionId);
}

String httpGET(String url) {
  HTTPClient http; http.begin(url); http.setTimeout(3000);
  String raspuns = (http.GET() == 200) ? http.getString() : "";
  http.end(); return raspuns;
}

void httpPUT(String url, String date) {
  HTTPClient http; http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000);
  http.PUT(date);
  http.end();
}

// SESSION
void sincronizareSession() {
  String url = "https://" + String(FIREBASE_HOST) + "/vitals/nextSession.json";
  String raspuns = httpGET(url);
  raspuns.trim(); raspuns.replace("\"", "");

  if (raspuns != "" && raspuns != "null") {
    // Preluam SessionId existent in Firebase
    sessionId = raspuns;
    Serial.println("Session preluat: " + sessionId);
  } else {
    // Nu exista SessionId, il scriem noi
    httpPUT(url, "\"" + sessionId + "\"");
    Serial.println("Session scris: " + sessionId);
  }
}

// OLED
void actualizeazaEcran() {
  ecran.clearDisplay();
  ecran.setTextSize(2);
  ecran.setTextColor(WHITE);

  ecran.setCursor(0, 0);
  ecran.print("BPM: ");
  ecran.println(puls);

  ecran.setCursor(0, 22);
  ecran.print("SpO2: ");
  ecran.print(spo2);
  ecran.println("%");

  ecran.setCursor(0, 44);
  ecran.print("Temp:");
  ecran.print(temperatura, 1);
  ecran.println("C");

  ecran.display();
}

// SETUP
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);     // SDA = GPIO21, SCL = GPIO22
  Wire.setClock(100000);  // viteza I2C standard 100kHz

  pinMode(LED_ROSU, OUTPUT);
  pinMode(LED_GALBEN, OUTPUT);
  pinMode(LED_ALBASTRU, OUTPUT);

  setLED(LED_ROSU, LOW);
  setLED(LED_GALBEN, LOW);
  setLED(LED_ALBASTRU, LOW);

  if (!ecran.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {  // adresa I2C ecran OLED: 0x3C
    Serial.println("OLED FAIL");
    while (1);
  }
  ecran.clearDisplay();
  ecran.display();

  randomSeed(analogRead(0));  // initializare generator aleatoriu pentru SessionId
  genereazaSessionId();

  // WiFi
  WiFi.begin(ssid, parola);
  Serial.print("WiFi...");
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 10000) { // timeout 10 secunde
    delay(500); Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi OK");
    setLED(LED_GALBEN, HIGH); // WiFi conectat LED galben aprins
    sincronizareSession();
  } else {
    Serial.println("\nFara WiFi");
    setLED(LED_GALBEN, LOW);
  }

  // Senzori
  Serial.println("=== INIT SENZORI ===");
  Serial.println(senzorTemp.begin() ? "MLX90614 OK" : "MLX90614 FAIL"); 

  if (!senzorPuls.begin(Wire)) {
    Serial.println("MAX30102 FAIL");
    while (1);
  }
  Serial.println("MAX30102 OK");

// Configurare MAX30102: luminozitate LED, mediere sample-uri, mod LED, rata esantionare, latimea pulsului
  senzorPuls.setup(50, 2, 2, 200, 411, 4096);
  senzorPuls.setPulseAmplitudeRed(0x0A);
  senzorPuls.setPulseAmplitudeGreen(0);
}

// SENZORI
void citireSenzori() {
  float t = senzorTemp.readObjectTempC();
  if (!isnan(t) && t > 0) temperatura = t;

  for (byte i = 0; i < LUNGIME_BUFFER; i++) {
    unsigned long tt = millis();
    while (!senzorPuls.available()) {
      if (millis() - tt > 2000) { setLED(LED_ALBASTRU, LOW); return; }  // timeout 2 secunde
      senzorPuls.check();
    }
    bufferRosu[i] = senzorPuls.getRed();
    bufferIR[i] = senzorPuls.getIR();
    senzorPuls.nextSample();
  }

  // Valori IR sub 10000 indica absenta degetului pe senzor
  if (bufferIR[LUNGIME_BUFFER - 1] < 10000) {
    degetDetectat = false; puls = 0; spo2 = 0;
    setLED(LED_ALBASTRU, LOW);
    return;
  }

  degetDetectat = true;
  setLED(LED_ALBASTRU, HIGH); // deget detectat LED albastru aprins

  // ALGORITMUL TEXAS INSTRUMENTS pentru BPM si SpO2
  // Returneaza valorile impreuna cu indicatori de validitate
  maxim_heart_rate_and_oxygen_saturation(
    bufferIR, LUNGIME_BUFFER, bufferRosu,
    &valoareSpo2, &spo2Valid,
    &valoarePuls, &pulsValid
  );

  // Mediere SpO2
  if (spo2Valid && valoareSpo2 > 70 && valoareSpo2 <= 100) {
    istoricSpo2[indexSpo2] = valoareSpo2;
    indexSpo2 = (indexSpo2 + 1) % NR_CITIRI;

    int suma = 0, count = 0;
    for (int i = 0; i < NR_CITIRI; i++) {
      if (istoricSpo2[i] > 0) { suma += istoricSpo2[i]; count++; }
    }
    if (count > 0) spo2 = suma / count;
  }

  // Mediere BPM
  if (pulsValid && valoarePuls > 40 && valoarePuls < 150) {
    istoricPuls[indexPuls] = valoarePuls;
    indexPuls = (indexPuls + 1) % NR_CITIRI;

    int suma = 0, count = 0;
    for (int i = 0; i < NR_CITIRI; i++) {
      if (istoricPuls[i] > 0) { suma += istoricPuls[i]; count++; }
    }
    if (count > 0) puls = suma / count;
  }
}

// FIREBASE
void trimitereFirebase() {
  if (WiFi.status() != WL_CONNECTED) {
    setLED(LED_ROSU, LOW);
    setLED(LED_GALBEN, LOW);
    return;
  }

  // Serializare date vitale in format JSON pentru Firebase Realtime Database
  String url = "https://" + String(FIREBASE_HOST) + "/vitals/live.json";
  String date = "{\"bpm\":" + String(puls) +
                ",\"spo2\":" + String(spo2) +
                ",\"temperature\":" + String(temperatura, 1) +
                ",\"fingerDetected\":" + (degetDetectat ? "true" : "false") +
                ",\"sessionId\":\"" + sessionId +
                "\",\"timestamp\":" + String(millis()) + "}";

  HTTPClient http; http.begin(url);
  http.addHeader("Content-Type", "application/json");
  int cod = http.PUT(date); // metoda HTTP PUT pentru actualizare periodica

  if (cod == 200) setLED(LED_ROSU, HIGH); // transmisie reusita LED rosu aprins
  else setLED(LED_ROSU, LOW);

  http.end();
}

void verificareReset() {
  if (WiFi.status() != WL_CONNECTED) return;

  String raspuns = httpGET("https://" + String(FIREBASE_HOST) + "/vitals/nextSession.json");
  raspuns.trim(); raspuns.replace("\"", "");

  // Daca SessionId din Firebase difera de cel curent se initiaza in aplicatia web o sesiune noua 
  if (raspuns != "" && raspuns != "null" && raspuns != sessionId) {
    sessionId = raspuns;
    Serial.println("Session nou: " + sessionId);
  }
}

// LOOP
void loop() {
  setLED(LED_GALBEN, WiFi.status() == WL_CONNECTED);  // actualizare continua status WiFi

  citireSenzori();
  actualizeazaEcran();

  if (millis() - ultimaActualizareFirebase >= INTERVAL_FIREBASE) {
    ultimaActualizareFirebase = millis();
    trimitereFirebase();
    verificareReset();
  }
}

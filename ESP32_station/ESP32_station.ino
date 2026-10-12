#include <sstream>
#include <string>

#include <WiFi.h>
// #define MQTT_MAX_PACKET_SIZE 2048
#include <PubSubClient.h>
// Bluetooth LE
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

/* Add WiFi and MQTT credentials to credentials.h file */
#include "credentials.h"


// #ifdef __cplusplus
// extern "C" {
// #endif
//   uint8_t temprature_sens_read();
// #ifdef __cplusplus
// }
// #endif

// Scan time must be longer than the wearable/beacon advertising interval.
const int beaconScanTime = 4;
const uint8_t maxTrackedDevices = 50;
const size_t mqttBufferSize = 8192;
const char* healthBandNamePrefix = "HealthBand";
// Calibrate this by measuring the wearable RSSI at one metre in the intended
// mounting/orientation. It is not the radio's configured transmit level.
const int healthBandRssiAtOneMeter = -69;
WiFiClient espClient;
PubSubClient client(espClient);

// We collect one (strongest) sample per device during each scan. The advertised
// name lets the dashboard distinguish the HealthBand wearable from ordinary
// beacons without making the wearable connect to the receiver stations.
typedef struct {
  char address[18];   // 67:f1:d2:04:cd:5d plus terminator
  int rssi;
  char name[32];
  bool isHealthBand;
} BeaconData;

uint8_t bufferIndex = 0;  // Found devices counter
BeaconData buffer[maxTrackedDevices];
uint8_t message_char_buffer[mqttBufferSize];

bool hasPrefixIgnoreCase(const String& value, const char* prefix) {
  String normalizedValue = value;
  String normalizedPrefix = String(prefix);
  normalizedValue.toLowerCase();
  normalizedPrefix.toLowerCase();
  return normalizedValue.startsWith(normalizedPrefix);
}

void appendJsonString(String& output, const char* value) {
  output += '"';
  while (*value) {
    const char current = *value++;
    if (current == '"' || current == '\\') {
      output += '\\';
    }
    if (static_cast<uint8_t>(current) >= 0x20) {
      output += current;
    }
  }
  output += '"';
}

/*
 * Construct SenML compatible message with multiple measurements
 * see:
 * https://tools.ietf.org/html/draft-jennings-senml-10
 * Internal temp sensor:
 * https://github.com/pcbreflux/espressif/blob/master/esp32/arduino/sketchbook/ESP32_int_temp_sensor/ESP32_int_temp_sensor.ino
 */

class MyAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
public:

  void onResult(BLEAdvertisedDevice advertisedDevice) {
    extern uint8_t bufferIndex;
    extern BeaconData buffer[];
    const String address = advertisedDevice.getAddress().toString().c_str();
    const int rssi = advertisedDevice.haveRSSI() ? advertisedDevice.getRSSI() : 0;
    uint8_t index = bufferIndex;
    for (uint8_t i = 0; i < bufferIndex; i++) {
      if (address.equalsIgnoreCase(buffer[i].address)) {
        index = i;
        break;
      }
    }
    if (index == bufferIndex) {
      if (bufferIndex >= maxTrackedDevices) {
        return;
      }
      memset(&buffer[index], 0, sizeof(BeaconData));
      strlcpy(buffer[index].address, address.c_str(), sizeof(buffer[index].address));
      buffer[index].rssi = rssi;
      bufferIndex++;
    } else if (rssi > buffer[index].rssi) {
      buffer[index].rssi = rssi;
    }

    if (advertisedDevice.haveName()) {
      const String name = advertisedDevice.getName().c_str();
      strlcpy(buffer[index].name, name.c_str(), sizeof(buffer[index].name));
      buffer[index].isHealthBand = hasPrefixIgnoreCase(name, healthBandNamePrefix);
    }
    // Print everything via serial port for debugging
    Serial.printf("MAC: %s \n", address.c_str());
    Serial.printf("name: %s \n", buffer[index].name);
    Serial.printf("kind: %s \n", buffer[index].isHealthBand ? "healthband" : "beacon");
    Serial.printf("RSSI: %d \n", rssi);
  }
};

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32 Station Starting...");
  
  // Reduce CPU frequency to save power and reduce noise
  // This helps ensure stable operation when powered from external USB adapters
  // Tests show ESP32 works fine with computer/powerbank power, but may fail 
  // to send MQTT messages with some external USB adapters due to power issues
  setCpuFrequencyMhz(160); // Default is 240MHz, reduce to 160MHz
  
  Serial.print("WiFi MAC Address: ");
  Serial.println(WiFi.macAddress());
  
  // Add startup delay to allow ESP32 to fully initialize
  delay(3000); // Increased delay for power stabilization
  
  // Set WiFi to station mode and disconnect from any previous connections
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
  
  // Set WiFi power to reduce consumption and noise
  // Lower power consumption helps with stability on external USB power adapters
  WiFi.setTxPower(WIFI_POWER_20dBm);
  WiFi.setSleep(false);
  
  BLEDevice::init(""); // Can only be called once
  
  // Reduce BLE power
  // Lower BLE power consumption improves stability with external USB power adapters
  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_DEFAULT, ESP_PWR_LVL_P3); // Reduce BLE power
  
  // Names and identity metadata make reports larger than the legacy {m,r}
  // payload, especially in busy rooms.
  client.setBufferSize(mqttBufferSize);
  
  // Additional delay after BLE init
  delay(2000);
}

void connectWiFi() {
  // Ensure WiFi is in the right mode
  WiFi.mode(WIFI_STA);
  delay(100);
  
  WiFi.begin(ssid, password);
  
  int wifi_attempts = 0;
  int max_attempts = 30; // 15 seconds timeout
  
  while (WiFi.status() != WL_CONNECTED && wifi_attempts < max_attempts) {
    delay(500);
    wifi_attempts++;
    Serial.println("Connecting to WiFi..");
    
    // Feed watchdog to prevent reset during connection
    yield();
    
    // If taking too long, restart WiFi
    if (wifi_attempts == 20) {
      WiFi.disconnect();
      delay(1000);
      WiFi.begin(ssid, password);
    }
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Connected to the WiFi network");
    Serial.print("My MAC Address: ");
    Serial.println(WiFi.macAddress());
  } else {
    Serial.println("WiFi connection failed, restarting...");
    ESP.restart();
  }
}

void connectMQTT() {
  client.setServer(mqttServer, mqttPort);
  Serial.println("Connecting to MQTT...");
  Serial.print("Station MAC: ");
  Serial.println(WiFi.macAddress());
  
  // Create unique client ID using MAC address
  String clientId = "ESP32_" + WiFi.macAddress();
  clientId.replace(":", ""); // Remove colons from MAC address
  
  Serial.print("MQTT Client ID: ");
  Serial.println(clientId);
  
  int mqtt_attempts = 0;
  int max_mqtt_attempts = 5;
  
  while (!client.connected() && mqtt_attempts < max_mqtt_attempts) {
    Serial.print("MQTT attempt ");
    Serial.println(mqtt_attempts + 1);
    
    if (client.connect(clientId.c_str(), mqttUser, mqttPassword)) {
      Serial.println("MQTT connected successfully");
      break;
    } else {
      Serial.print("MQTT failed with state ");
      Serial.println(client.state());
      mqtt_attempts++;
      delay(2000 * mqtt_attempts); // Exponential backoff
      
      // Feed watchdog
      yield();
    }
  }
  
  // If MQTT connection failed after multiple attempts, restart ESP32
  if (!client.connected()) {
    Serial.println("MQTT connection failed completely, restarting...");
    ESP.restart();
  }
}

void ScanBeacons() {
  Serial.println("Starting BLE scan...");
  
  // Add small delay before scan to stabilize power
  delay(500);
  
  BLEScan* pBLEScan = BLEDevice::getScan();
  MyAdvertisedDeviceCallbacks cb;
  pBLEScan->setAdvertisedDeviceCallbacks(&cb);
  pBLEScan->setActiveScan(true);
  
  // Feed watchdog before scan
  yield();
  
  BLEScanResults* foundDevices = pBLEScan->start(beaconScanTime);
  
  Serial.print("Devices found: ");
  Serial.println(bufferIndex);
  
  // for (uint8_t i = 0; i < bufferIndex; i++) {
  //   Serial.print(buffer[i].address);
  //   Serial.print(" : ");
  //   Serial.println(buffer[i].rssi);
  // }
  
  // Stop BLE and add delay for power stabilization
  pBLEScan->stop();
  delay(1000);
  Serial.println("BLE scan completed!");
}

void loop() {
  boolean result = false;
  
  Serial.println("\n--- Loop Start ---");
  
  // Add delay at start of loop to prevent overwhelming the system
  delay(500); // Increased delay
  
  // Feed watchdog
  yield();
  
  // Check WiFi first, reconnect if needed
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected, reconnecting...");
    connectWiFi();
  }
  
  // Check MQTT connection
  if (!client.connected()) {
    Serial.println("MQTT disconnected, reconnecting...");
    connectMQTT();
  }
  
  // Ensure both connections are stable before proceeding
  if (WiFi.status() == WL_CONNECTED && client.connected()) {
    Serial.println("Both WiFi and MQTT connected, proceeding with scan...");
    
    // Scan Beacons
    ScanBeacons();
    
    // Feed watchdog after BLE scan
    yield();
    
    // Small delay before MQTT operations for power stabilization
    delay(500);
    
    client.loop();
    yield();
    
    // Build and send payload
    String payloadString = "{\"v\":2,\"e\":[";
    payloadString.reserve(mqttBufferSize);
    for(uint8_t i = 0; i < bufferIndex; i++) {
      payloadString += "{\"m\":\"";
      payloadString += String(buffer[i].address);
      payloadString += "\",\"r\":";
      payloadString += String(buffer[i].rssi);
      payloadString += ",\"k\":\"";
      payloadString += (buffer[i].isHealthBand ? "healthband" : "beacon");
      payloadString += '"';
      if (buffer[i].name[0] != '\0') {
        payloadString += ",\"n\":";
        appendJsonString(payloadString, buffer[i].name);
      }
      if (buffer[i].isHealthBand) {
        payloadString += ",\"p\":";
        payloadString += String(healthBandRssiAtOneMeter);
      }
      payloadString += '}';
      if(i < bufferIndex-1) {
        payloadString += ',';
      }
    }
    // SenML ends. Add this stations MAC
    payloadString += "],\"st\":\"";
    payloadString += String(WiFi.macAddress());
    // Add board temperature in fahrenheit
    payloadString += "\",\"t\":\"";
    payloadString += String(temperatureRead());
    payloadString += "\"}";
    
    Serial.print("Runtime buffer size: ");
    Serial.println(client.getBufferSize());
    Serial.print("Payload length: ");
    Serial.println(payloadString.length());
    Serial.println("Payload: ");
    Serial.println(payloadString);
    
    if (payloadString.length() >= mqttBufferSize) {
      Serial.println("Payload exceeds MQTT buffer; skipping publish");
      bufferIndex = 0;
      delay(2000);
      return;
    }
    payloadString.getBytes(message_char_buffer, payloadString.length()+1);
    
    // Try to publish with retry logic and better error handling
    int publish_attempts = 0;
    while (!result && publish_attempts < 3) {
      Serial.print("Publishing attempt ");
      Serial.println(publish_attempts + 1);
      
      // Add small delay before publish for power stabilization
      delay(100);
      
      result = client.publish("/beacons/office", message_char_buffer, payloadString.length(), false);
      
      if (!result) {
        Serial.println("Publish failed, retrying...");
        delay(1000);
        client.loop(); // Ensure MQTT client processes any pending messages
        yield();
      } else {
        Serial.println("Publish successful!");
      }
      publish_attempts++;
    }
    
    Serial.print("Final PUB Result: ");
    Serial.println(result ? "SUCCESS" : "FAILED");
    
  } else {
    Serial.println("Connections not stable, skipping this loop iteration");
  }
  
  //Start over the scan loop
  bufferIndex = 0;
  
  // Longer delay to reduce power consumption and allow system recovery
  delay(2000);
  
  // Feed watchdog one more time
  yield();
  
  Serial.println("--- Loop End ---\n");
}

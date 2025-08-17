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


#ifdef __cplusplus
extern "C" {
#endif
  uint8_t temprature_sens_read();
#ifdef __cplusplus
}
#endif

//Scan time must be longer than beacon interval
int beaconScanTime = 4;
WiFiClient espClient;
PubSubClient client(espClient);

// We collect each device MAC and RSSI
typedef struct {
  char address[17];   // 67:f1:d2:04:cd:5d
  int rssi;
} BeaconData;

uint8_t bufferIndex = 0;  // Found devices counter
BeaconData buffer[50];    // Buffer to store found device data
uint8_t message_char_buffer[MQTT_MAX_PACKET_SIZE];

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
    if(bufferIndex >= 50) {
      return;
    }
    // RSSI
    if(advertisedDevice.haveRSSI()) {
      buffer[bufferIndex].rssi = advertisedDevice.getRSSI();
    } else { buffer[bufferIndex].rssi =  0; }
    
    // MAC is mandatory for BT to work
    strcpy (buffer[bufferIndex].address, advertisedDevice.getAddress().toString().c_str());
    
    bufferIndex++;
    // Print everything via serial port for debugging
    Serial.printf("MAC: %s \n", advertisedDevice.getAddress().toString().c_str());
    Serial.printf("name: %s \n", advertisedDevice.getName().c_str());
    Serial.printf("RSSI: %d \n", advertisedDevice.getRSSI());   
  }
};

void setup() {
  Serial.begin(115200);
  Serial.println("ESP32 Station Starting...");
  
  // Reduce CPU frequency to save power and reduce noise
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
  WiFi.setTxPower(WIFI_POWER_20dBm);
  WiFi.setSleep(false);
  
  BLEDevice::init(""); // Can only be called once
  
  // Reduce BLE power
  esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_DEFAULT, ESP_PWR_LVL_P1); // Reduce BLE power
  
  // Set MQTT buffer size to 2048 bytes
  client.setBufferSize(2048);
  
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
    String payloadString = "{\"e\":[";
    for(uint8_t i = 0; i < bufferIndex; i++) {
      payloadString += "{\"m\":\"";
      payloadString += String(buffer[i].address);
      payloadString += "\",\"r\":\"";
      payloadString += String(buffer[i].rssi);
      payloadString += "\"}";
      if(i < bufferIndex-1) {
        payloadString += ',';
      }
    }
    // SenML ends. Add this stations MAC
    payloadString += "],\"st\":\"";
    payloadString += String(WiFi.macAddress());
    // Add board temperature in fahrenheit
    payloadString += "\",\"t\":\"";
    payloadString += String(temprature_sens_read());
    payloadString += "\"}";
    
    Serial.print("Runtime buffer size: ");
    Serial.println(client.getBufferSize());
    Serial.print("Payload length: ");
    Serial.println(payloadString.length());
    Serial.println("Payload: ");
    Serial.println(payloadString);
    
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

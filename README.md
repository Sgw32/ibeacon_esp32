# ESP32 iBeacon Indoor Positioning System (IPS)
This is a small demo application showing how to use **ESP32 modules** as anchors/stations to do indoor positioning of iBeacon tags (tagged people, dogs, cats and objects) with trilateration.

**A minimum of three ESP32 modules are needed** to run the application, since this is required to do the trilateration.


## Getting Started

### Installation

#### Mosquitto MQTT Broker (server)
MacOS using [homebrew](https://brew.sh)
```bash
$ brew install mosquitto
```

Ubuntu 16.04 using apt
```bash
$ sudo apt install mosquitto
```

Other Platforms
* For other platforms e.g. Windows, check out https://mosquitto.org/download/

#### Node.js and NPM for running the web dashboard

**⚠️ Important: Node.js Version Compatibility**

This project was built with older dependencies and requires **Node.js 16** to run properly. Modern Node.js versions (18+) will cause compatibility issues.

##### Option 1: Use Node.js 16 (Recommended)

Install Node Version Manager (nvm) and use Node.js 16:

**MacOS/Linux:**
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal or source profile
source ~/.zshrc  # or ~/.bash_profile

# Install and use Node.js 16
nvm install 16
nvm use 16

# Verify version
node --version  # Should show v16.x.x
```

**Alternative installation via package managers:**

MacOS using [homebrew](https://brew.sh)
```bash
$ brew install node@16
$ brew link node@16 --force
```

Ubuntu 16.04+ using NodeSource repository
```bash
$ curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
$ sudo apt-get install -y nodejs
```

##### Option 2: Use Docker (Alternative)

If you prefer to use Docker and avoid Node.js version management:

```bash
# Navigate to the dashboard directory
cd dashboard/

# Create a Dockerfile
cat > Dockerfile << EOF
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
EOF

# Build the Docker image
docker build -t esp32-dashboard .

# Run the dashboard in Docker
docker run -p 3000:3000 esp32-dashboard
```

**Note!** You may need to install some extra libraries via NPM e.g. *chalk*. You will see an error if so, when you run the dashboard.

```bash
$ npm install chalk
```

#### ESP32 IDE and libraries
You can either use the [Arduino IDE](https://www.arduino.cc/en/Main/Software) or [PlatformIO](https://platformio.org) for [Visual Studio Code](https://code.visualstudio.com) to upload the code to the ESP32.

If you are not familiar with PlatformIO and Visual Studio Code (vscode), then I can highly recommend you to check it out. vscode is a very nice IDE for programming whatever, and PlatformIO is a nice way to program Arduino's and ESP32 in general with good code completion.

**Arduino BLE and MQTT libraries**

You need the following library, which can be installed from the Arduino IDE Library Manager or PlatformIO:
* [PubSubClient](https://pubsubclient.knolleary.net)

**Note about ESP32 BLE Arduino:** The [ESP32 BLE Arduino](https://github.com/nkolban/ESP32_BLE_Arduino) repository is now deprecated. The BLE code is now part of the ESP32 Arduino core, making it automatically available to any Arduino ESP32 project without the need for manual import. For more information, see [ESP32 Arduino BLE Library](https://github.com/espressif/arduino-esp32/tree/master/libraries/BLE).

**Note!** See **Troubleshooting** section below in regards to `PubSubClient` and packet size (MQTT_MAX_PACKET_SIZE). There may be problems in sending too much data if a station finds too many beacons. Check the serial console for an ESP32 and make sure that it prints out `PUB Result: 1`. If it prints `PUB Result: 0` there may be a problem transmitting the json data to the MQTT server. This can be fixed by changing `MQTT_MAX_PACKET_SIZE` in the `PubSubClient` library.

### Setup and running
#### Mosquitto MQTT Broker (server)
Edit the file `mosquitto-demo.conf`. Set the path to acl files, like:

```bash
acl_file /home/w3/Downloads/iBeacon-indoor-positioning-demo/mosquitto_acl.config
password_file /home/w3/Downloads/iBeacon-indoor-positioning-demo/mosquitto_pw.config
```

Start mosquitto with the following command:
```bash
$ mosquitto -v -c ./mosquitto-demo.conf
```

MQTT users are "station" and "dashboard", and all passwords are "bledemo".

**Note!** :On MacOS mosquitto may not be a recognized command after installation. You will then need to add mosquitto to PATH, like so and restart your terminal:

```bash
$ sudo echo 'export PATH="/usr/local/sbin:$PATH"' >> ~/.bash_profile
```

#### ESP32 stations
Edit the file `credentials.h` and change wifi ssid and password, and also change `mqttServer` to the IP of the computer running the mosquitto server. Upload the Arduino sketch `ESP32_station.ino` to your ESP32.

Place the ESP32 modules around the area where you want to do positioning, preferably 10-15 meters appart and also in wifi range.

**Power Supply Considerations:**
The ESP32 code includes power consumption optimizations (reduced CPU frequency, WiFi power, and BLE power) to ensure stable operation when powered from external USB adapters. Tests have shown that ESP32 modules communicate reliably over MQTT when powered from computers or power banks, but may fail to send MQTT messages when powered from some external USB power adapters due to insufficient power delivery. The power optimizations in the code help ensure stable operation regardless of the power source.

ESP32 modules will work as iBeacon monitoring stations, reporting all found bluetooth beacons to the MQTT topic, with their MAC address and RSSI.

#### Web dashboard

The dashboard is a simple React app, connecting to the mosquitto MQTT server and showing each beacon on screen.

##### Option 1: Run with Node.js 16

**Ensure you're using Node.js 16** (see installation instructions above):

```bash
# Switch to Node.js 16 if using nvm
nvm use 16

# Navigate to dashboard folder
cd dashboard/

# Install dependencies (you may see deprecation warnings - this is normal for this older project)
npm install

# Start the development server
npm start
```

##### Option 2: Run with Docker

If you created the Docker setup earlier:

```bash
cd dashboard/

# Run the containerized dashboard
docker run -p 3000:3000 esp32-dashboard
```

**Access the dashboard:**
A browser window will automatically open the dashboard react app, else go to [http://localhost:3000/](http://localhost:3000/)

Stations and beacons will show up on the map when at least three ESP32 stations are connected.

<!-- ![Screenshot](screenshot.jpg) -->

<img src="screenshot.jpg" alt="Screenshot" width="500">

## Troubleshooting

### Node.js Compatibility Issues

If you encounter errors like `Error: No such module: http_parser` when running `npm start`, this means you're using an incompatible Node.js version.

**Solution:**
1. **Check your Node.js version**: `node --version`
2. **If using Node.js 18+ or 24+**: Switch to Node.js 16 using nvm:
   ```bash
   nvm install 16
   nvm use 16
   npm start
   ```
3. **Alternative**: Use the Docker approach described above

**Common Node.js errors with this project:**
- `Error: No such module: http_parser` → Use Node.js 16
- `Error: Cannot find module 'process/browser'` → Use Node.js 16
- OpenSSL legacy provider errors → Use Node.js 16

### PubSubClient MQTT_MAX_PACKET_SIZE
The **PubSubClient** library may have problems sending big packages to the MQTT server e.g. when ESP32 finds many beacons. Initially, setting `#define MQTT_MAX_PACKET_SIZE` to 2048 in the Arduino sketch was attempted, but this did not work reliably. Manually editing the original library files was also tried but proved problematic.

**Current Solution:**
The issue is now resolved by using the PubSubClient library's built-in method to set the buffer size dynamically:

```cpp
// Set MQTT buffer size to 2048 bytes
client.setBufferSize(2048);
```

This approach works reliably and doesn't require modifying library files. The `setBufferSize()` method should be called before connecting to the MQTT server, as implemented in the current ESP32 station code.

## TODO
* improve accuracy (average value, faster beacons, sync stations)
* add beacon MAC whitelist to sidebar
* add server settings to sidebar
* add properties to beacon icons
* connect to iTAG's
* ... what else?

## Acknowledgement
The initial code is forked and derived from the example by @jarkko-hautakorpi
https://github.com/jarkko-hautakorpi/iBeacon-indoor-positioning-demo.
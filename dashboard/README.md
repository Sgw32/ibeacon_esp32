# iBeacon indoor positioning dashboard

A browser dashboard that receives BLE observations over MQTT/WebSocket and
plots estimated positions of ordinary beacons and HealthBand wearables. ESP32
stations are fixed receiver anchors; the dashboard never treats a reporting
station as the moving target.

## Data flow

1. Place and flash at least three ESP32 stations.
2. Drag each receiver bullseye to its measured floor-plan position.
3. Leave HealthBand advertising with a name beginning with `HealthBand`.
4. Each station publishes RSSI and advertised name/type. For HealthBand it
   also sends the configured one-metre RSSI calibration. The dashboard
   highlights HealthBand separately and calculates it from three observations
   no older than 20 seconds.

Version 2 station events have the form
`{"m":"device-mac","r":-67,"k":"healthband","n":"HealthBand","p":-69}`.
The parser remains compatible with legacy `{m,r}` beacon events. `p` is
optional and means calibrated RSSI at one metre (not configured radio output
power); when absent, the dashboard uses its default calibration.

The dashboard estimates location centrally. HealthBand does not need to scan
iBeacons or publish MQTT itself; its existing BLE advertisement is the signal
measured by the fixed ESP32 receivers. The embedded HealthBand adapter keeps
advertising while a phone GATT connection is active.

## Requirements

- Node.js 22.12 or newer (including Node.js 25)
- An MQTT broker with WebSocket support at the address configured in
  `src/MessageStack/config.js`

## Development

```sh
npm install
npm start
```

The development server listens on <http://localhost:3000> and on the local
network. The browser must be able to reach the configured MQTT WebSocket port.

## Checks and production build

```sh
npm test
npm run build
npm run preview
```

The production bundle is written to `build/`.

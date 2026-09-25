# iBeacon indoor positioning dashboard

A browser dashboard that receives beacon observations over MQTT/WebSocket and
plots estimated positions on a floor plan.

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

const normalizeMac = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const finiteNumber = (value) => value === null || value === '' ? NaN : Number(value);

const cloneObservations = (observations) => Object.fromEntries(
    Object.entries(observations).map(([mac, readings]) => [mac, {...readings}])
);

export const createObservationStore = () => ({
    beacons: {},
    devices: {},
    stations: []
});

export const ingestObservationMessage = (store, payload, now = Date.now()) => {
    const message = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!message || !Array.isArray(message.e) || typeof message.st !== 'string') {
        throw new Error('Message does not contain st and e fields');
    }

    const stationMac = normalizeMac(message.st);
    if (!stationMac) {
        throw new Error('Message contains an empty station MAC');
    }
    if (!store.stations.includes(stationMac)) {
        store.stations.push(stationMac);
    }

    // A receiver is an anchor, never a tracked target. Purging here also fixes
    // the case where it was observed before its first own MQTT report arrived.
    delete store.beacons[stationMac];
    delete store.devices[stationMac];

    const deviceMacs = [];
    message.e.forEach(event => {
        const mac = normalizeMac(event?.m);
        const rssi = finiteNumber(event?.r);
        if (!mac || store.stations.includes(mac) || !Number.isFinite(rssi)) return;

        if (!store.beacons[mac]) store.beacons[mac] = {};
        store.beacons[mac][stationMac] = {rssi, timestamp: now};

        const previous = store.devices[mac] || {};
        const advertisedName = typeof event?.n === 'string' ? event.n : '';
        const advertisedTxPower = finiteNumber(event?.p);
        const isHealthBand = event?.k === 'healthband' || advertisedName.toLowerCase().startsWith('healthband');
        store.devices[mac] = {
            mac,
            name: advertisedName || previous.name || '',
            kind: isHealthBand ? 'healthband' : previous.kind || 'beacon',
            txPower: Number.isFinite(advertisedTxPower) ? advertisedTxPower : previous.txPower,
            lastSeenAt: now
        };
        deviceMacs.push(mac);
    });

    return {
        beacons: cloneObservations(store.beacons),
        devices: {...store.devices},
        metadata: {
            stationMac,
            deviceMacs,
            eventCount: message.e.length,
            protocolVersion: Number(message.v) || 1,
            receivedAt: now
        }
    };
};

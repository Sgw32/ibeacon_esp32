export const trilaterate = (points) => {
    const [[x1, y1, r1], [x2, y2, r2], [x3, y3, r3]] = points;
    const a = 2 * (x2 - x1);
    const b = 2 * (y2 - y1);
    const c = r1 ** 2 - r2 ** 2 - x1 ** 2 + x2 ** 2 - y1 ** 2 + y2 ** 2;
    const d = 2 * (x3 - x1);
    const e = 2 * (y3 - y1);
    const f = r1 ** 2 - r3 ** 2 - x1 ** 2 + x3 ** 2 - y1 ** 2 + y3 ** 2;
    const determinant = a * e - b * d;

    if (Math.abs(determinant) < Number.EPSILON) {
        return null;
    }

    return [(c * e - b * f) / determinant, (a * f - c * d) / determinant];
};

export const DEFAULT_TX_POWER = -69;
export const DEFAULT_PATH_LOSS_EXPONENT = 3;
export const DEFAULT_MAX_OBSERVATION_AGE_MS = 20000;

export const lowPass = (previousValue, currentValue, alpha) =>
    alpha * currentValue + (1 - alpha) * previousValue;

export const calculateDistance = (rssi, txPower = DEFAULT_TX_POWER, pathLossExponent = DEFAULT_PATH_LOSS_EXPONENT) =>
    Math.pow(10, ((txPower - rssi) / (10 * pathLossExponent)));

export const locateWithDebug = (beacon, stations, pixelsPerMeter, options = {}) => {

    // ITAG -70 ... -94
    // Samsung -73 ... -95

    // RSSI = TxPower - 10 * n * lg(d)
    // n = 2...4
    // d = 10^(TxPower - RSSI) / (10 * n))

    const now = options.now ?? Date.now();
    const maxObservationAgeMs = options.maxObservationAgeMs ?? DEFAULT_MAX_OBSERVATION_AGE_MS;
    const txPower = options.txPower ?? DEFAULT_TX_POWER;
    const pathLossExponent = options.pathLossExponent ?? DEFAULT_PATH_LOSS_EXPONENT;
    const stationKeys = Object.keys(beacon).filter(key => stations[key]);
    const freshStationKeys = stationKeys.filter(key => {
        const timestamp = beacon[key].timestamp;
        return !Number.isFinite(timestamp) || now - timestamp <= maxObservationAgeMs;
    });
    const keysSorted = freshStationKeys.sort(function (a, b) {
        return beacon[a].rssi - beacon[b].rssi
    }).reverse().slice(0, 3);

    if (keysSorted.length < 3) {
        return {
            position: null,
            status: `Need 3 fresh positioned stations; have ${keysSorted.length}`,
            selectedStations: keysSorted,
            measurements: [],
            staleStationCount: stationKeys.length - freshStationKeys.length
        };
    }

    const measurements = keysSorted.map(stationMac => {
        const distanceMeters = calculateDistance(beacon[stationMac].rssi, txPower, pathLossExponent);
        return {
            stationMac,
            stationX: Number(stations[stationMac].x),
            stationY: Number(stations[stationMac].y),
            rssi: beacon[stationMac].rssi,
            observedAt: beacon[stationMac].timestamp,
            distanceMeters,
            distancePixels: distanceMeters * pixelsPerMeter
        };
    });

    const input = measurements.map(item => [item.stationX, item.stationY, item.distancePixels]);

    const output = trilaterate(input);
    if (output === null || !output.every(Number.isFinite)) {
        return {
            position: null,
            status: 'Station positions are collinear or invalid',
            selectedStations: keysSorted,
            measurements,
            staleStationCount: stationKeys.length - freshStationKeys.length
        };
    }

    return {
        position: {
            x: Math.round(output[0]),
            y: Math.round(output[1])
        },
        status: 'Position calculated',
        selectedStations: keysSorted,
        measurements,
        staleStationCount: stationKeys.length - freshStationKeys.length,
        parameters: {
            txPower,
            pathLossExponent,
            pixelsPerMeter,
            maxObservationAgeMs
        }
    };
};

export const locate = (beacon, stations, pixelsPerMeter) =>
    locateWithDebug(beacon, stations, pixelsPerMeter).position;

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

export const lowPass = (previousValue, currentValue, alpha) =>
    alpha * currentValue + (1 - alpha) * previousValue;

export const calculateDistance = (rssi, txPower = DEFAULT_TX_POWER, pathLossExponent = DEFAULT_PATH_LOSS_EXPONENT) =>
    Math.pow(10, ((txPower - rssi) / (10 * pathLossExponent)));

export const locateWithDebug = (beacon, stations, pixelsPerMeter) => {

    // ITAG -70 ... -94
    // Samsung -73 ... -95

    // RSSI = TxPower - 10 * n * lg(d)
    // n = 2...4
    // d = 10^(TxPower - RSSI) / (10 * n))

    console.log("========== POSITION CALC ==========");
    console.log("Beacon observations:", beacon);
    console.log("Available stations:", stations);
    console.log("Beacon station MACs:", Object.keys(beacon));
    console.log("Station MACs:", Object.keys(stations));
    console.log("pixelsPerMeter:", pixelsPerMeter);

    const keysSorted = Object.keys(beacon).filter(key => stations[key]).sort(function (a, b) {
        return beacon[a].rssi - beacon[b].rssi
    }).reverse().slice(0, 3);

    console.log("Matched/selected stations:", keysSorted);
    console.log("Selected count:", keysSorted.length);

    if (keysSorted.length < 3) {
        return {
            position: null,
            status: `Need 3 positioned stations; have ${keysSorted.length}`,
            selectedStations: keysSorted,
            measurements: []
        };
    }

    const measurements = keysSorted.map(stationMac => {
        const distanceMeters = calculateDistance(beacon[stationMac].rssi);
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
            measurements
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
        parameters: {
            txPower: DEFAULT_TX_POWER,
            pathLossExponent: DEFAULT_PATH_LOSS_EXPONENT,
            pixelsPerMeter
        }
    };
};

export const locate = (beacon, stations, pixelsPerMeter) =>
    locateWithDebug(beacon, stations, pixelsPerMeter).position;

import { describe, expect, it } from 'vitest';
import { createObservationStore, ingestObservationMessage } from './ObservationStore.js';
import { locateWithDebug } from '../Positioner/PositionCalculator.js';

describe('observation MQTT messages', () => {
    it('keeps legacy beacon messages compatible', () => {
        const store = createObservationStore();
        const result = ingestObservationMessage(store, {
            st: 'AA:00:00:00:00:01',
            e: [{m: 'BB:00:00:00:00:01', r: '-72'}]
        }, 1000);

        expect(result.beacons['bb:00:00:00:00:01']['aa:00:00:00:00:01']).toEqual({
            rssi: -72,
            timestamp: 1000
        });
        expect(result.devices['bb:00:00:00:00:01'].kind).toBe('beacon');
        expect(result.metadata.protocolVersion).toBe(1);
    });

    it('identifies HealthBand and preserves its advertised radio metadata', () => {
        const store = createObservationStore();
        const result = ingestObservationMessage(store, JSON.stringify({
            v: 2,
            st: 'AA:00:00:00:00:01',
            e: [{
                m: 'CC:00:00:00:00:01',
                r: -61,
                n: 'HealthBand',
                k: 'healthband',
                p: -59
            }]
        }), 2000);

        expect(result.devices['cc:00:00:00:00:01']).toMatchObject({
            name: 'HealthBand',
            kind: 'healthband',
            txPower: -59,
            lastSeenAt: 2000
        });
        expect(result.metadata.deviceMacs).toEqual(['cc:00:00:00:00:01']);
        expect(result.metadata.protocolVersion).toBe(2);
    });

    it('purges a device once it reports as a receiver station', () => {
        const store = createObservationStore();
        ingestObservationMessage(store, {
            st: 'AA:00:00:00:00:01',
            e: [{m: 'AA:00:00:00:00:02', r: -50}]
        }, 1000);
        const result = ingestObservationMessage(store, {
            st: 'AA:00:00:00:00:02',
            e: []
        }, 2000);

        expect(result.beacons['aa:00:00:00:00:02']).toBeUndefined();
        expect(result.devices['aa:00:00:00:00:02']).toBeUndefined();
    });

    it('provides three receiver observations that locate HealthBand, not a station', () => {
        const store = createObservationStore();
        const wearable = 'cc:00:00:00:00:01';
        const reports = [
            ['aa:00:00:00:00:01', 1000],
            ['aa:00:00:00:00:02', 2000],
            ['aa:00:00:00:00:03', 3000]
        ];
        let result;
        reports.forEach(([station, now]) => {
            result = ingestObservationMessage(store, {
                v: 2,
                st: station,
                e: [{m: wearable, r: -69, n: 'HealthBand', k: 'healthband', p: -69}]
            }, now);
        });

        const location = locateWithDebug(result.beacons[wearable], {
            'aa:00:00:00:00:01': {x: 0, y: 0},
            'aa:00:00:00:00:02': {x: 173.205, y: 0},
            'aa:00:00:00:00:03': {x: 86.603, y: 150}
        }, 100, {now: 3000, txPower: result.devices[wearable].txPower});

        expect(location.position.x).toBeCloseTo(87, 0);
        expect(location.position.y).toBeCloseTo(50, 0);
        expect(result.devices[wearable].kind).toBe('healthband');
        expect(result.devices['aa:00:00:00:00:01']).toBeUndefined();
    });
});

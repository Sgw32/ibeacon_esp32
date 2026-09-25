import { describe, expect, it } from 'vitest';
import { calculateDistance, locateWithDebug, trilaterate } from './PositionCalculator.js';

describe('trilaterate', () => {
    it('finds a point from three station distances', () => {
        const result = trilaterate([
            [0, 0, 5],
            [8, 0, 5],
            [0, 6, 5]
        ]);

        expect(result[0]).toBeCloseTo(4);
        expect(result[1]).toBeCloseTo(3);
    });

    it('returns null for collinear stations', () => {
        expect(trilaterate([
            [0, 0, 1],
            [1, 0, 1],
            [2, 0, 1]
        ])).toBeNull();
    });
});

describe('position debugging', () => {
    it('reports why a position cannot yet be calculated', () => {
        const result = locateWithDebug(
            {station1: {rssi: -70}},
            {station1: {x: 0, y: 0}},
            100
        );

        expect(result.position).toBeNull();
        expect(result.status).toContain('Need 3 positioned stations');
    });

    it('converts RSSI to a distance using the configured radio model', () => {
        expect(calculateDistance(-69)).toBeCloseTo(1);
    });
});

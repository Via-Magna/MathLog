import { describe, it, expect } from 'vitest';
import { computeBoundingBox, pointToSegmentDistance, hitTestStroke } from '../src/utils/geometry';
import type { Point, Stroke } from '../src/types';

describe('computeBoundingBox', () => {
  it('returns correct bounds for a set of points', () => {
    const points: Point[] = [
      { x: 10, y: 20, pressure: 0.5 },
      { x: 50, y: 5, pressure: 0.5 },
      { x: 30, y: 60, pressure: 0.5 },
    ];
    const bbox = computeBoundingBox(points);
    expect(bbox).toEqual({ minX: 10, minY: 5, maxX: 50, maxY: 60 });
  });

  it('handles a single point', () => {
    const points: Point[] = [{ x: 42, y: 99, pressure: 0.5 }];
    const bbox = computeBoundingBox(points);
    expect(bbox).toEqual({ minX: 42, minY: 99, maxX: 42, maxY: 99 });
  });
});

describe('pointToSegmentDistance', () => {
  it('returns 0 when the point is on the segment', () => {
    // Point (5, 5) lies on segment (0,0)→(10,10)
    const dist = pointToSegmentDistance(5, 5, 0, 0, 10, 10);
    expect(dist).toBeCloseTo(0, 5);
  });

  it('returns the perpendicular distance for a nearby point', () => {
    // Horizontal segment from (0,0) to (10,0). Point at (5, 3).
    // Perpendicular distance = 3
    const dist = pointToSegmentDistance(5, 3, 0, 0, 10, 0);
    expect(dist).toBeCloseTo(3, 5);
  });

  it('returns distance to nearest endpoint when projection falls outside', () => {
    // Segment from (0,0) to (10,0). Point at (15, 0).
    // Nearest point on segment is (10,0), distance = 5.
    const dist = pointToSegmentDistance(15, 0, 0, 0, 10, 0);
    expect(dist).toBeCloseTo(5, 5);
  });

  it('handles a zero-length segment (single point)', () => {
    const dist = pointToSegmentDistance(3, 4, 0, 0, 0, 0);
    expect(dist).toBeCloseTo(5, 5); // sqrt(9+16) = 5
  });
});

describe('hitTestStroke', () => {
  function makeStroke(points: Point[]): Stroke {
    return {
      id: 'test-stroke',
      points,
      color: '#000000',
      width: 3,
      createdAt: Date.now(),
    };
  }

  it('returns false for an empty stroke', () => {
    const stroke = makeStroke([]);
    expect(hitTestStroke(50, 50, stroke)).toBe(false);
  });

  it('returns true when pointer is near a single-point stroke', () => {
    const stroke = makeStroke([{ x: 50, y: 50, pressure: 0.5 }]);
    expect(hitTestStroke(55, 50, stroke, 10)).toBe(true);
  });

  it('returns false when pointer is far from a single-point stroke', () => {
    const stroke = makeStroke([{ x: 50, y: 50, pressure: 0.5 }]);
    expect(hitTestStroke(200, 200, stroke, 10)).toBe(false);
  });

  it('returns true when pointer is near a line segment', () => {
    const stroke = makeStroke([
      { x: 0, y: 0, pressure: 0.5 },
      { x: 100, y: 0, pressure: 0.5 },
    ]);
    // Point (50, 5) is 5px above the segment — within default threshold of 10
    expect(hitTestStroke(50, 5, stroke, 10)).toBe(true);
  });

  it('returns false when pointer is outside the AABB + threshold', () => {
    const stroke = makeStroke([
      { x: 0, y: 0, pressure: 0.5 },
      { x: 100, y: 100, pressure: 0.5 },
    ]);
    // Point way outside
    expect(hitTestStroke(500, 500, stroke, 10)).toBe(false);
  });
});

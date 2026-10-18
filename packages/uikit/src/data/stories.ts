/* What the data stories draw: an hour as it could have gone, and how long ago a point of it was. */

export type Shape = 'flat' | 'rise' | 'spike' | 'wave';

/** 60 points ending at now: steady, growing (a leak), a spike, waves. */
export const hour = (now: number, shape: Shape) =>
  Array.from({ length: 60 }, (_, i) => {
    const by: Record<Shape, number> = {
      flat: 1 + 0.03 * Math.sin(i / 3),
      rise: 0.55 + 0.45 * (i / 59),
      spike: 1 + (Math.abs(i - 38) < 4 ? 1.4 * (1 - Math.abs(i - 38) / 4) : 0),
      wave: 1 + 0.25 * Math.sin(i / 6),
    };
    return now * by[shape];
  });

/** How long ago, said short: 23 min ago, 2h 10m ago. */
export const ago = (minutes: number) => (minutes < 1 ? 'now' : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''} ago`);

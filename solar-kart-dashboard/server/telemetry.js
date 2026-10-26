// Pure helpers: validation, state-of-charge estimate, and the simulator.
// Kept free of I/O so they can be unit tested.

export function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

export function round(x, digits) {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/** Accepts a raw message from the kart and returns a clean sample, or null. */
export function parseSample(raw, now = Date.now()) {
  let m;
  try {
    m = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  const v = Number(m?.v), i = Number(m?.i), spd = Number(m?.spd), temp = Number(m?.temp);
  if (![v, i, spd, temp].every(Number.isFinite)) return null;
  return {
    ts: now,
    v: round(v, 2),
    i: round(i, 2),
    spd: round(spd, 1),
    temp: round(temp, 1),
    p: round(v * i, 0),
  };
}

/** Linear state-of-charge estimate between an empty and full pack voltage. */
export function estimateSoc(v, vMin, vMax) {
  if (vMax <= vMin) return 0;
  return Math.round(clamp((v - vMin) / (vMax - vMin), 0, 1) * 100);
}

/** Fake kart: accelerates and coasts in laps; voltage sags under load, motor heats up. */
export function createSimulator({ vMax = 29.4 } = {}) {
  let t = 0, charge = 1, temp = 28;
  return function next() {
    t += 0.5;
    const throttle = clamp(0.55 + 0.45 * Math.sin(t / 9) + 0.08 * Math.sin(t * 1.7), 0, 1);
    const spd = 28 * throttle * (0.9 + 0.1 * Math.sin(t / 3));
    const i = 38 * throttle ** 1.3;
    charge = clamp(charge - i * 0.00004, 0, 1);
    const v = vMax - (1 - charge) * 4.2 - i * 0.045;
    temp += (i / 38) * 0.06 - (temp - 25) * 0.004;
    return { v, i, spd, temp };
  };
}

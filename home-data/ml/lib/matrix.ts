/**
 * matrix.ts — Dense matrix operations for ML computations.
 *
 * Uses Float64Array for numeric precision. Row-major layout.
 * This is NOT a general-purpose tensor library — just the minimum needed
 * for tabular ML (logistic regression, gradient boosting).
 */

export interface Matrix {
  data: Float64Array;
  rows: number;
  cols: number;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function create(rows: number, cols: number): Matrix {
  return { data: new Float64Array(rows * cols), rows, cols };
}

export function fromArray(arr: number[][], rows?: number, cols?: number): Matrix {
  const r = rows ?? arr.length;
  const c = cols ?? (arr[0]?.length ?? 0);
  const m = create(r, c);
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      m.data[i * c + j] = arr[i][j];
    }
  }
  return m;
}

export function fromVectors(vectors: Float64Array[]): Matrix {
  const rows = vectors.length;
  const cols = vectors[0]?.length ?? 0;
  const m = create(rows, cols);
  for (let i = 0; i < rows; i++) {
    m.data.set(vectors[i], i * cols);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export function get(m: Matrix, r: number, c: number): number {
  return m.data[r * m.cols + c];
}

export function set(m: Matrix, r: number, c: number, v: number): void {
  m.data[r * m.cols + c] = v;
}

export function getRow(m: Matrix, r: number): Float64Array {
  return m.data.slice(r * m.cols, (r + 1) * m.cols);
}

// ---------------------------------------------------------------------------
// Vector operations
// ---------------------------------------------------------------------------

export function vecDot(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

export function vecAdd(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] + b[i];
  }
  return out;
}

export function vecSub(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] - b[i];
  }
  return out;
}

export function vecScale(a: Float64Array, s: number): Float64Array {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i] * s;
  }
  return out;
}

export function vecNorm(a: Float64Array): number {
  return Math.sqrt(vecDot(a, a));
}

export function zeros(n: number): Float64Array {
  return new Float64Array(n);
}

// ---------------------------------------------------------------------------
// Matrix-vector
// ---------------------------------------------------------------------------

/** Matrix-vector multiply: result[i] = sum_j(m[i,j] * v[j]) */
export function matVecMul(m: Matrix, v: Float64Array): Float64Array {
  const out = new Float64Array(m.rows);
  for (let i = 0; i < m.rows; i++) {
    let sum = 0;
    const offset = i * m.cols;
    for (let j = 0; j < m.cols; j++) {
      sum += m.data[offset + j] * v[j];
    }
    out[i] = sum;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Activation functions
// ---------------------------------------------------------------------------

export function sigmoid(x: number): number {
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  }
  const ex = Math.exp(x);
  return ex / (1 + ex);
}

export function softmax(logits: Float64Array): Float64Array {
  const max = logits.reduce((a, b) => Math.max(a, b), -Infinity);
  const exps = new Float64Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    exps[i] = Math.exp(logits[i] - max);
    sum += exps[i];
  }
  for (let i = 0; i < logits.length; i++) {
    exps[i] /= sum;
  }
  return exps;
}

// ---------------------------------------------------------------------------
// Loss functions
// ---------------------------------------------------------------------------

/** Binary cross-entropy for a single sample. Clamps to avoid log(0). */
export function binaryCrossEntropy(yTrue: number, yPred: number): number {
  const eps = 1e-15;
  const p = Math.max(eps, Math.min(1 - eps, yPred));
  return -(yTrue * Math.log(p) + (1 - yTrue) * Math.log(1 - p));
}

// ---------------------------------------------------------------------------
// Shuffling
// ---------------------------------------------------------------------------

/** Fisher-Yates shuffle of indices. */
export function shuffleIndices(n: number, rng: () => number = Math.random): number[] {
  const indices = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

// ---------------------------------------------------------------------------
// Seeded RNG (simple xoshiro128**)
// ---------------------------------------------------------------------------

export function createRng(seed: number): () => number {
  let s0 = seed | 0 || 1;
  let s1 = (seed * 2654435761) | 0 || 1;
  let s2 = (seed * 2246822519) | 0 || 1;
  let s3 = (seed * 3266489917) | 0 || 1;
  return () => {
    const t = s1 << 9;
    let r = s1 * 5;
    r = ((r << 7) | (r >>> 25)) * 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = (s3 << 11) | (s3 >>> 21);
    return (r >>> 0) / 4294967296;
  };
}

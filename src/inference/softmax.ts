export function softmax(arr: Float32Array): Float32Array {
  let maxVal = -Infinity;
  for (const val of arr) {
    if (val > maxVal) maxVal = val;
  }

  const exps = new Float32Array(arr.length);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const val = arr[i] ?? 0;
    const v = Math.exp(val - maxVal);
    exps[i] = v;
    sum += v;
  }

  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const val = exps[i] ?? 0;
    out[i] = val / sum;
  }
  return out;
}

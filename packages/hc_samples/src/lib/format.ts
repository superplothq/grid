export function formatDecimals(data: unknown[][], colIndices: number[]): void {
  for (const i of colIndices) {
    const col = data[i];
    if (!col) continue;
    for (let j = 0; j < col.length; j++) {
      const v = col[j];
      if (typeof v === "number" && !Number.isInteger(v)) {
        col[j] = Number(v.toFixed(2));
      }
    }
  }
}

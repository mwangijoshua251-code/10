export const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
export const num = (x: string | number | null | undefined): number => (x === null || x === undefined ? 0 : Number(x));
export const fmtUsd = (x: number) =>
  (x < 0 ? "-" : "") + "$" + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

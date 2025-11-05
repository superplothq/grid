// import { add, multiply } from "utils";

// export interface CalculationResult {
//   sum: number;
//   product: number;
//   total: number;
// }

// export function calculateSample(x: number, y: number): CalculationResult {
//   const sum = add(x, y);
//   const product = multiply(x, y);
//   const total = add(sum, product);

//   return {
//     sum,
//     product,
//     total
//   };
// }

// export function processNumbers(numbers: number[]): number {
//   return numbers.reduce((acc, num) => add(acc, num), 0);
// }

import DataSource from "./datasource"
export { loadDataToLocalStorage } from "./dataloader"
export { DataSource };

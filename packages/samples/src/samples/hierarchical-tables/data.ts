import type { TreeNode } from "./table";

// Continent > country > city. Cities are leaves carrying [population, mortality];
// continents and countries roll those columns up.
export const REGIONS: TreeNode[] = [
  {
    name: "Europe",
    expanded: true,
    children: [
      {
        name: "Germany",
        expanded: true,
        children: [
          { name: "Berlin", values: [3_677_000, 38_100] },
          { name: "Munich", values: [1_488_000, 14_200] },
          { name: "Hamburg", values: [1_899_000, 19_800] },
        ],
      },
      {
        name: "France",
        children: [
          { name: "Paris", values: [2_140_000, 21_600] },
          { name: "Lyon", values: [522_000, 4_900] },
        ],
      },
      {
        name: "United Kingdom",
        children: [
          { name: "London", values: [8_982_000, 78_400] },
          { name: "Manchester", values: [553_000, 5_500] },
        ],
      },
    ],
  },
  {
    name: "Asia",
    children: [
      {
        name: "Japan",
        children: [
          { name: "Tokyo", values: [13_960_000, 119_000] },
          { name: "Osaka", values: [2_691_000, 27_400] },
        ],
      },
      {
        name: "India",
        children: [
          { name: "Mumbai", values: [12_478_000, 88_600] },
          { name: "Delhi", values: [16_787_000, 121_300] },
          { name: "Bangalore", values: [8_443_000, 52_100] },
        ],
      },
    ],
  },
  {
    name: "Americas",
    children: [
      {
        name: "United States",
        children: [
          { name: "New York", values: [8_468_000, 74_200] },
          { name: "Los Angeles", values: [3_849_000, 33_900] },
          { name: "Chicago", values: [2_697_000, 26_800] },
        ],
      },
      {
        name: "Brazil",
        children: [
          { name: "São Paulo", values: [12_330_000, 79_500] },
          { name: "Rio de Janeiro", values: [6_748_000, 47_300] },
        ],
      },
    ],
  },
];

// A project directory. Files are leaves carrying [sizeInBytes]; folders roll the
// size up from everything beneath them.
export const FILES: TreeNode[] = [
  {
    name: "my-app",
    expanded: true,
    children: [
      {
        name: "src",
        expanded: true,
        children: [
          {
            name: "components",
            children: [
              { name: "Button.tsx", values: [4_310] },
              { name: "Modal.tsx", values: [8_120] },
              { name: "Sidebar.tsx", values: [6_540] },
            ],
          },
          {
            name: "lib",
            children: [
              { name: "api.ts", values: [5_980] },
              { name: "utils.ts", values: [3_240] },
            ],
          },
          { name: "index.ts", values: [1_180] },
          { name: "app.tsx", values: [2_760] },
        ],
      },
      {
        name: "public",
        children: [
          { name: "logo.svg", values: [12_480] },
          { name: "favicon.ico", values: [2_048] },
        ],
      },
      { name: "package.json", values: [1_920] },
      { name: "README.md", values: [5_360] },
      { name: "tsconfig.json", values: [820] },
    ],
  },
];

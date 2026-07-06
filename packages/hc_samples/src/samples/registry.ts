import { ComponentType } from "react";

export interface Sample {
  id: string;
  title: string;
  component: ComponentType;
}

const samples: Sample[] = [];

export function registerSample(sample: Sample) {
  samples.push(sample);
}

export function getSamples(): readonly Sample[] {
  return samples;
}

export function getSampleById(id: string): Sample | undefined {
  return samples.find((s) => s.id === id);
}

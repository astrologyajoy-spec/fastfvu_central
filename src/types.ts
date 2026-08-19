export type TabType = 'overview' | 'playground' | 'docs' | 'pricing';

export interface PricingPlan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  popular?: boolean;
  cta: string;
}

export interface ApiSnippet {
  language: string;
  label: string;
  code: string;
}

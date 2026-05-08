export interface DesignTaste {
  name: string;
  description: string;
  typography: string;
  spacing: string;
  color: string;
  suitableFor: string[];
}

export const DESIGN_TASTES: DesignTaste[] = [
  {
    name: "Glassmorphism",
    description: "Frosted glass effect with semi-transparent backgrounds and blur",
    typography: "Sans-serif bold headings (text-3xl font-bold), light body text",
    spacing: "Generous padding (p-8), gap-6 between cards",
    color: "Dark bg (bg-zinc-950), glass cards (bg-white/10 backdrop-blur-xl), accent blue-500",
    suitableFor: ["hero", "card", "modal", "landing"]
  },
  {
    name: "Minimal",
    description: "Clean, minimal design with maximum whitespace",
    typography: "System font (font-sans), single weight, tight line-height",
    spacing: "Consistent 16px grid, minimal border-radius (rounded-sm)",
    color: "White bg, neutral-100 sections, single accent (indigo-600), text-zinc-900",
    suitableFor: ["dashboard", "app", "form", "settings"]
  },
  {
    name: "Editorial",
    description: "Publication-style with serif typography and generous layout",
    typography: "Serif headings (font-serif text-4xl), readable body (leading-relaxed)",
    spacing: "Wide max-width sections, 120px vertical rhythm",
    color: "Cream bg (bg-stone-50), dark text (text-stone-900), warm accent amber-600",
    suitableFor: ["blog", "article", "newsletter", "landing"]
  },
  {
    name: "Brutalist",
    description: "Raw, unpolished aesthetic with bold borders and monospace type",
    typography: "Monospace (font-mono), large headings, no font smoothing",
    spacing: "Tight spacing, border-4 for all elements, no border-radius",
    color: "High contrast: bg-yellow-300, text-black, border-black, accent-lime-500",
    suitableFor: ["portfolio", "experimental", "cta", "hero"]
  },
  {
    name: "SaaS Modern",
    description: "Professional SaaS aesthetic with gradients and rounded cards",
    typography: "Inter-style (font-sans tracking-tight), gradient headings",
    spacing: "Padded sections (py-24), rounded-2xl cards, gap-8",
    color: "Dark bg (bg-slate-950), blue gradient accent (from-blue-600 to-cyan-500), white cards (bg-slate-900)",
    suitableFor: ["pricing", "feature", "hero", "dashboard", "cta"]
  }
];

export function injectTasteIntoPrompt(
  prompt: string,
  taste?: DesignTaste
): string {
  if (!taste) return prompt;

  return `${prompt}

## Design Style Guidelines
- Taste: ${taste.name} — ${taste.description}
- Typography: ${taste.typography}
- Spacing: ${taste.spacing}
- Color: ${taste.color}
- Only use Tailwind CSS classes. Apply responsive prefixes (lg:) where appropriate.`;
}

export function findTasteByName(name: string): DesignTaste | undefined {
  return DESIGN_TASTES.find(
    t => t.name.toLowerCase() === name.toLowerCase()
  );
}

export function findTastesForUseCase(useCase: string): DesignTaste[] {
  return DESIGN_TASTES.filter(t =>
    t.suitableFor.some(s => s.toLowerCase().includes(useCase.toLowerCase()))
  );
}

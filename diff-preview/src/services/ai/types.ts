export interface GenerateOptions {
  framework?: 'react' | 'vue' | 'svelte' | 'html';
  style?: string;
  model?: string;
}

export interface AIDesignElement {
  id: string;
  type: 'button' | 'card' | 'text' | 'image' | 'container';
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: string;
  parentId?: string;
}

export interface Resource {
  name: string;
  type: string;
  url: string;
}

export interface AIDesignSuggestion {
  title: string;
  description: string;
  elements: AIDesignElement[];
  resources: Resource[];
}

export interface AIDesignGenerator {
  generateDesign(
    prompt: string,
    options?: GenerateOptions
  ): Promise<AIDesignSuggestion>;
}

import type { Resource } from "./ai/types";

export async function validateResourceUrls(
  resources: Resource[]
): Promise<Resource[]> {
  const validated: Resource[] = [];

  for (const resource of resources) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(resource.url, {
        method: "HEAD",
        signal: controller.signal,
        mode: "no-cors"
      });

      clearTimeout(timeout);

      if (response.ok || response.type === "opaque") {
        validated.push(resource);
      } else {
        validated.push({
          ...resource,
          url: ""
        });
      }
    } catch {
      validated.push({
        ...resource,
        url: ""
      });
    }
  }

  return validated;
}

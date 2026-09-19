export function validateDistinctNetlifySiteIds(preview: string, demo: string) {
  const normalizedPreview = normalizeSiteId(preview, "NETLIFY_PREVIEW_SITE_ID");
  const normalizedDemo = normalizeSiteId(demo, "NETLIFY_DEMO_SITE_ID");

  if (normalizedPreview.toLowerCase() === normalizedDemo.toLowerCase()) {
    throw new Error(
      "NETLIFY_PREVIEW_SITE_ID and NETLIFY_DEMO_SITE_ID must identify different Netlify sites.",
    );
  }

  return { demo: normalizedDemo, preview: normalizedPreview };
}

function normalizeSiteId(value: string, name: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${name} is required for this manual Netlify deployment.`);
  }
  return normalized;
}

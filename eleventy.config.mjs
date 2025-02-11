export default async function (eleventyConfig) {
  // Configure Eleventy
  eleventyConfig.setInputDirectory("src");
  eleventyConfig.setDataDirectory("_data");
  eleventyConfig.setIncludesDirectory("_includes");
  eleventyConfig.setLayoutsDirectory("_includes/layouts");

  eleventyConfig.setTemplateFormats("html, md, njk");

  // Shortcode
  eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);

  // Copy static assets
  eleventyConfig.addPassthroughCopy("src/assets");
}; 
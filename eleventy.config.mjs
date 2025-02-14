import { DateTime } from "luxon";

export default async function (eleventyConfig) {
  // Configure Eleventy
  eleventyConfig.setInputDirectory("src");
  eleventyConfig.setDataDirectory("_data");
  eleventyConfig.setIncludesDirectory("_includes");
  eleventyConfig.setLayoutsDirectory("_includes/layouts");
  eleventyConfig.addGlobalData("layout", "base.njk");

  eleventyConfig.setTemplateFormats("html, md, njk");

  // Shortcode
  eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`);

  // Published date filter
  eleventyConfig.addFilter("readableDate", dateObj => {
    return DateTime.fromJSDate(dateObj, {
      zone: 'utc-8'
    }).toFormat("dd LLL yyyy");
  });

  // https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#valid-date-string
  eleventyConfig.addFilter('htmlDateString', (dateObj) => {
    return DateTime.fromJSDate(dateObj, {
      zone: 'utc'
    }).toFormat('yyyy-LL-dd');
  });

  // Copy static assets
  eleventyConfig.addPassthroughCopy("src/assets");

  // Create a collection for blog posts
  eleventyConfig.addCollection("posts", function (collectionApi) {
    return collectionApi.getFilteredByGlob("./posts/*.md");
  });  

}; 
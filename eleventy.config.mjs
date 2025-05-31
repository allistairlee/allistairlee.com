import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import fs from "fs";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const metadata = JSON.parse(fs.readFileSync("./src/_data/metadata.json", "utf-8"));

export default async function (eleventyConfig) {
  // RSS plugin
  eleventyConfig.addPlugin(feedPlugin, {
    type: "rss",
    outputPath: "/rss.xml",
    collection: {
      name: "posts", // iterate over `collections.posts`
      limit: 10, // 0 = no limit
    },
    metadata: {
      language: metadata.language,
      title: metadata.title,
      subtitle: metadata.description,
      base: metadata.siteUrl,
      author: {
        name: metadata.author,
        email: "", // Optional
      }
    },
  });

  // Image plugin
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    formats: ["webp"],
    widths: ["auto"],

    // optional, attributes assigned on <img> nodes override these values
    htmlOptions: {
      imgAttributes: {
        loading: "lazy",
        decoding: "async",
      },
      pictureAttributes: {}
    },
  });

  // Syntax Highlighting plugin
  eleventyConfig.addPlugin(syntaxHighlight);

  // Configure Eleventy
  eleventyConfig.setInputDirectory("src");
  eleventyConfig.setLayoutsDirectory("_includes/layouts");
  eleventyConfig.setTemplateFormats("html, md, njk");
  eleventyConfig.addGlobalData("layout", "base.njk");
  eleventyConfig.addPassthroughCopy("src/assets/img");
  eleventyConfig.addPassthroughCopy("src/assets/js");

  // Ignore CSS files inside src/posts/ so the template engine never processes them.
  // They are served via passthrough copy (below) at the correct path.
  eleventyConfig.ignores.add("src/posts/**/*.css");

  // Process CSS files through PostCSS (Tailwind) - only src/assets/css/ reaches here
  eleventyConfig.addTemplateFormats("css");
  eleventyConfig.addExtension("css", {
    outputFileExtension: "css",
    getData: async function (inputPath) {
      // Compute a permalink that preserves the .css extension
      // Exclude from global layout so raw CSS is output
      const relative = inputPath.replace(/\\/g, "/").replace(/^\.\/src\//, "/");
      return {
        permalink: relative,
        layout: false,
      };
    },
    compile: async function (inputContent, inputPath) {
      // Process tailwind.css through PostCSS
      if (inputPath.includes("tailwind.css")) {
        return async () => {
          let result = await postcss([
            tailwindcss(),
          ]).process(inputContent, { from: inputPath });

          return result.css;
        };
      }

      // Pass through all other CSS files as-is
      return async () => inputContent;
    },
  });
  eleventyConfig.addPassthroughCopy("src/posts/**/*.{js,json,csv,css}");

  // Shortcode
  eleventyConfig.addShortcode("year", () => `${new Date().getFullYear()}`); // Footer
  eleventyConfig.addShortcode("captionedImage", (src, alt, caption) => {
    return `<figure>
      <img src="${src}" alt="${alt}" loading="lazy" decoding="async" />
      <figcaption>${caption}</figcaption>
    </figure>`;
  });


  // Filter for formatting dates using vanilla JS
  eleventyConfig.addFilter("formatDate", (dateObj, format) => {
    if (!dateObj) return "";
    const date = new Date(dateObj);
    const timezone = metadata.timezone || "UTC";

    // ISO format for machine-readable use (datetime attribute)
    if (format === "iso" || format === "yyyy-LL-dd") {
      const year = date.toLocaleDateString("en-US", { year: "numeric", timeZone: timezone });
      const month = date.toLocaleDateString("en-US", { month: "2-digit", timeZone: timezone });
      const day = date.toLocaleDateString("en-US", { day: "2-digit", timeZone: timezone });
      return `${year}-${month}-${day}`;
    }

    // Year-only format
    if (format === "year" || format === "yyyy") {
      return date.toLocaleDateString("en-US", { year: "numeric", timeZone: timezone });
    }

    // Default pretty format: "Jan 1, 2022"
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: timezone,
    }).format(date);
  });

  // Filter for reading time
  eleventyConfig.addFilter("readingTime", (content) => {
    const wordsPerMinute = 200;
    const text = content.replace(/(<([^>]+)>)/gi, ""); // Remove HTML tags
    const wordCount = text.split(/\s+/).length;
    const minutes = Math.ceil(wordCount / wordsPerMinute);
    return minutes;
  });

  // Filter to remove <style> and <script> tags from content
  eleventyConfig.addFilter("removeStylesScripts", content => {
    if (!content) return "";
    return content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  });

  // Filter to extract the first paragraph
  eleventyConfig.addFilter("firstParagraph", content => {
    if (!content) return "";
    const match = content.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    // Return the content of the first paragraph, or the original content if no paragraph is found
    return match ? match[1] : content;
  });

  // Filter collection to only include markdown files
  eleventyConfig.addFilter("filterMd", collection => {
    if (!collection) return [];
    return collection.filter(item => item.inputPath && item.inputPath.endsWith('.md'));
  });

  // Create a collection for blog posts
  eleventyConfig.addCollection("posts", function (collectionApi) {
    const now = new Date();
    return collectionApi.getFilteredByGlob("src/posts/**/*.md")
      .filter(post => post.date <= now)
      .sort((a, b) => b.date - a.date);
  });

  // Create a collection for your notes
  eleventyConfig.addCollection("notes", (collectionApi) => {
    return collectionApi.getFilteredByGlob("src/notes/**/*.md");
  });

  // Create a collection for all unique tags, sorted alphabetically
  eleventyConfig.addCollection("tagList", function (collectionApi) {
    let tagSet = new Set();
    collectionApi.getAll().forEach(item => {
      if (item.inputPath && item.inputPath.endsWith('.md') && "tags" in item.data) {
        let tags = item.data.tags;
        tags = Array.isArray(tags) ? tags : [tags];
        tags.forEach(tag => tagSet.add(tag));
      }
    });
    return [...tagSet].sort();
  });

  // Filter to get posts by tag
  eleventyConfig.addFilter("filterByTag", (collection, tag) => {
    return collection.filter(item => {
      return item.inputPath && item.inputPath.endsWith('.md') && item.data.tags && (Array.isArray(item.data.tags) ? item.data.tags.includes(tag) : item.data.tags === tag);
    });
  });

  // Transform to add `target="_blank"` and `rel="noopener noreferrer"` to external links
  eleventyConfig.addTransform("externalLinks", function (content, outputPath) {
    if (outputPath && outputPath.endsWith(".html")) {
      return content.replace(/<a\s+(?![^>]*\btarget=)[^>]*href="(https?:\/\/[^"]+)"([^>]*)>/gi, function (match, href, rest) {
        return `<a href="${href}"${rest} target="_blank" rel="noopener noreferrer">`;
      });
    }
    return content;
  });

  return {
    markdownTemplateEngine: "njk", // Use Nunjucks for Markdown files
    htmlTemplateEngine: "njk",     // Use Nunjucks for HTML files
    dataTemplateEngine: "njk"      // Use Nunjucks for data files
  };
};
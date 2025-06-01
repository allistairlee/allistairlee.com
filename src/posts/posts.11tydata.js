export default {
  layout: "post.njk",
  date: "git Created",
  eleventyComputed: {
    permalink: (data) => {
      // Don't generate pages for non-markdown assets (CSS, JS, etc.)
      // These are served via passthrough copy
      if (!data.page.inputPath.match(/\.md$/)) {
        return false;
      }
      if (data.permalink) {
        return data.permalink;
      }
      return `/posts/${data.page.fileSlug}/`;
    }
  }
};
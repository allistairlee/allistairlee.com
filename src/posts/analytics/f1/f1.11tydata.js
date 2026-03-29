export default {
  layout: "f1-post.njk",
  tags: "f1",
  eleventyComputed: {
    permalink: (data) => {
      // Build permalink from folder path
      const inputPath = data.page.inputPath.replace(/\\/g, "/");
      const match = inputPath.match(/f1\/(.+)\/([^/]+)\.md$/);

      if (match) {
        const pathSegments = match[1];
        const filename = match[2];

        let slug = `f1-${pathSegments.replace(/\//g, "-")}`;

        // Append the filename only if it's not race
        if (filename !== "race") {
          slug += `-${filename}`;
        }

        return `/posts/${slug}/`;
      }

      // Fallback to fileSlug
      return `/posts/${data.page.fileSlug}/`;
    },
  },
};
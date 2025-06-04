export default {
  tags: "recipe",
  layout: "recipe.njk",
  eleventyComputed: {
    permalink: (data) => {
      // Build permalink from folder path
      const inputPath = data.page.inputPath.replace(/\\/g, "/");
      const match = inputPath.match(/recipe\/(.+)\/([^/]+)\.md$/);

      if (match) {
        const pathSegments = match[1];
        const filename = match[2];

        let slug = pathSegments.replace(/\//g, "-");

        // Omit the filename from URL if it's identically named 'recipe' or 'index'
        if (filename !== "recipe" && filename !== "index") {
          slug += `-${filename}`;
        }

        return `/notes/${slug}/`;
      }

      // Fallback
      if (data.permalink) {
        return data.permalink;
      }
      return `/notes/${data.page.fileSlug}/`;
    },
    totalTime: (data) => {
      // Try to calculate total time automatically from prep and cooking time
      if (data.prepTime && data.cookingTime) {
        const prep = parseInt(data.prepTime, 10);
        const cook = parseInt(data.cookingTime, 10);
        if (!isNaN(prep) && !isNaN(cook)) {
          return `${prep + cook} mins`;
        }
      }
      return data.totalTime;
    }
  }
};
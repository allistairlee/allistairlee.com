export default {
  layout: "post.njk",
  date: "git Last Modified",
  eleventyComputed: {
    permalink: (data) => {
      if (data.permalink) {
        return data.permalink;
      }
      return `/notes/${data.page.fileSlug}/`;
    }
  }
};
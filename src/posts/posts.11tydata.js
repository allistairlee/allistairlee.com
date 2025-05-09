export default {
  layout: "post.njk",
  date: "git Created",
  eleventyComputed: {
    permalink: (data) => {
      if (data.permalink) {
        return data.permalink;
      }
      return `/posts/${data.page.fileSlug}/`;
    }
  }
};
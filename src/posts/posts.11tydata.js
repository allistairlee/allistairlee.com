export default {
  layout: "blog-post.njk",
  eleventyComputed: {
    permalink: (data) => {
      if (data.permalink) {
        return data.permalink;
      }
      return `/posts/${data.page.fileSlug}/`;
    }
  }
};
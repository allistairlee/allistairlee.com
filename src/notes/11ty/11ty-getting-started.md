---
title: 11ty Getting Started
---

When I first jumped into [Eleventy (11ty)](https://11ty.dev), the "blank slate" philosophy was both a relief and a bit of a head-scratcher. Coming from WordPress where the folder structure is set in stone, having to decide where everything lives was my first big hurdle. 

Writing this down so I have a starting point for my next project.

## The structure I've settled on

While there's no "right" way to do it, I've found that a well-organized folder structure makes everything easier to manage as the site grows. This is what I'm using for this site — it keeps the source files separate from the configuration and build outputs.

```
my-eleventy-site/
├── _site/                  # Output directory (configured in .eleventy.js)
├── src/                    # Primary source directory
│   ├── _data/              # Global data files (JSON, JS, etc.)
│   ├── _includes/          # Reusable templates and partials (layouts, snippets)
│   │   ├── layouts/        # Layout templates (e.g., post.njk, page.njk)
│   │   └── snippets/       # Reusable snippets (e.g., header.njk, footer.njk)
│   ├── notes/              # Notes
│   ├── pages/              # Standalone pages (e.g., about.md)
│   ├── posts/              # Blog posts or articles
│   ├── projects/           # New folder for project pages
│   │   └── project1.md     # Example project file
│   ├── assets/             # Static assets (css, js, fonts, images)
│   │   ├── css/
│   │   ├── js/
│   │   ├── fonts/
│   │   └── images/
│   └── index.md           # Home page
├── .eleventy.js            # Eleventy configuration
└── package.json            # Project configuration
```

### Why this works for me

- **The `src/` directory:** Keeping everything inside a `src` folder keeps the top-level directory clean. I only want to see config files (`.eleventy.js`, `package.json`) and dependencies at the root.
- **`_data/` is where the magic happens:** Global JSON or JS files go here. If I want a piece of data (like a list of links or site-wide constants) available in every template, I just drop a file in here.
- **`_includes/` for the building blocks:** This is where I keep layouts and reusable snippets. It's the "engine room" of the site.
- **`pages/` vs `posts/`:** I like keeping standalone pages separate from my blog posts. It helps me stay organized when I'm looking for a specific piece of content.

## Quick Start (for future me)

If I'm starting from scratch, here's the one-liner to get started:

```powershell
# Create project and install 11ty
mkdir new-site
cd new-site
npm init -y
npm install @11ty/eleventy --save-dev

# Run the dev server
npx @11ty/eleventy --serve
```

It's definitely not the only way to build, but it's the way that makes the most sense for me.
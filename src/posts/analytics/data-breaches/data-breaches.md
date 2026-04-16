---
title: Data Breaches, and the Illusion of Security
css:
  - /posts/analytics/data-breaches/data-breaches.css
js:
  - /posts/analytics/data-breaches/data-breaches.js
d3: true
---

It seems like every time I read the news, there's another headline about a company losing control of its users' data. It's become so common that it's almost easy to tune out - until you realize your own life is caught up in those headlines. 

I recently decided to stop ignoring it and actually looked into where my own information has ended up. [Have I Been Pwned](https://haveibeenpwned.com/) is a good resource for this. Lo and behold, there I was, listed in breaches from years ago - services I don't even use anymore, but that still held a piece of my identity. It was a strange, unsettling feeling, realizing just how much of my personal history is floating around in databases I no longer have any control over.

<div class="bleed-90">
  <div id="chart-container" class="chart-container chart">
    <svg id="breachVisualization"></svg>
  </div>
  <div class="chart-caption">Bubble size represents number of compromised records.</div>
  <div class="source-credit">
    Source: <a href="https://haveibeenpwned.com/" target="_blank">Have I Been Pwned</a>
  </div>
</div>


### What 20 years of breaches actually looks like

When I see the data laid out like this rather than reading the headlines one at a time, the scale becomes more difficult to dismiss. Some of the biggest bubbles in that chart aren't obscure forums or niche apps, they're platforms I trusted with my email, my password, sometimes my phone number, date of birth, and more.

But a few things stand out to me.

**Breaches aren't slowing down.** The early-to-mid 2010s had some big ones, but the mid-to-late 2010s is where things really accelerated. More services online means more data collected, and more targets.

**The scale is genuinely hard to process.** Some of these incidents exposed hundreds of millions of records in a single event. That's equivalent to the entire population of a country having their information out in the open at once.

**Companies are often slow to disclose.** Sometimes by months or years. By the time the "we take your security seriously" email arrives, the data has already been circulating for ages.

### The illusion of security

Here's the uncomfortable part: for most of these breaches, there's nothing I did wrong. I signed up for a service, trusted them with my data, and they failed to protect it. The security burden sits almost entirely on the companies, but the consequences land on me.

The standard advice after a breach is to change my password. Fine. But my email address doesn't change. My date of birth doesn't change. Once that information is out there, it's out there permanently. There's no patch for that.

### What I can actually do

I can't un-breach myself. But I can reduce the impact.

- **A password manager** means every service gets a different password. One breach doesn't hand over the keys to everything else.
- **Email aliases** for every service I sign up for. If that address starts getting spam, I know where it came from and I can kill it.
- **Two-factor authentication** wherever it's offered. An extra step, yes. But it means a leaked password alone isn't enough.

None of this makes me immune but when the next breach happens, at leastthe damage is contained.

Catch you on the next build! 🚀

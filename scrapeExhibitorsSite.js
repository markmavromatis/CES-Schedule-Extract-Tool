// scrape-ces-exhibitors-puppeteer.js
const puppeteer = require("puppeteer");
const fs = require("node:fs");

const URL =
  "https://exhibitors.ces.tech/8_0/explore/exhibitor-gallery.cfm?featured=false";

async function writeToFile(results) {
  fs.writeFile("./all_exhibitors.json", JSON.stringify(results), (err) => {
    if (err) {
      console.error(err);
    } else {
      // file written successfully
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadAllResults(page) {
  while (true) {
    const beforeCount = await page.$$eval(
      'a[href*="exhibitor-details.cfm"]',
      (els) => els.length
    );

    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, a"));
      const target = buttons.find((b) =>
        (b.textContent || "").toLowerCase().includes("load more results")
      );
      if (!target) return false;
      target.click();
      return true;
    });

    if (!clicked) {
      console.log('No more "Load More Results" button found.');
      break;
    }

    // Wait for new exhibitors to load (replace waitForTimeout).
    await sleep(2000);

    const afterCount = await page.$$eval(
      'a[href*="exhibitor-details.cfm"]',
      (els) => els.length
    );

    // )
    console.log(`Exhibitors before: ${beforeCount}, after: ${afterCount}`);

    if (afterCount <= beforeCount) {
      console.log("No additional exhibitors loaded, stopping.");
      break;
    }
  }
}

async function scrapeExhibitors() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Optional but helps mimic real navigation. [page:1]
    await page.setExtraHTTPHeaders({
      Referer: "https://exhibitors.ces.tech/8_0/index.cfm",
      "Accept-Language": "en-US,en;q=0.9",
    });

    await page.goto(URL, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Wait for the exhibitor list to be present (uses a known link pattern). [page:1]
    await page.waitForSelector('a[href*="exhibitor-details.cfm"]', {
      timeout: 60000,
    });

    await loadAllResults(page);
    const exhibitors = await page.evaluate(() => {
      const anchors = Array.from(
        document.querySelectorAll('a[href*="exhibitor-details.cfm"]')
      );

      const seen = new Set();
      const results = [];

      for (const a of anchors) {
        const name = (a.textContent || "").trim();
        const href = a.getAttribute("href");
        if (!href) continue;

        const url = href.startsWith("http")
          ? href
          : new URL(href, window.location.origin).toString();

        if (!url.includes("exhibitor-details.cfm") || !url.includes("exhid=")) {
          continue;
        }
        if (!name) continue;

        if (seen.has(url)) continue;
        seen.add(url);

        results.push({ name, link: url });
      }

      return results;
    });

    console.log(JSON.stringify(exhibitors, null, 2));
    console.log(`Total exhibitors found: ${exhibitors.length}`);
    // Output exhibitors to a file
    await writeToFile(exhibitors);
  } catch (err) {
    console.error("Error scraping exhibitors:", err);
  } finally {
    await browser.close();
  }
}

scrapeExhibitors();

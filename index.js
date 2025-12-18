// index.js
// npm install cheerio
const https = require("https");
const cheerio = require("cheerio");
const fs = require("node:fs");

const dates = ["2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"];
const BASE_URL = "https://www.ces.tech/schedule/?date=";

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value).trim().replace(/\s+/g, " ");
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function scrape(aDate) {
  const URL = BASE_URL + aDate;
  const html = await httpGet(URL);
  const $ = cheerio.load(html);

  const rows = [];
  rows.push(["Start Time", "End Time", "Title", "Description"].join(","));

  const timeRegex = /(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i;

  // Find results
  $("body")
    .find("div")
    .each(async (_, el) => {
      const elementId = el.attribs.id;
      if (elementId && elementId.startsWith("ScheduleItemLabel")) {
        const timeComponents = $(el)
          .find("p.f-heading-4")[0]
          .children[0].data.split("-");
        const startTime = timeComponents[0];
        const endTime = timeComponents[1];
        const location = $(el).find("p.f-caption-2")[0].children[0].data;
        const urlLink = $(el).find("a")[0];
        const url = urlLink.attribs.href;
        const title = urlLink.attribs["aria-label"];
        const description = $(el).find("p.f-body-2")[0].children[0].data;
        const tagsElements = $(el).find("div.items-center").find("a");
        let tags = "";
        for (i = 0; i < tagsElements.length; i++) {
          const tagElement = tagsElements[i];
          tags += tagElement.attribs["data-topic-label"] + ",";
        }
        // tags += '"';

        // console.log(elementId, time, location, url, title, description, tags);
        rows.push(
          [
            csvEscape(aDate),
            csvEscape(startTime),
            csvEscape(endTime),
            csvEscape(location),
            csvEscape(url),
            csvEscape(title),
            csvEscape(description),
          ].join(",")
        );
      }
    });
  return rows.join("\n");
  // console.log(rows.join("\n"));
}

async function writeToFile(aDate, results) {
  fs.writeFile("./results_" + aDate + ".csv", results, (err) => {
    if (err) {
      console.error(err);
    } else {
      // file written successfully
    }
  });
}

dates.forEach(async (aDate) => {
  const results = await scrape(aDate).catch((err) => {
    console.error(err);
    process.exit(1);
  });
  writeToFile(aDate, results);
});

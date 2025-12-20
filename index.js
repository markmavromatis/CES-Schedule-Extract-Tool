// index.js
// npm install cheerio
const https = require("https");
const cheerio = require("cheerio");
const fs = require("node:fs");

const SCHEDULE_ITEM_LABEL = "ScheduleItemLabel"
const SCHEDULE_URL_ELEMENT = "a";
const SCHEDULE_TIME_CLASS = "p.f-heading-4";
const SCHEDULE_TITLE_ATTRIBUTE = "aria-label";
const SCHEDULE_DESCRIPTION_CLASS = "p.f-body-2";
const SCHEDULE_TAGS_DIV_CLASS = "div.items-center";
const SCHEDULE_TAGS_LABEL_CLASS = "data-topic-label";
const LOCATION_CLASS = "p.f-caption-2";

const dates = ["2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"];
const BASE_URL = "https://www.ces.tech/schedule/?date=";

// CSV Report
const COL_HEADERS = ["Start Time", "End Time", "Title", "Description"];

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
  rows.push(COL_HEADERS.join(","));

  const timeRegex = /(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i;

  // Find results
  $("body")
    .find("div")
    .each(async (_, el) => {
      const elementId = el.attribs.id;
      if (elementId && elementId.startsWith(SCHEDULE_ITEM_LABEL)) {
        const timeComponents = $(el)
          .find(SCHEDULE_TIME_CLASS)[0]
          .children[0].data.split("-");
        const startTime = timeComponents[0];
        const endTime = timeComponents[1];
        const location = $(el).find(LOCATION_CLASS)[0].children[0].data;
        const urlLink = $(el).find(SCHEDULE_URL_ELEMENT)[0];
        const url = urlLink.attribs.href;
        const title = urlLink.attribs[SCHEDULE_TITLE_ATTRIBUTE];
        const description = $(el).find(SCHEDULE_DESCRIPTION_CLASS)[0].children[0].data;
        const tagsElements = $(el).find(SCHEDULE_TAGS_DIV_CLASS).find("a");
        let tags = "";
        for (i = 0; i < tagsElements.length; i++) {
          const tagElement = tagsElements[i];
          tags += tagElement.attribs[SCHEDULE_TAGS_LABEL_CLASS] + ",";
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

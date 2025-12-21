// index.js
const https = require("https");
const cheerio = require("cheerio");
const fs = require("node:fs");

const SCHEDULE_ITEM_LABEL = "ScheduleItemLabel";
const SCHEDULE_URL_ELEMENT = "a";
const SCHEDULE_TIME_CLASS = "p.f-heading-4";
const SCHEDULE_TITLE_ATTRIBUTE = "aria-label";
const SCHEDULE_DESCRIPTION_CLASS = "p.f-body-2";
const SCHEDULE_TAGS_DIV_CLASS = "div.items-center";
const SCHEDULE_TAGS_LABEL_CLASS = "data-topic-label";
const LOCATION_CLASS = "p.f-caption-2";

const MASTER_TAGS = [
  "Accessibility",
  "AgTech",
  "Artificial Intelligence",
  "Audio",
  "Beauty Tech",
  "BioTech",
  "Computing",
  "Construction & Industrial Tech",
  "Content & Entertainment",
  "Creators",
  "Cybersecurity",
  "Digital Health",
  "Drones",
  "Education Tech",
  "Energy Transition",
  "Enterprise",
  "Fashion Tech",
  "Fintech",
  "Food Tech",
  "Future of Work",
  "Gaming & Esports",
  "Home Entertainment & Office Hardware",
  "Innovation for All",
  "Investment & Venture Capital",
  "IoT/Sensors",
  "Longevity",
  "Marketing & Advertising",
  "Next G",
  "Policy",
  "Quantum",
  "Research",
  "Resiliency",
  "Retail/E-Commerce",
  "Robotics",
  "Smart Communities",
  "Smart Home & Appliances",
  "Sourcing & Manufacturing",
  "Space Tech",
  "Sports",
  "Standards",
  "Startups",
  "Streaming",
  "Sustainability",
  "Vehicle Tech & Advanced Mobility",
  "Wearables",
  "Women's Health Tech",
  "XR & Spatial Computing",
];

const dates = ["2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"];
const BASE_URL = "https://www.ces.tech/schedule/?date=";

// CSV Report
const COL_HEADERS = [
  "Date",
  "Start Time",
  "End Time",
  "Location",
  "URL",
  "Tags",
  "Title",
  "Description",
];

let tagFilters = [];

// Process tag filter arguments and throw exception for unknown tags
function loadTagFilters() {
  const argsLength = process.argv.length;
  for (let i = 2; i < argsLength; i++) {
    const track = process.argv[i];
    if (!MASTER_TAGS.includes(track)) {
      throw "Track " + track + "not found!";
    } else {
      tagFilters.push(track);
    }
  }
}

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

  // Find results
  $("div[id^='" + SCHEDULE_ITEM_LABEL + "']").each((_, el) => {
    let includeRow = false;
    const timeComponents = $(el)
      .find(SCHEDULE_TIME_CLASS)[0]
      .children[0].data.split("-");
    const startTime = timeComponents[0];
    const endTime = timeComponents[1];
    const location = $(el).find(LOCATION_CLASS)[0].children[0].data;
    const urlLink = $(el).find(SCHEDULE_URL_ELEMENT)[0];
    const url = urlLink.attribs.href;
    const title = urlLink.attribs[SCHEDULE_TITLE_ATTRIBUTE];
    const description = $(el).find(SCHEDULE_DESCRIPTION_CLASS)[0].children[0]
      .data;
    const tagsElements = $(el).find(SCHEDULE_TAGS_DIV_CLASS).find("a");
    let tags = "";
    if (tagFilters.length == 0) {
      includeRow = true;
    } else {
      for (i = 0; i < tagsElements.length; i++) {
        const tagElement = tagsElements[i];
        const tagValue = tagElement.attribs[SCHEDULE_TAGS_LABEL_CLASS];
        if (tagFilters.includes(tagValue)) {
          includeRow = true;
        }
        tags += tagValue + ",";
      }
    }
    if (includeRow) {
      rows.push(
        [
          csvEscape(aDate),
          csvEscape(startTime),
          csvEscape(endTime),
          csvEscape(location),
          csvEscape(url),
          csvEscape(tags),
          csvEscape(title),
          csvEscape(description),
        ].join(",")
      );
    }
  });

  return rows.join("\n");
}

async function writeToFile(results) {
  fs.writeFile("./results_all.csv", results, (err) => {
    if (err) {
      console.error(err);
    } else {
      // file written successfully
    }
  });
}

async function main() {
  let results = [];
  loadTagFilters();
  for (const aDate of dates) {
    results += await scrape(aDate).catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
  writeToFile(results);
}

main();

// index.js
const https = require("https");
const cheerio = require("cheerio");
const fs = require("node:fs");

const SCHEDULE_TIME_CLASS = "p.f-heading-4";
const SCHEDULE_TITLE_ATTRIBUTE = "h4.f-heading-5";
const SCHEDULE_DESCRIPTION_CLASS = "p.f-body-2";
const SCHEDULE_TAGS_SPAN_CLASS =
  "span.whitespace-nowrap.overflow-hidden.text-ellipsis";
const LOCATION_CLASS = "p.f-caption-2";

const MASTER_TAGS = [
  "Accessibility",
  "Accessories",
  "AgTech",
  "Artificial Intelligence",
  "Audio",
  "Beauty Tech",
  "BioTech",
  "Blockchain & Digital Assets",
  "Cloud Computing",
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
  "Video & Display",
  "Wearables",
  "Women's Health Tech",
  "XR & Spatial Computing",
];

const dates = [
  "2026-01-05",
  "2026-01-06",
  "2026-01-07",
  "2026-01-08",
  "2026-01-09",
];
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
      throw "Track '" + track + "' not found!";
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

// Extract tags from a schedule event
function getTags(tagsElements) {
  let tags = [];
  if (tagsElements.length > 0) {
    tagsElements.each((_, anElement) => {
      tags.push(anElement.children[0].data);
    });
  }
  return tags;
}

// Compare tags to filters
function checkTagFilters(tags) {
  for (let i = 0; i < tags.length; i++) {
    if (tagFilters.includes(tags[i])) {
      return true;
    }
  }
  return false;
}

// Schedule event start time
function getStartEndTimes(eventDivTag) {
  return eventDivTag.find(SCHEDULE_TIME_CLASS)[0].children[0].data.split("-");
}

function getEventAnchorTagsFromStartTime(timeListElement) {
  return timeListElement.find("div.text-primary").children("a");
}

async function scrape(aDate) {
  const URL = BASE_URL + aDate;
  const html = await httpGet(URL);
  const $ = cheerio.load(html);

  const rows = [];

  // Find results
  let count = 0;

  const meetingStartTimes = $($("ul[data-accordion-media='md-']")[0]).children(
    "li"
  );

  meetingStartTimes.each((_, timeListElement) => {
    // const meetingStartTime = getStartTime($(timeListElement));
    const eventUrlTags = getEventAnchorTagsFromStartTime($(timeListElement));
    let includeRow = false;
    eventUrlTags.each((_, eventUrlTag) => {
      const parent = $(eventUrlTag.parent);
      const [startTime, endTime] = getStartEndTimes(parent);
      const location = parent.find(LOCATION_CLASS)[0].children[0].data;
      const title = parent.find(SCHEDULE_TITLE_ATTRIBUTE)[0].children[0].data;
      const url = eventUrlTag.attribs.href;
      let description = "";
      try {
        description = parent.find(SCHEDULE_DESCRIPTION_CLASS)[0].children[0]
          .data;
      } catch (error) {
        console.warn("No description available for efvent: " + title);
      }
      const tagsElements = parent.find(SCHEDULE_TAGS_SPAN_CLASS);
      const tags = getTags(tagsElements);

      console.log(startTime, endTime, title, description);
      if (tagFilters.length == 0) {
        includeRow = true;
      } else {
        includeRow = checkTagFilters(tags);
      }

      if (includeRow) {
        rows.push(
          [
            csvEscape(aDate),
            csvEscape(startTime),
            csvEscape(endTime),
            csvEscape(location),
            csvEscape(url),
            csvEscape(tags.join(", ")),
            csvEscape(title),
            csvEscape(description),
          ].join(",")
        );
      }
    });
  });
  return rows.join("\n") + "\n";
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
  results.push(COL_HEADERS.join(",") + "\n");
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

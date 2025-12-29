const fs = require("fs");
const fileDb = require("better-sqlite3")("exhibitors.db");
const puppeteer = require("puppeteer");
const winston = require("winston");
const { combine, timestamp, printf } = winston.format;

const logFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level}]: ${message}`;
});

const logger = winston.createLogger({
  level: "info",
  format: combine(
    // The format string is passed here
    timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
    logFormat
  ),

  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "app.log" }), // Log to a file
  ],
});

// Has this record already been loaded?
function checkExists(cesUrl) {
  const selectStmt = fileDb.prepare(
    `SELECT COUNT(*) as count FROM exhibitors WHERE cesUrl = ?`
  );
  const row = selectStmt.get([cesUrl]);
  return row.count > 0;
}

(async () => {
  // Drop and recreate exhibitors table
  // fileDb.exec(`
  //   DROP TABLE IF EXISTS exhibitors
  //   `);
  fileDb.exec(`
    CREATE TABLE IF NOT EXISTS exhibitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyName TEXT NOT NULL,
        address TEXT NULL,
        logoUrl TEXT NULL,
        description TEXT NULL,
        boothLocation TEXT NULL,
        companyUrl TEXT NULL,
        cesUrl TEXT NOT NULL,
        isHonoree BOOLEAN NOT NULL
    )
    `);

  let allExhibitors = [];

  try {
    const data = fs.readFileSync("all_exhibitors.json", "utf8");
    //   console.log("File content:", data);
    allExhibitors = JSON.parse(data);
  } catch (err) {
    logger.error("Error reading file:", err);
  }
  if (allExhibitors.length === 0) {
    logger.error("No exhibitors data found.");
    process.exit(1);
  }

  //   const url =
  //     "https://exhibitors.ces.tech/8_0/exhibitor/exhibitor-details.cfm?exhid=0014V00003wZda7QAC";

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  for (let i = 0; i < allExhibitors.length; i++) {
    const exhibitor = allExhibitors[i];
    const vendorName = exhibitor.name;
    const url = exhibitor.link;
    logger.info("Processing exhibitor " + i + ": " + vendorName + " | " + url);
    if (checkExists(url)) {
      console.log("Exhibitor already exists in database, skipping: " + url);
      continue;
    }
    logger.info("Opening website: " + url);

    // Open exhibitor details page and scrape contents
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

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // wait some time for dynamic content
    // await new Promise((resolve) => setTimeout(resolve, 2000));

    // Extract company website URL from CES exhibitor page

    const companyUrl = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));

      // Filter external, non-CES links
      const externalLinks = anchors
        .map((a) => a.href)
        .filter(
          (href) =>
            href.startsWith("http") &&
            !href.includes("ces.tech") &&
            !href.includes("exhibitors.ces.tech")
        );

      // Return first valid external link
      return externalLinks.length ? externalLinks[0] : null;
    });

    // console.log("Company URL:", companyUrl);

    let address = "";
    try {
      address = await page.$eval("address", (el) => el.innerText);
      address = address.replace(/\n+/g, ",").trim();
      logger.info("Address is: " + address);
    } catch (e) {
      logger.warn("-- Address not found or failed to extract");
    }
    // console.log("Address: " + address);

    // Extract the description text
    const description = await page.evaluate(() => {
      const container = document.querySelector(
        "div.line-clamp__10.animated.line-clamp"
      );
      return container ? container.innerText.trim() : null;
    });
    // console.log("DESCRIPTION = " + description);
    const companyName = await page.$eval(
      "h1.exhibitor-name",
      (el) => el.innerText
    );
    // console.log("Company Name: " + companyName);

    // Extract the location text
    let location = await page.evaluate(() => {
      let container = document.querySelector("a.all");
      if (!container) {
        container = document.querySelector("li.f3");
      }
      return container ? container.innerText.trim() : null;
    });

    const isInnovationWinner = await page.evaluate(() => {
      const awardImage = document.querySelector('img[alt="Innovation Awards"]');
      return awardImage ? true : false;
    });
    const isInnovationWinnerSql = isInnovationWinner ? 1 : 0;

    const companyLogo = await page.evaluate(() => {
      const container = document.querySelector("img[id='jq-exh-logo']");
      return container ? container.src.trim() : null;
    });

    // Extract categories
    const categories = await page.evaluate(() => {
      const container = document.querySelector(
        ".section--list__columns-wrapper"
      );
      if (!container) return [];

      // Case 1: categories are listed as <li>
      const liItems = Array.from(container.querySelectorAll("li")).map((li) =>
        li.innerText.trim()
      );
      if (liItems.length) return liItems;

      // Case 2: categories are comma-separated text
      const text = container.innerText.trim();
      return text ? text.split(",").map((t) => t.trim()) : [];
    });

    //   const isInnovationWinner =
    // console.log("Image winner? " + isInnovationWinner);
    // console.log("Company Logo URL: " + companyLogo);
    // console.log("Booth Location:", location);
    // console.log("Categories:", categories);

    //   // Insert data using a prepared statement
    const insertStmt = fileDb.prepare(`
    INSERT INTO exhibitors (companyName, address, logoUrl, description, boothLocation, companyUrl, cesUrl, isHonoree)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run([
      companyName,
      address,
      companyLogo,
      description,
      location,
      companyUrl,
      url,
      isInnovationWinnerSql,
    ]);
    logger.info("-- Added!");
    page.close();
  }
  await browser.close();
})();

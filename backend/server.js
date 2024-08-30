const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fileUpload = require("express-fileupload");
const sqlite3 = require("sqlite3").verbose();
const sharp = require("sharp");
const axios = require("axios");
const fs = require("fs").promises;
const { v4: uuidv4 } = require("uuid");
const csv = require("csv-parse");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload({ createParentPath: true }));
app.use("/uploads", express.static("uploads"));

const db = new sqlite3.Database(
  "./database.db",
  sqlite3.OPEN_READWRITE,
  (err) => {
    if (err) {
      console.error("Error when connecting to the database:", err.message);
    } else {
      console.log("Connected to the SQLite database.");
    }
  }
);

db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_number TEXT,
    product_name TEXT,
    input_urls TEXT,
    output_urls TEXT,
    request_id TEXT,
    status TEXT
)`);

app.post("/api/upload", async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send("No files were uploaded.");
  }

  const file = req.files.file;
  const requestId = uuidv4();
  const data = file.data.toString("utf8");
  await processCSV(data, requestId);
  res.json({ requestId: requestId });
});

app.get("/api/status/:requestId", (req, res) => {
  const { requestId } = req.params;
  db.get(
    `SELECT status FROM products WHERE request_id = ?`,
    [requestId],
    (err, row) => {
      if (err) {
        res.status(500).send("Error retrieving data");
      } else if (row) {
        res.json({ status: row.status });
      } else {
        res.status(404).send("Request ID not found");
      }
    }
  );
});

app.get("/api/export", (req, res) => {
  const { requestId } = req.query;
  db.all(
    "SELECT * FROM products WHERE request_id = ?",
    [requestId],
    (err, rows) => {
      if (err) {
        res.status(500).send("Failed to retrieve data");
        return;
      }
      const csvContent = toCSV(rows);
      res.header("Content-Type", "text/csv");
      res.attachment("output.csv");
      res.send(csvContent);
    }
  );
});

function toCSV(rows) {
  const headers =
    "Serial Number,Product Name,Input Image Urls,Output Image Urls\n";
  const data = rows
    .map(
      (row) =>
        `${row.serial_number},${row.product_name},"${
          row.input_urls
        }","${row.output_urls.split("|").join(",")}"`
    )
    .join("\n");
  return headers + data;
}

async function processCSV(data, requestId) {
  csv.parse(
    data,
    {
      columns: true,
      skip_empty_lines: true,
    },
    (err, records) => {
      if (err) {
        console.error("Failed to parse CSV:", err);
        return;
      }
      processRecords(records, requestId);
    }
  );
}

async function processRecords(records, requestId) {
  for (const record of records) {
    const {
      "S. No.": serial,
      "Product Name": productName,
      "Input Image Urls": inputUrls,
    } = record;
    const urls = inputUrls.split(",");

    const outputUrls = await processImages(urls, productName);

    db.run(
      `INSERT INTO products (serial_number, product_name, input_urls, output_urls, request_id, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        serial,
        productName,
        urls.join("|"),
        outputUrls.join("|"),
        requestId,
        "Completed",
      ],
      (err) => {
        if (err) {
          console.error("Failed to insert into database:", err.message);
        }
      }
    );
  }
}

async function processImages(urls, productName) {
  const outputUrls = [];
  for (let url of urls) {
    url = url.trim();
    try {
      const response = await axios.get(url, { responseType: "arraybuffer" });
      const filename = `${productName.trim()}-${Date.now()}.jpg`;
      const outputPath = `./uploads/${filename}`;
      const processedImage = await sharp(response.data)
        .jpeg({ quality: 50 })
        .toBuffer();
      await fs.writeFile(outputPath, processedImage);
      outputUrls.push(`http://localhost:${PORT}/uploads/${filename}`);
    } catch (err) {
      console.error("Error processing image:", err.message);
    }
  }
  return outputUrls;
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

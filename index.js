import express from "express";
import dotenv from "dotenv";
import cors from "cors";

import { CosmosClient } from "@azure/cosmos";

dotenv.config();

const endpoint = process.env.COSMOSDB_ENDPOINT;
const key = process.env.COSMOSDB_READ_KEY;
const client = new CosmosClient({ endpoint, key });
const container = await client.database("LogsDB").container("LogsContainer");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const fetchData = async (
  timeStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // By default start 30 days before
  timeEnd = new Date().toISOString()
) => {
  const query =
    "SELECT * FROM c WHERE c.message.received_at >= @start AND c.message.received_at <= @end";
  const parameters = [
    { name: "@start", value: timeStart },
    { name: "@end", value: timeEnd },
  ];

  try {
    const { resources } = await container.items
      .query({ query, parameters })
      .fetchAll();
    return resources;
  } catch (error) {
    console.error("Error fetching data:", error);
    return [];
  }
};

// Example route
app.get("/api/v1", (req, res) => {
  res.json({ message: "Hello from backend" });
});

app.get("/api/v1/logs", async (req, res) => {
  const { timeStart, timeEnd } = req.query;

  try {
    const data = await fetchData(timeStart, timeEnd);
    res.json(data);
  } catch (error) {
    console.error("Error fetching data in route:", error);
    res.status(500).json([]);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

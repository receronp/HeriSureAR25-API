import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mqtt from "mqtt";
import { CosmosClient } from "@azure/cosmos";

dotenv.config();

const version = process.env.API_VERSION || "v1";

// MQTT configuration
const mqttHost = process.env.MQTT_HOST || "eu1.cloud.thethings.network";
const mqttPort = 8883; // TTN MQTT secure port
const mqttAppId = process.env.MQTT_APP_ID;
const mqttDeviceId = process.env.MQTT_DEVICE_ID;

// CosmosDB configuration
const cosmosClient = new CosmosClient({
  endpoint: process.env.COSMOSDB_ENDPOINT,
  key: process.env.COSMOSDB_READ_KEY,
});

const container = await cosmosClient
  .database("LogsDB")
  .container("LogsContainer");

// MQTT Client Setup
const mqttClient = mqtt.connect(`mqtts://${mqttHost}:${mqttPort}`, {
  username: `${process.env.MQTT_APP_ID}@ttn`,
  password: process.env.MQTT_API_KEY,
});

mqttClient.on("connect", () => {
  console.log("Connected to TTN MQTT broker");
});

mqttClient.on("error", (err) => {
  console.error("TTN MQTT connection error:", err);
});

mqttClient.on("close", () => {
  console.log("TTN MQTT connection closed. Retrying...");
});

mqttClient.on("reconnect", () => {
  console.log("Attempting to reconnect to TTN MQTT broker...");
});

// Helper function to convert number to hex string
const numberToHexString = (num) => {
  if (num <= 0) {
    return "00";
  }

  const byteCount = Math.ceil(Math.log2(num + 1) / 8);
  let hexString = "";

  for (let i = byteCount - 1; i >= 0; i--) {
    const byte = (num >> (8 * i)) & 0xff;
    hexString += byte.toString(16).padStart(2, "0");
  }

  return hexString;
};

// Downlink payload function
const downlinkPayload = (fPort, payload) => ({
  downlinks: [
    {
      f_port: fPort,
      frm_payload: Buffer.from(payload, "hex").toString("base64"),
      priority: "NORMAL",
    },
  ],
});

// Express app setup
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Fetch Data from CosmosDB
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

// API routes
app.get(`/api/${version}`, (req, res) => {
  res.json({ message: `Hello from HeriSureAR25-API ${version}` });
});

app.post(`/api/${version}/mqtt`, async (req, res) => {
  const downlinkTopic = `v3/${mqttAppId}@ttn/devices/${mqttDeviceId}/down/push`;
  const { fPort, command, value } = req.body;
  try {
    const payload = `${numberToHexString(command)}${numberToHexString(value)}`;

    mqttClient.publish(
      downlinkTopic,
      JSON.stringify(downlinkPayload(fPort, payload)),
      (err) => {
        if (err) {
          console.error("Failed to send downlink:", err);
          res.status(500).json({ error: "Failed to send downlink" });
        }
        console.log("Downlink sent successfully!");
        res.json({ message: "Downlink sent successfully" });
      }
    );
  } catch (error) {
    console.error("Error creating downlink payload:", error);
    res.status(500).json({ error: "Failed to create downlink payload" });
  }
});

app.get(`/api/${version}/logs`, async (req, res) => {
  const { timeStart, timeEnd } = req.query;

  try {
    const data = await fetchData(timeStart, timeEnd);
    res.json(data);
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json([]);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

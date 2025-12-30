// Load dependencies
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, Collection } = require("mongodb");

// Initialize app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB
const uri = process.env.uri;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("team-project");
    const usersCollection = db.collection("user");
    const menusCollection = db.collection("menus");
    const ordersCollection = db.collection("orders");

    // users data

    app.post("/users", async (req, res) => {
      const data = req.body;
      const result = await usersCollection.insertOne(data);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const cursor = await usersCollection.find().toArray();
      res.send(cursor);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ error: "User not found" });
      res.send(user);
    });

    app.put("/users/:uid", async (req, res) => {
      const { uid } = req.params;
      const updatedData = req.body;

      const result = await usersCollection.findOneAndUpdate(
        { uid },
        { $set: updatedData },
        { returnDocument: "after" }
      );

      if (!result.value)
        return res.status(404).json({ message: "User not found" });
      res.json(result.value);
    });

    // menus APIs
    app.get("/menus", async (req, res) => {
      const cursor = await menusCollection.find().toArray();
      res.send(cursor);
    });

    app.get("/menus/:id", async (req, res) => {
      const id = req.params.id;
      const menu = await menusCollection.findOne({ _id: id });
      if (!menu) return res.status(404).send({ error: "Menu not found" });
      res.send(menu);
    });

    // orders APIs
    app.post("/orders", async (req, res) => {
      const data = req.body;
      if (!data.userId || !data.menuId || !data.menuName || !data.price) {
        return res.status(400).send({ error: "Missing required order fields" });
      }
      const result = await ordersCollection.insertOne(data);
      res.send(result);
    });

    app.get("/orders", async (req, res) => {
      const orders = await ordersCollection.find().toArray();
      res.send(orders);
    });

    app.get("/orders/user/:userId", async (req, res) => {
      const userId = req.params.userId;
      const orders = await ordersCollection.find({ userId }).toArray();
      res.send(orders);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

// Routes
app.get("/", (req, res) => {
  res.send("Mal is running");
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

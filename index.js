// Load dependencies
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const Stripe = require("stripe");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Initialize app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gs1mqwb.mongodb.net/team-project?retryWrites=true&w=majority`;

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
    // await client.connect();

    const db = client.db("team-project");
    const usersCollection = db.collection("user");
    const menusCollection = db.collection("menus");
    const ordersCollection = db.collection("orders");
    const paymentsCollection = db.collection("payments");

    // Initialize Stripe
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

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

    app.patch("/users/:id/role", async (req, res) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        const allowedRoles = ["User", "Admin", "Food Seller"];
        if (!allowedRoles.includes(role)) {
          return res.status(400).send({ error: "Invalid role" });
        }

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid user ID" });
        }

        const result = await usersCollection.findOneAndUpdate(
          { _id: new ObjectId(id) }, // always valid ObjectId
          { $set: { role } },
          { returnDocument: "after" }
        );

        if (!result.value) {
          return res.status(404).send({ error: "User not found" });
        }

        res.status(200).send({
          success: true,
          message: "User role updated successfully",
          user: result.value,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Server error" });
      }
    });

    // menus APIs
    app.get("/menus", async (req, res) => {
      try {
        const menus = await menusCollection.find().toArray();
        res.send(menus);
      } catch {
        res.status(500).send({ error: "Failed to fetch menus" });
      }
    });

    app.get("/menus/:id", async (req, res) => {
      const { id } = req.params;
      const menu = await menusCollection.findOne({ _id: new ObjectId(id) });
      if (!menu) return res.status(404).send({ error: "Menu not found" });
      res.send(menu);
    });

    // orders APIs
    app.post("/orders", async (req, res) => {
      try {
        const {
          userId,
          username,
          email,
          menuId,
          menuName,
          price,
          quantity = 1,
          status = "pending",
          createdAt = new Date().toISOString(),
        } = req.body;

        if (!userId || !menuId || !menuName || !price) {
          return res
            .status(400)
            .send({ error: "Missing required order fields" });
        }

        const order = {
          userId,
          username,
          email,
          menuId,
          menuName,
          price,
          quantity,
          status,
          createdAt,
        };

        const result = await ordersCollection.insertOne(order);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to create order" });
      }
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

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
  }
}
run().catch(console.dir);

// Routes
app.get("/", (req, res) => {
  res.send("TastyHaat Server is running");
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
